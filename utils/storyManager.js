import { db, auth, storage } from './firebase';
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  query, 
  where, 
  getDocs, 
  onSnapshot, 
  doc, 
  updateDoc, 
  arrayUnion, 
  orderBy,
  limit,
  getDoc
} from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import earningsManager from './earningsManager';

class StoryManager {
  constructor() {
    this.storiesCollection = collection(db, 'stories');
  }

  /**
   * Fetch active, approved stories for a list of users
   * @param {Array} userIds List of user IDs to fetch stories for
   * @returns {Promise<Object>} Map of userId -> Array of active stories
   */
  async fetchActiveStories(userIds) {
    if (!userIds || userIds.length === 0) return {};

    const activeStories = {};
    
    // Firestore 'in' query is limited to 10-30 items depending on version, 
    // but here we usually have a localized list.
    const chunks = [];
    for (let i = 0; i < userIds.length; i += 10) {
      chunks.push(userIds.slice(i, i + 10));
    }

    const now = new Date();
    for (const chunk of chunks) {
      const q = query(
        this.storiesCollection,
        where('userId', 'in', chunk),
        where('status', '==', 'approved')
      );

      const querySnapshot = await getDocs(q);
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;
        
        // Filter by expiration client side
        if (expiresAt && expiresAt > now) {
          if (!activeStories[data.userId]) {
            activeStories[data.userId] = [];
          }
          activeStories[data.userId].push({ id: doc.id, ...data });
        }
      });
    }

    // Sort client side
    Object.keys(activeStories).forEach(uid => {
      activeStories[uid].sort((a, b) => {
        const timeA = a.createdAt?.toMillis?.() || 0;
        const timeB = b.createdAt?.toMillis?.() || 0;
        return timeA - timeB;
      });
    });

    return activeStories;
  }

  /**
   * Listen for active stories in real-time
   * @param {Array} userIds List of user IDs
   * @param {Function} callback Function to handle updates
   */
  subscribeToStories(userIds, callback) {
    if (!userIds || userIds.length === 0) {
      callback({});
      return () => {};
    }

    const unsubscribers = [];
    const resultsMap = {};

    const chunks = [];
    for (let i = 0; i < userIds.length; i += 10) {
      chunks.push(userIds.slice(i, i + 10));
    }

    chunks.forEach(chunk => {
      const q = query(
        this.storiesCollection,
        where('userId', 'in', chunk),
        where('status', '==', 'approved')
      );

      const unsub = onSnapshot(q, (snapshot) => {
        // Reset local map for this chunk
        chunk.forEach(id => { resultsMap[id] = []; });

        const now = new Date();
        snapshot.forEach(doc => {
          const data = doc.data();
          const expiresAt = data.expiresAt ? new Date(data.expiresAt) : null;

          // Filter by expiration client side
          if (expiresAt && expiresAt > now) {
            if (!resultsMap[data.userId]) resultsMap[data.userId] = [];
            resultsMap[data.userId].push({ id: doc.id, ...data });
          }
        });

        // Sort each array by createdAt client side
        Object.keys(resultsMap).forEach(uid => {
          resultsMap[uid].sort((a, b) => {
            const timeA = a.createdAt?.toMillis?.() || 0;
            const timeB = b.createdAt?.toMillis?.() || 0;
            return timeA - timeB;
          });
        });

        callback({ ...resultsMap });
      }, (err) => {
        console.warn("Friend story listener error:", err.message);
      });
      unsubscribers.push(unsub);
    });

    return () => unsubscribers.forEach(unsub => unsub());
  }

  /**
   * Mark a story as viewed
   */
  async markAsViewed(storyId, viewerId) {
    if (!storyId || !viewerId) return;

    try {
      const storyRef = doc(db, 'stories', storyId);
      const storySnap = await getDoc(storyRef);
      
      if (storySnap.exists()) {
        const data = storySnap.data();
        if (data.userId === viewerId) return; // Don't track own views
        
        const viewedBy = data.viewedBy || [];
        if (!viewedBy.includes(viewerId)) {
          await updateDoc(storyRef, {
            viewedBy: arrayUnion(viewerId),
            views: (data.views || 0) + 1
          });
        }
      }
    } catch (error) {
      console.error('Error marking story as viewed:', error);
    }
  }

  /**
   * Add a like to a story and trigger earnings
   */
  async likeStory(storyId, viewerId) {
    if (!storyId || !viewerId) return { success: false };

    try {
      const storyRef = doc(db, 'stories', storyId);
      const storySnap = await getDoc(storyRef);
      
      if (!storySnap.exists()) return { success: false, error: 'Story not found' };
      const storyData = storySnap.data();

      // Check if already liked
      const likedBy = storyData.likedBy || [];
      if (likedBy.includes(viewerId)) return { success: true, alreadyLiked: true };

      // Update story document
      await updateDoc(storyRef, {
        likedBy: arrayUnion(viewerId)
      });

      // Trigger earnings for the woman
      if (storyData.userId !== viewerId) {
        await earningsManager.addLikeEarnings(
          storyData.userId, 
          viewerId, 
          'story', 
          storyId
        );

        // Add to global likes collection for notifications
        const receiverDoc = await getDoc(doc(db, 'users', storyData.userId));
        if (receiverDoc.exists()) {
          const receiver = receiverDoc.data();
          const gender = (receiver.gender || '').toLowerCase();
          if (gender === 'woman') {
            await addDoc(collection(db, 'likes'), {
              senderId: viewerId,
              targetUserId: storyData.userId,
              contentUrl: storyData.videoUrl || '',
              contentType: 'story',
              createdAt: serverTimestamp(),
              read: false
            });
          }
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error liking story:', error);
      return { success: false, error: error.message };
    }
  }

  async unlikeStory(storyId, viewerId) {
    if (!storyId || !viewerId) return { success: false };

    try {
      const { arrayRemove } = await import('firebase/firestore');
      const storyRef = doc(db, 'stories', storyId);
      
      await updateDoc(storyRef, {
        likedBy: arrayRemove(viewerId)
      });

      return { success: true };
    } catch (error) {
      console.error('Error unliking story:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a story
   */
  async deleteStory(storyId) {
    try {
      // In a real app, we might want to also delete from storage, 
      // but here we'll just soft-delete/remove from Firestore.
      const { deleteDoc } = await import('firebase/firestore');
      await deleteDoc(doc(db, 'stories', storyId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting story:', error);
      return { success: false, error: error.message };
    }
  }
}

export const storyManager = new StoryManager();
export default storyManager;
