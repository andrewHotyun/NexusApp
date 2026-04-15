import { db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

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
  } catch (error) {
    console.error('Error fetching earnings rate:', error);
  }
  
  return 0.20; // Fallback to default
};
