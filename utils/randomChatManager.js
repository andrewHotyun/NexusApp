import { 
  collection, 
  addDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  updateDoc, 
  doc, 
  serverTimestamp,
  deleteDoc,
  getDoc,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { db, auth } from './firebase';

class RandomChatManager {
  constructor() {
    this.queueUnsub = null;
    this.currentQueueDocId = null;
  }

  normalizeGender(g) {
    if (!g || typeof g !== 'string') return '';
    const lower = g.toLowerCase();
    if (['male', 'm', 'man', 'boy', 'чоловік', 'хлопець', 'ч', 'чол', 'homme', 'hombre', 'männlich'].includes(lower)) return 'male';
    if (['female', 'f', 'woman', 'girl', 'жінка', 'дівчина', 'ж', 'жін', 'femme', 'mujer', 'weiblich'].includes(lower)) return 'female';
    return '';
  }

  // Check if two users are opposite genders
  isOppositeGender(g1, g2) {
    const norm1 = this.normalizeGender(g1);
    const norm2 = this.normalizeGender(g2);
    return (norm1 === 'male' && norm2 === 'female') || (norm1 === 'female' && norm2 === 'male');
  }

  async findMatch(userProfile, filters = {}) {
    const userId = auth.currentUser?.uid;
    if (!userId) return null;

    const myGender = this.normalizeGender(userProfile.gender || userProfile.sex);
    const myChatType = userProfile.chatType || 'normal';

    // 1. Try to find someone already waiting in the queue
    const q = query(
      collection(db, 'randomChatQueue'),
      where('status', '==', 'waiting'),
      limit(50)
    );

    const snapshot = await getDocs(q);
    
    // Sort client-side to find the oldest waiting user
    const sortedDocs = [...snapshot.docs].sort((a, b) => {
      const timeA = a.data().timestamp?.seconds || 0;
      const timeB = b.data().timestamp?.seconds || 0;
      return timeA - timeB;
    });

    // Search for a compatible partner in the sorted docs
    const partnerDoc = sortedDocs.find(d => {
      const data = d.data();
      if (data.userId === userId) return false;

      // Gender check (Male-Female only)
      const otherGender = this.normalizeGender(data.gender);
      if (!this.isOppositeGender(myGender, otherGender)) return false;

      // Chat type check (Strict)
      const otherChatType = data.chatType || 'normal';
      if (myChatType !== otherChatType) return false;

      // Location filters
      const filterCountry = (filters.country || '').trim().toLowerCase();
      const filterCity = (filters.city || '').trim().toLowerCase();
      
      if (filterCountry && (data.country || '').trim().toLowerCase() !== filterCountry) return false;
      if (filterCity && (data.city || '').trim().toLowerCase() !== filterCity) return false;

      return true;
    });

    if (partnerDoc) {
      const partnerData = partnerDoc.data();
      
      // Ensure I am removed from the queue so no one else matches with me
      await this.exitQueue();

      // Create a match document
      const matchRef = await addDoc(collection(db, 'randomChatMatches'), {
        users: [userId, partnerData.userId],
        deviceTypes: {
          [userId]: 'mobile', // We are on React Native
          [partnerData.userId]: partnerData.deviceType || 'desktop' // Assuming desktop if unknown, but should be passed from partner
        },
        createdAt: serverTimestamp(),
        status: 'active'
      });

      // Update partner's queue doc to notify them
      try {
        await updateDoc(partnerDoc.ref, {
          status: 'matched',
          matchId: matchRef.id
        });
      } catch (e) {
        console.warn('Partner left queue before match could be finalized:', e);
        try { await deleteDoc(matchRef); } catch(err){}
        return null;
      }

      // Fetch partner info for UI
      const partnerSnap = await getDoc(doc(db, 'users', partnerData.userId));
      const fullPartnerData = partnerSnap.exists() ? partnerSnap.data() : {};

      // Save to recent calls immediately
      this.saveToRecentCalls(userId, partnerData.userId, fullPartnerData.name || 'User', fullPartnerData.avatar || null, fullPartnerData.age || null);

      return {
        id: matchRef.id,
        role: 'caller',
        otherUserId: partnerData.userId,
        otherUserName: fullPartnerData.name || 'User',
        otherUserAvatar: fullPartnerData.avatar || null
      };
    }

    return null;
  }

  async enterQueue(userProfile, filters = {}, onMatch) {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    // Clean up any existing queue docs for this user first
    await this.exitQueue();

    const myGender = this.normalizeGender(userProfile.gender || userProfile.sex);
    const myChatType = userProfile.chatType || 'normal';

    const queueRef = await addDoc(collection(db, 'randomChatQueue'), {
      userId,
      status: 'waiting',
      timestamp: serverTimestamp(),
      country: userProfile.country ? userProfile.country.trim() : null,
      city: userProfile.city ? userProfile.city.trim() : null,
      gender: myGender,
      chatType: myChatType,
      deviceType: 'mobile'
    });

    this.currentQueueDocId = queueRef.id;

    // Listen for matching
    this.queueUnsub = onSnapshot(queueRef, async (snap) => {
      const data = snap.data();
      if (data && data.status === 'matched') {
        const matchDocId = data.matchId;
        const matchDoc = await getDoc(doc(db, 'randomChatMatches', matchDocId));
        
        if (matchDoc.exists()) {
          const matchData = matchDoc.data();
          const otherId = matchData.users.find(id => id !== userId);
          
          // Fetch other user's info to check filters
          const otherSnap = await getDoc(doc(db, 'users', otherId));
          const otherData = otherSnap.exists() ? otherSnap.data() : {};

          // FILTER CHECK: Ensure the person who matched me satisfies my filters
          const filterCountry = (filters.country || '').trim().toLowerCase();
          const filterCity = (filters.city || '').trim().toLowerCase();
          const otherCountry = (otherData.country || '').trim().toLowerCase();
          const otherCity = (otherData.city || '').trim().toLowerCase();

          const countryOk = filterCountry ? (otherCountry === filterCountry) : true;
          const cityOk = filterCity ? (otherCity === filterCity) : true;

          if (countryOk && cityOk) {
            onMatch({
              id: matchDoc.id,
              role: 'answerer',
              otherUserId: otherId,
              otherUserName: otherData.name || 'User',
              otherUserAvatar: otherData.avatar || null
            });
            
            // Save to recent calls immediately
            this.saveToRecentCalls(userId, otherId, otherData.name || 'User', otherData.avatar || null, otherData.age || null);
            
            // Remove from queue after matching
            await this.exitQueue();
          } else {
            // Skip this match and continue waiting
            try {
              await updateDoc(doc(db, 'randomChatMatches', matchDocId), { skippedBy: userId });
            } catch (e) {}
            
            // Re-enter queue to continue searching
            this.enterQueue(userProfile, filters, onMatch);
          }
        }
      }
    });

    return queueRef.id;
  }

  async exitQueue() {
    if (this.queueUnsub) {
      this.queueUnsub();
      this.queueUnsub = null;
    }

    const userId = auth.currentUser?.uid;
    if (userId) {
      try {
        const q = query(
          collection(db, 'randomChatQueue'),
          where('userId', '==', userId)
        );
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
      } catch (e) {
        console.warn("Error cleaning queue:", e);
      }
    }
    this.currentQueueDocId = null;
  }

  async saveToRecentCalls(myUserId, partnerId, partnerName, partnerAvatar, partnerAge) {
    try {
      const refId = `${myUserId}_${partnerId}`;
      const ref = doc(db, 'recentCalls', refId);
      
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) {
          transaction.set(ref, {
            userId: myUserId,
            partnerId: partnerId,
            partnerName: partnerName,
            partnerAvatar: partnerAvatar,
            partnerAge: partnerAge,
            timestamp: serverTimestamp(),
            callType: 'random'
          });
        } else {
          transaction.update(ref, {
            partnerName,
            partnerAvatar,
            partnerAge,
            timestamp: serverTimestamp()
          });
        }
      });
    } catch (e) {
      console.error("Error saving recent call:", e);
    }
  }
}

export const randomChatManager = new RandomChatManager();
