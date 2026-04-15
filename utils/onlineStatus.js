import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';
import i18next from 'i18next';

// Track user's online status (React Native compatible)
import { AppState } from 'react-native';

export const trackUserOnlineStatus = (userId) => {
  if (!userId) return null;

  const userRef = doc(db, 'users', userId);
  let heartbeatInterval;

  // Set user as online
  const setOnline = async () => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(userRef, {
        isOnline: true,
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      console.error('Error setting user online:', error);
    }
  };

  // Set user as offline
  const setOffline = async () => {
    if (!auth.currentUser) return;
    try {
      await updateDoc(userRef, {
        isOnline: false,
        lastSeen: serverTimestamp()
      });
    } catch (error) {
      // Ignore permission errors during logout/offline transition
      if (error.code !== 'permission-denied') {
        console.error('Error setting user offline:', error);
      }
    }
  };

  // Heartbeat to keep user online
  const startHeartbeat = () => {
    setOnline();
    heartbeatInterval = setInterval(() => {
      setOnline();
    }, 60000); // 1 minute interval (mobile-friendly)
  };

  // Stop heartbeat
  const stopHeartbeat = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  };

  startHeartbeat();

  // React Native: listen to app state changes (foreground/background)
  const handleAppStateChange = (nextAppState) => {
    if (nextAppState === 'active') {
      startHeartbeat();
    } else {
      stopHeartbeat();
      setOffline();
    }
  };

  const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

  const cleanup = () => {
    stopHeartbeat();
    setOffline();
    if (appStateSubscription && typeof appStateSubscription.remove === 'function') {
      appStateSubscription.remove();
    }
  };

  return cleanup;
};

// Get real-time online status for a user
export const getUserOnlineStatus = (userId, callback) => {
  if (!userId) return null;

  const userRef = doc(db, 'users', userId);

  return onSnapshot(userRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data();
      const now = new Date();

      let lastSeen = null;
      let isOnline = false;

      try {
        if (data.lastSeen) {
          if (data.lastSeen.toDate && typeof data.lastSeen.toDate === 'function') {
            lastSeen = data.lastSeen.toDate();
          } else if (data.lastSeen.seconds) {
            lastSeen = new Date(data.lastSeen.seconds * 1000);
          } else if (data.lastSeen instanceof Date) {
            lastSeen = data.lastSeen;
          } else if (typeof data.lastSeen === 'number') {
            lastSeen = new Date(data.lastSeen);
          }

          if (lastSeen && !isNaN(lastSeen.getTime())) {
            const diffMs = now - lastSeen;
            const diffMins = Math.floor(diffMs / 60000);

            if (diffMins < 1) {
              isOnline = true;
            }
          }
        }
      } catch (error) {
        console.error('Error processing lastSeen timestamp:', error, data.lastSeen);
        isOnline = false;
        lastSeen = null;
      }

      callback({
        isOnline: isOnline,
        lastSeen: data.lastSeen
      });
    } else {
      callback({
        isOnline: false,
        lastSeen: null
      });
    }
  }, (err) => {
    console.log('Online status listener error:', err);
    callback({ isOnline: false, lastSeen: null });
  });
};

// Format last seen timestamp
export const formatLastSeen = (timestamp) => {
  if (!timestamp) return null;

  try {
    const now = new Date();
    let lastSeen;

    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      lastSeen = timestamp.toDate();
    } else if (timestamp.seconds) {
      lastSeen = new Date(timestamp.seconds * 1000);
    } else if (timestamp instanceof Date) {
      lastSeen = timestamp;
    } else if (typeof timestamp === 'number') {
      lastSeen = new Date(timestamp);
    } else {
      return null;
    }

    if (isNaN(lastSeen.getTime())) return null;

    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / 60000);

    // If less than 1 minute - return null (show only online indicator)
    if (diffMins < 1) return null;

    const timeStr = lastSeen.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const isToday = lastSeen.toDateString() === today.toDateString();
    const isYesterday = lastSeen.toDateString() === yesterday.toDateString();

    if (isToday) {
      return i18next.t('last_seen.today', { time: timeStr });
    }

    if (isYesterday) {
      return i18next.t('last_seen.yesterday', { time: timeStr });
    }

    const dateStr = lastSeen.toLocaleDateString(i18next.language || 'en-US');
    return i18next.t('last_seen.on_date', { date: dateStr, time: timeStr });
  } catch (error) {
    console.error('Error formatting last seen timestamp:', error, timestamp);
    return null;
  }
};
