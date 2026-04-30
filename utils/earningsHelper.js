import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

/** 
 * Fetches the current earnings rate from admin settings.
 * Default is 0.20 if not set or if fetching fails.
 */
export const getEarningsRate = async () => {
  try {
    const rateDocRef = doc(db, 'adminSettings', 'earnings_settings');
    const snap = await getDoc(rateDocRef);

    if (snap.exists()) {
      const data = snap.data();
      if (typeof data.ratePerMinute === 'number' && data.ratePerMinute >= 0) {
        return data.ratePerMinute;
      }
    }
    return 0.20;
  } catch (error) {
    console.error('Error fetching earnings rate:', error);
    return 0.20;
  }
};

/**
 * Adds earnings for a female user after a completed call segment.
 */
export const addCallEarnings = async (femaleId, maleId, minutesToCharge, callId = null) => {
  if (minutesToCharge <= 0) return;
  const { addDoc, collection, serverTimestamp, getDoc, doc, updateDoc, increment } = require('firebase/firestore');

  try {
    const userRef = doc(db, 'users', femaleId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;

    const femaleData = userSnap.data();
    const normalizeGender = (g) => {
      if (!g || typeof g !== 'string') return '';
      const lower = g.toLowerCase();
      if (['female', 'f', 'woman', 'girl', 'жінка', 'дівчина', 'ж', 'жін', 'femme', 'mujer', 'weiblich'].includes(lower)) return 'female';
      return '';
    };

    if (normalizeGender(femaleData.gender || femaleData.sex) !== 'female') return;

    const rate = await getEarningsRate();
    const earningsAmount = minutesToCharge * rate;

    // Create a record in earnings collection
    await addDoc(collection(db, 'earnings'), {
      userId: femaleId,
      callPartnerId: maleId,
      callType: 'video',
      duration: minutesToCharge * 60,
      minutes: minutesToCharge,
      ratePerMinute: rate,
      earnings: earningsAmount,
      createdAt: serverTimestamp(),
      status: 'completed',
      callId: callId
    });

    // Update the female's total earnings and minutes Balance
    await updateDoc(userRef, {
      totalEarnings: increment(earningsAmount),
      totalMinutesEarned: increment(minutesToCharge),
      minutesBalance: increment(minutesToCharge),
      lastEarningsUpdate: serverTimestamp()
    });

  } catch (e) {
    console.error('Error adding call earnings:', e);
  }
};

