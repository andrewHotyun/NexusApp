import { db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

/**
 * Updates the 'conversations' collection with the latest message metadata.
 * This should be called every time a message is successfully sent.
 * 
 * @param {string} chatId - The ID of the chat (e.g. uid1_uid2)
 * @param {Array<string>} participants - Array of the two user IDs
 * @param {Object} messageData - The data of the message being sent
 */
export const updateConversation = async (chatId, participants, messageData) => {
  if (!chatId || !participants || !messageData) return;
  
  try {
    const conversationRef = doc(db, 'conversations', chatId);
    await setDoc(conversationRef, {
      id: chatId,
      participants: participants,
      lastMessage: {
        text: messageData.text || '',
        senderId: messageData.senderId,
        type: messageData.type || 'text',
        timestamp: serverTimestamp(),
        read: false
      },
      updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error('Failed to update conversation metadata:', error);
  }
};
