// ========================================
// RANDOM CHAT MATCHING SYSTEM
// ========================================
// Цей файл реалізує систему матчингу для RandomChat
// ВИКОРИСТОВУЄТЬСЯ В: RandomChat.js
//
// ОСНОВНІ ФУНКЦІЇ:
// 1. 🎲 Пошук доступних користувачів для відеодзвінків
// 2. 🔄 Створення пар між користувачами
// 3. 📍 Фільтрація за місцезнаходженням
// 4. 📝 Управління чергою очікування
// 5. 🎯 Створення матчів в базі даних

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
  runTransaction,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase';

class RandomChatMatching {
  constructor() {
    this.isProcessing = false;
  }

  // Додати користувача в чергу
  async addToQueue(userId, userName, userAvatar, locationFilter = {}) {
    try {
      const queueDoc = await addDoc(collection(db, 'randomChatQueue'), {
        userId,
        userName,
        userAvatar,
        status: 'waiting',
        timestamp: serverTimestamp(),
        locationFilter
      });

      return queueDoc;
    } catch (error) {
      console.error('❌ Error adding to queue:', error);
      throw error;
    }
  }

  // Знайти доступного користувача для матчу
  async findAvailableUser(currentUserId, locationFilter = {}) {
    try {
      // Шукаємо користувачів, які очікують в черзі
      const q = query(
        collection(db, 'randomChatQueue'),
        where('status', '==', 'waiting'),
        where('userId', '!=', currentUserId),
        orderBy('timestamp', 'asc'),
        limit(10)
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        return null;
      }

      // Фільтруємо за місцезнаходженням якщо потрібно
      let availableUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      if (locationFilter.country || locationFilter.city) {
        availableUsers = availableUsers.filter(user => {
          // Тут може бути реальна фільтрація за місцезнаходженням
          // Поки що повертаємо всіх доступних
          return true;
        });
      }

      if (availableUsers.length === 0) {
        return null;
      }

      // Вибираємо першого доступного користувача
      const selectedUser = availableUsers[0];

      return selectedUser;
    } catch (error) {
      console.error('❌ Error finding available user:', error);
      throw error;
    }
  }

  // Створити матч між двома користувачами
  async createMatch(user1, user2) {
    try {
      const matchDoc = await addDoc(collection(db, 'randomChatMatches'), {
        user1Id: user1.userId,
        user1Name: user1.userName,
        user1Avatar: user1.userAvatar,
        user2Id: user2.userId,
        user2Name: user2.userName,
        user2Avatar: user2.userAvatar,
        status: 'active',
        createdAt: serverTimestamp(),
        createdBy: 'matching_system'
      });

      // Оновлюємо статус користувачів в черзі
      await updateDoc(doc(db, 'randomChatQueue', user1.id), {
        status: 'matched',
        matchId: matchDoc.id,
        matchedAt: serverTimestamp()
      });

      await updateDoc(doc(db, 'randomChatQueue', user2.id), {
        status: 'matched',
        matchId: matchDoc.id,
        matchedAt: serverTimestamp()
      });

      return matchDoc;
    } catch (error) {
      console.error('❌ Error creating match:', error);
      throw error;
    }
  }

  // Видалити користувача з черги
  async removeFromQueue(queueDocId) {
    try {
      await deleteDoc(doc(db, 'randomChatQueue', queueDocId));
    } catch (error) {
      console.error('❌ Error removing from queue:', error);
    }
  }

  // Основний метод для пошуку та створення матчу
  async findAndCreateMatch(currentUserId, currentUserName, currentUserAvatar, locationFilter = {}) {
    if (this.isProcessing) {
      return null;
    }
    
    this.isProcessing = true;
    
    try {
      // Спочатку додаємо поточного користувача в чергу
      const queueDoc = await this.addToQueue(currentUserId, currentUserName, currentUserAvatar, locationFilter);
      
      // Шукаємо доступного користувача
      const availableUser = await this.findAvailableUser(currentUserId, locationFilter);
      
      if (!availableUser) {
        return { queueDoc, match: null };
      }
      
      // Створюємо матч
      const matchDoc = await this.createMatch(
        {
          userId: currentUserId,
          userName: currentUserName,
          userAvatar: currentUserAvatar,
          id: queueDoc.id
        },
        availableUser
      );
      
      return { queueDoc, match: matchDoc };
      
    } catch (error) {
      console.error('❌ Error in findAndCreateMatch:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  // Оновити статус матчу
  async updateMatchStatus(matchId, status, additionalData = {}) {
    try {
      const updateData = {
        status,
        updatedAt: serverTimestamp(),
        ...additionalData
      };

      await updateDoc(doc(db, 'randomChatMatches', matchId), updateData);
    } catch (error) {
      console.error('❌ Error updating match status:', error);
    }
  }

  // Отримати інформацію про матч
  async getMatch(matchId) {
    try {
      const matchDoc = await getDoc(doc(db, 'randomChatMatches', matchId));
      if (matchDoc.exists()) {
        return { id: matchDoc.id, ...matchDoc.data() };
      }
      return null;
    } catch (error) {
      console.error('❌ Error getting match:', error);
      return null;
    }
  }
}

// Експортуємо екземпляр класу
const randomChatMatching = new RandomChatMatching();
export default randomChatMatching;
