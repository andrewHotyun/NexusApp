import { db } from './firebase';
import { collection, addDoc, doc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore';

// Payout Manager - система виплат для мобільного додатка
class PayoutManager {
  constructor() {
    this.payoutsCollection = collection(db, 'payouts');
  }

  // Створення запиту на виплату
  async createPayoutRequest(userId, amount, payoutMethod, payoutDetails) {
    try {
      if (!userId) throw new Error('User ID is required');

      // 1. Отримуємо дані користувача
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        throw new Error('User not found');
      }

      const userData = userSnap.data();

      // 2. Перевірка статі (тільки для жінок)
      if (userData.gender !== 'woman') {
        throw new Error('Only women can request payouts');
      }

      // 3. Перевірка балансу
      const userEarnings = Number(userData.totalEarnings || 0);
      const withdrawalAmount = parseFloat(amount);

      if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
        throw new Error('Invalid withdrawal amount');
      }

      if (withdrawalAmount > userEarnings) {
        throw new Error('Insufficient earnings balance');
      }

      // 4. Ліміти ($10 - $1000)
      const minPayout = 10;
      const maxPayout = 1000;

      if (withdrawalAmount < minPayout) {
        throw new Error(`Minimum payout amount is $${minPayout}`);
      }

      if (withdrawalAmount > maxPayout) {
        throw new Error(`Maximum payout amount is $${maxPayout}`);
      }

      // 5. Створюємо об'єкт запиту
      const payoutRequest = {
        userId,
        amount: withdrawalAmount,
        payoutMethod, // 'card', 'paypal', 'crypto'
        payoutDetails, // Реквізити (JSON-рядок або текст)
        status: 'pending',
        createdAt: serverTimestamp(),
        processedAt: null,
        completedAt: null,
        adminNotes: '',
        transactionId: null,
        platform: 'mobile' 
      };

      // 6. Додаємо в колекцію payouts
      const docRef = await addDoc(this.payoutsCollection, payoutRequest);

      // 7. Списуємо баланс у користувача
      const newBalance = userEarnings - withdrawalAmount;
      await updateDoc(userRef, {
        totalEarnings: newBalance,
        lastPayoutRequest: serverTimestamp()
      });

      return {
        success: true,
        payoutId: docRef.id,
        newBalance: newBalance
      };

    } catch (error) {
      console.error('❌ Error creating payout request:', error);
      return { success: false, error: error.message };
    }
  }
}

export const payoutManager = new PayoutManager();
export default payoutManager;
