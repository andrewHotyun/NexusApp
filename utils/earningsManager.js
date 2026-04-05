import { db } from './firebase';
import { collection, addDoc, doc, updateDoc, getDoc, query, where, getDocs, serverTimestamp, orderBy, limit, onSnapshot, setDoc } from 'firebase/firestore';
import verificationManager from './verificationManager';

// Earnings Manager - система заробітку для дівчат
class EarningsManager {

  constructor() {
    this.earningsCollection = collection(db, 'earnings');
    this.usersCollection = collection(db, 'users');
    this.defaultRatePerMinute = 0.20; // $0.20 за хвилину (значення за замовчуванням)
    // Документ налаштувань з актуальною ставкою
    try {
      this.rateDocRef = doc(db, 'adminSettings', 'earnings_settings');
      onSnapshot(this.rateDocRef, (snap) => {
        try {
          const data = snap.exists() ? snap.data() : null;
          const r = (data && typeof data.ratePerMinute === 'number') ? data.ratePerMinute : null;
          if (r !== null && Number.isFinite(r) && r >= 0) {
            this.defaultRatePerMinute = r;
          }
        } catch (_) { }
      });
    } catch (_) { }
  }

  // Нарахування заробітку за дзвінок
  async addEarnings(userId, callDuration, callPartnerId, callType = 'video', callId = null) {
    try {
      // Перевіряємо чи користувач - дівчина
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error('User not found');
      }

      const userData = userSnap.data();

      // 1. Gender check (only women earn)
      if (userData.gender !== 'woman') {
        return { success: false, reason: 'Only women can earn money' };
      }

      // 2. Verification check
      const vStatus = userData.verificationStatus;
      const isLegacyVerified = userData.isVerified === true;

      // Explicit rejection always blocks
      const isExplicitlyRejected = vStatus === 'rejected' || vStatus === 'auto_rejected';

      // Consider verified if approved by AI, manually by admin, or has legacy status
      const isApproved = vStatus === 'approved' || vStatus === 'auto_approved' || isLegacyVerified;

      if (!isApproved || isExplicitlyRejected) {
        return {
          success: false,
          reason: 'Verification required to earn money',
          status: vStatus || (isLegacyVerified ? 'verified_legacy' : 'not_submitted')
        };
      }

      // 3. Call suspension check
      if (userData.callSuspended === true) {
        return { success: false, reason: 'Calls are suspended for this user' };
      }

      // Розраховуємо заробіток
      const minutes = Math.round(callDuration / 60); // Конвертуємо секунди в хвилини
      const earnings = minutes * this.defaultRatePerMinute;

      if (earnings <= 0) {
        return { success: false, reason: 'Call too short' };
      }

      // Створюємо запис про заробіток
      const earningsRecord = {
        userId,
        callPartnerId,
        callType,
        duration: callDuration, // в секундах
        minutes: minutes,
        ratePerMinute: this.defaultRatePerMinute,
        earnings: earnings,
        createdAt: serverTimestamp(),
        status: 'completed',
        callId: callId || null
      };

      const docRef = await addDoc(this.earningsCollection, earningsRecord);

      // Оновлюємо загальний баланс користувача
      await this.updateUserEarningsBalance(userId, earnings);

      // Перевіряємо автоматичну верифікацію після заробітку
      try {
        await verificationManager.checkAndVerifyUser(userId);
      } catch (verifyError) {}

      return {
        success: true,
        earningsId: docRef.id,
        earnings: earnings,
        minutes: minutes
      };
    } catch (error) {
      console.error('❌ Error adding earnings:', error);
      return { success: false, error: error.message };
    }
  }

  // Нарахування заробітку за лайк ($0.05)
  async addLikeEarnings(userId, callPartnerId, likeType, contentId) {
    try {
      // 1. Gender and existence check
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) throw new Error('User not found');
      const userData = userSnap.data();

      if (userData.gender !== 'woman') return { success: false, reason: 'Only women can earn money' };

      // 2. Verification check
      const vStatus = userData.verificationStatus;
      const isLegacyVerified = userData.isVerified === true;
      const isApproved = vStatus === 'approved' || vStatus === 'auto_approved' || isLegacyVerified;

      if (!isApproved) return { success: false, reason: 'Verification required' };

      // 3. Gender check for the liker (only men's likes pay)
      const likerSnap = await getDoc(doc(db, 'users', callPartnerId));
      if (!likerSnap.exists()) return { success: false, reason: 'Liker not found' };
      if (likerSnap.data().gender !== 'man') {
        return { success: false, reason: 'Only likes from men are paid' };
      }

      // 4. Duplicate check - has this man already paid for this specific content?
      const q = query(
        this.earningsCollection,
        where('userId', '==', userId),
        where('callPartnerId', '==', callPartnerId),
        where('type', '==', 'like'),
        where('contentId', '==', contentId)
      );
      const existingSnap = await getDocs(q);
      if (!existingSnap.empty) {
        return { success: false, reason: 'Already paid for this like' };
      }

      // 4. Record earnings
      const likeRate = 0.05;
      const earningsRecord = {
        userId,
        callPartnerId, // The person who liked
        type: 'like',
        likeSubtype: likeType, // 'story' or 'gallery'
        contentId,
        earnings: likeRate,
        createdAt: serverTimestamp(),
        status: 'completed'
      };

      const docRef = await addDoc(this.earningsCollection, earningsRecord);
      await this.updateUserEarningsBalance(userId, likeRate);

      return { success: true, earningsId: docRef.id };
    } catch (error) {
      console.error('❌ Error adding like earnings:', error);
      return { success: false, error: error.message };
    }
  }

  // Оновлення загального балансу заробітку користувача
  async updateUserEarningsBalance(userId, newEarnings) {
    try {
      const { increment } = await import('firebase/firestore');
      const userRef = doc(db, 'users', userId);

      await updateDoc(userRef, {
        totalEarnings: increment(newEarnings),
        lastEarningsUpdate: serverTimestamp()
      });
    } catch (error) {
      console.error('❌ Error updating earnings balance:', error);
    }
  }

  // Отримання статистики заробітку користувача
  async getUserEarningsStats(userId, weekOffset = 0) {
    try {
      const { start, end } = this.getWeekDates(weekOffset);
      let querySnapshot;
      try {
        const q = query(
          this.earningsCollection,
          where('userId', '==', userId),
          where('createdAt', '>=', start),
          where('createdAt', '<=', end),
          orderBy('createdAt', 'desc')
        );
        querySnapshot = await getDocs(q);
      } catch (err) {
        // Fallback: avoid composite index by querying by userId only and filtering in memory
        const q2 = query(
          this.earningsCollection,
          where('userId', '==', userId)
        );
        const snap2 = await getDocs(q2);
        // Emulate a snapshot-like array
        querySnapshot = { forEach: (cb) => snap2.forEach(cb) };
      }

      const earnings = [];
      let totalEarnings = 0;
      let totalMinutes = 0;

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.() || new Date(0);
        if (createdAt >= start && createdAt <= end && data.status !== 'annulled') {
          earnings.push({
            id: doc.id,
            ...data,
            createdAt
          });
          totalEarnings += data.earnings || 0;
          totalMinutes += data.minutes || 0;
        }
      });

      return {
        success: true,
        earnings,
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalMinutes,
        weekStart: start,
        weekEnd: end
      };

    } catch (error) {
      console.error('❌ Error getting user earnings stats:', error);
      return { success: false, error: error.message };
    }
  }

  // Отримання загальної статистики заробітку
  async getTotalEarningsStats(userId) {
    try {
      let querySnapshot;
      try {
        const q = query(
          this.earningsCollection,
          where('userId', '==', userId),
          orderBy('createdAt', 'desc')
        );
        querySnapshot = await getDocs(q);
      } catch (err) {
        const q2 = query(
          this.earningsCollection,
          where('userId', '==', userId)
        );
        querySnapshot = await getDocs(q2);
      }
      let totalEarnings = 0;
      let totalMinutes = 0;
      let totalCalls = 0;

      const uniqueCallIds = new Set();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status !== 'annulled') {
          totalEarnings += Number(data.earnings) || 0;
          
          // Only count minutes and calls if it's NOT a gift, like, or bonus
          if (data.type !== 'gift' && data.type !== 'like' && data.callType !== 'bonus' && data.type !== 'bonus') {
            totalMinutes += Number(data.minutes) || 0;
            if (data.callId) {
              uniqueCallIds.add(data.callId);
            } else {
              totalCalls++; // Fallback for calls without callId (legacy)
            }
          }
        }
      });

      const finalCallCount = uniqueCallIds.size + totalCalls;

      return {
        success: true,
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        totalMinutes,
        totalCalls: finalCallCount,
        averagePerCall: finalCallCount > 0 ? parseFloat((totalEarnings / finalCallCount).toFixed(2)) : 0
      };

    } catch (error) {
      console.error('❌ Error getting total earnings stats:', error);
      return { success: false, error: error.message };
    }
  }

  // Отримання статистики витрат чоловіка (на основі записів заробітку дівчат)
  async getPartnerSpentStats(partnerId) {
    try {
      const q = query(
        this.earningsCollection,
        where('callPartnerId', '==', partnerId)
      );
      const querySnapshot = await getDocs(q);
      let totalMinutesSpent = 0;

      const uniqueCallIds = new Set();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        if (data.status !== 'annulled' && data.type !== 'gift' && data.type !== 'like' && data.callType !== 'bonus' && data.type !== 'bonus') {
          totalMinutesSpent += (Number(data.minutes) || 0);
          if (data.callId) uniqueCallIds.add(data.callId);
        }
      });

      return {
        success: true,
        totalMinutesSpent
      };

    } catch (error) {
      console.error('❌ Error getting partner spent stats:', error);
      return { success: false, totalMinutesSpent: 0, error: error.message };
    }
  }

  // Розрахунок дат тижня
  getWeekDates(weekOffset) {
    const now = new Date();
    const currentDay = now.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1; // Monday is 1, Sunday is 0

    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { start: monday, end: sunday };
  }

  // Отримання ставки за хвилину
  getRatePerMinute() {
    return this.defaultRatePerMinute;
  }

  // Встановлення нової ставки (для адміна)
  async setRatePerMinute(newRate) {
    try {
      const r = parseFloat(newRate);
      if (!Number.isFinite(r) || r < 0) return;
      this.defaultRatePerMinute = r;
      // Persist to Firestore so всі клієнти отримають оновлення
      await setDoc(this.rateDocRef, {
        ratePerMinute: r,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      console.error('❌ Error setting earnings rate:', error);
    }
  }

  // Отримання всіх заробітків для адмін панелі
  async getAllEarnings() {
    try {
      const q = query(
        this.earningsCollection,
        orderBy('createdAt', 'desc'),
        limit(100)
      );

      const querySnapshot = await getDocs(q);
      const earnings = [];

      querySnapshot.forEach((doc) => {
        earnings.push({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        });
      });

      return { success: true, earnings };

    } catch (error) {
      console.error('❌ Error getting all earnings:', error);
      return { success: false, error: error.message };
    }
  }

  // Direct bonus for Easter Egg rewards (adds earnings without a call)
  async addDirectBonus(userId, amountUSD, reason = 'easter_egg') {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) return { success: false, reason: 'User not found' };

      // Create earnings record
      await addDoc(this.earningsCollection, {
        userId,
        callPartnerId: 'system',
        callType: 'bonus',
        duration: 0,
        minutes: 0,
        ratePerMinute: 0,
        earnings: amountUSD,
        createdAt: serverTimestamp(),
        status: 'completed',
        bonusReason: reason
      });

      // Update balance
      await this.updateUserEarningsBalance(userId, amountUSD);

      return { success: true, earnings: amountUSD };
    } catch (error) {
      console.error('❌ Error adding direct bonus:', error);
      return { success: false, error: error.message };
    }
  }
}

// Експортуємо singleton
export const earningsManager = new EarningsManager();
export default earningsManager;
