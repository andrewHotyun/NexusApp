import { db } from './firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// Verification Manager - система автоматичної верифікації дівчат
class VerificationManager {
  
  constructor() {
    // Критерії для автоматичної верифікації
    this.verificationCriteria = {
      minDaysSinceRegistration: 7, // Мінімум 7 днів на платформі
      minCallsCount: 20, // Мінімум 20 дзвінків
      minSuccessfulPayouts: 2, // Мінімум 2 успішні виплати
      minTotalEarnings: 50, // Мінімум $50 заробітку
      noComplaints: true // Без скарг
    };
  }

  // Автоматична перевірка чи користувач досяг критеріїв верифікації
  async checkAndVerifyUser(userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        return { success: false, error: 'User not found' };
      }

      const userData = userSnap.data();
      
      // Тільки для жінок
      if (userData.gender !== 'woman') {
        return { success: false, reason: 'Only women can be verified' };
      }

      // Якщо вже верифікований - пропускаємо
      if (userData.isVerified) {
        return { success: true, alreadyVerified: true };
      }

      // Перевіряємо критерії верифікації
      const verificationStatus = await this.checkVerificationCriteria(userData, userId);
      
      if (verificationStatus.canBeVerified) {
        // Автоматично верифікуємо
        await this.verifyUser(userId, verificationStatus);

        return { 
          success: true, 
          verified: true,
          verificationLevel: 'automatic',
          criteria: verificationStatus
        };
      }

      return { 
        success: true, 
        verified: false,
        criteria: verificationStatus
      };

    } catch (error) {
      console.error('❌ Error checking verification:', error);
      return { success: false, error: error.message };
    }
  }

  // Перевірка критеріїв верифікації
  async checkVerificationCriteria(userData, userId) {
    try {
      // День реєстрації
      const registrationDate = userData.createdAt?.toDate();
      const now = new Date();
      const daysSinceRegistration = registrationDate 
        ? Math.floor((now - registrationDate) / (1000 * 60 * 60 * 24))
        : 0;

      // Статистика дзвінків (потрібно отримати з earnings)
      const callsCount = userData.totalCalls || 0;
      
      // Кількість успішних виплат (потрібно отримати з payouts)
      const successfulPayouts = userData.successfulPayouts || 0;

      // Загальний заробіток
      const totalEarnings = userData.totalEarnings || 0;

      // Перевірка на скарги (потрібно отримати з complaints)
      const hasComplaints = userData.hasComplaints || false;

      const criteria = {
        daysSinceRegistration,
        callsCount,
        successfulPayouts,
        totalEarnings,
        hasComplaints,
        canBeVerified: false,
        reasons: []
      };

      // Перевіряємо кожен критерій
      if (daysSinceRegistration >= this.verificationCriteria.minDaysSinceRegistration) {
        criteria.reasons.push('✓ Registration period passed');
      } else {
        criteria.reasons.push(`✗ Minimum ${this.verificationCriteria.minDaysSinceRegistration} days required (${daysSinceRegistration} days)`);
      }

      if (callsCount >= this.verificationCriteria.minCallsCount) {
        criteria.reasons.push('✓ Calls count achieved');
      } else {
        criteria.reasons.push(`✗ Minimum ${this.verificationCriteria.minCallsCount} calls required (${callsCount} calls)`);
      }

      if (successfulPayouts >= this.verificationCriteria.minSuccessfulPayouts) {
        criteria.reasons.push('✓ Successful payouts achieved');
      } else {
        criteria.reasons.push(`✗ Minimum ${this.verificationCriteria.minSuccessfulPayouts} payouts required (${successfulPayouts} payouts)`);
      }

      if (totalEarnings >= this.verificationCriteria.minTotalEarnings) {
        criteria.reasons.push('✓ Total earnings achieved');
      } else {
        criteria.reasons.push(`✗ Minimum $${this.verificationCriteria.minTotalEarnings} required ($${totalEarnings.toFixed(2)})`);
      }

      if (!hasComplaints) {
        criteria.reasons.push('✓ No complaints');
      } else {
        criteria.reasons.push('✗ Has complaints');
      }

      // Перевіряємо чи всі критерії виконані
      criteria.canBeVerified = (
        daysSinceRegistration >= this.verificationCriteria.minDaysSinceRegistration &&
        callsCount >= this.verificationCriteria.minCallsCount &&
        successfulPayouts >= this.verificationCriteria.minSuccessfulPayouts &&
        totalEarnings >= this.verificationCriteria.minTotalEarnings &&
        !hasComplaints
      );

      return criteria;

    } catch (error) {
      console.error('❌ Error checking criteria:', error);
      return { canBeVerified: false, error: error.message };
    }
  }

  // Верифікація користувача
  async verifyUser(userId, verificationStatus) {
    try {
      const userRef = doc(db, 'users', userId);

      await updateDoc(userRef, {
        isVerified: true,
        verifiedAt: serverTimestamp(),
        verificationLevel: 'automatic',
        verificationMethod: 'reputation',
        verificationCriteria: verificationStatus
      });

      return { success: true };
    } catch (error) {
      console.error('❌ Error verifying user:', error);
      return { success: false, error: error.message };
    }
  }

  // Ручна верифікація (для адміністраторів)
  async manualVerifyUser(userId, adminNotes = '') {
    try {
      const userRef = doc(db, 'users', userId);

      await updateDoc(userRef, {
        isVerified: true,
        verifiedAt: serverTimestamp(),
        verificationLevel: 'manual',
        verificationMethod: 'admin_review',
        adminVerificationNotes: adminNotes
      });

      return { success: true };
    } catch (error) {
      console.error('❌ Error manual verifying user:', error);
      return { success: false, error: error.message };
    }
  }

  // Відкликання верифікації
  async revokeVerification(userId, reason = '') {
    try {
      const userRef = doc(db, 'users', userId);

      await updateDoc(userRef, {
        isVerified: false,
        verificationRevokedAt: serverTimestamp(),
        verificationRevokeReason: reason
      });

      return { success: true };
    } catch (error) {
      console.error('❌ Error revoking verification:', error);
      return { success: false, error: error.message };
    }
  }

  // Отримання статусу верифікації користувача
  async getVerificationStatus(userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        return { success: false, error: 'User not found' };
      }

      const userData = userSnap.data();
      
      if (userData.gender !== 'woman') {
        return { 
          success: true, 
          isVerified: false,
          reason: 'Only women can be verified'
        };
      }

      const verificationStatus = userData.isVerified 
        ? { 
            success: true, 
            isVerified: true,
            verifiedAt: userData.verifiedAt?.toDate(),
            verificationLevel: userData.verificationLevel || 'unknown',
            verificationMethod: userData.verificationMethod || 'unknown'
          }
        : await this.checkVerificationCriteria(userData, userId);

      return verificationStatus;

    } catch (error) {
      console.error('❌ Error getting verification status:', error);
      return { success: false, error: error.message };
    }
  }
}

// Експортуємо singleton
const verificationManager = new VerificationManager();
export default verificationManager;


