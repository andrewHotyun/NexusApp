import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from './firebase';
import { 
  collection, query, where, onSnapshot, doc, getDoc, limit, orderBy,
  setDoc, serverTimestamp, deleteDoc
} from 'firebase/firestore';
import VideoCallModal from '../components/chat/VideoCallModal';
import GlobalIncomingCall from '../components/chat/GlobalIncomingCall';
import { useTranslation } from 'react-i18next';

/**
 * AppDataProvider — Centralized Firestore listener manager.
 * 
 * Eliminates duplicate listeners across tabs by providing a single source of truth for:
 * - User profile
 * - Friends list
 * - Friend requests (incoming + sent)
 * - Blocks (bidirectional)
 * - Stories (active + unviewed)
 * - Unread messages count
 * - Likes count
 * - Online status cache
 * - Daily earnings (for women)
 */

const AppDataContext = createContext(null);

export const useAppData = () => {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error('useAppData must be used within AppDataProvider');
  }
  return ctx;
};

// Shared in-memory online status cache
const onlineStatusCache = {};

export function AppDataProvider({ children, userId }) {
  const { t } = useTranslation();
  // ── Core user data ──
  const [userProfile, setUserProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);

  // ── Friends ──
  const [friendIds, setFriendIds] = useState([]);
  const [friendsRaw, setFriendsRaw] = useState([]); // full friend docs
  const [friendsCount, setFriendsCount] = useState(0);

  // ── Requests ──
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [requestsCount, setRequestsCount] = useState(0);

  // ── Blocks ──
  const [myBlockedIds, setMyBlockedIds] = useState([]);
  const [blockedMeIds, setBlockedMeIds] = useState([]);

  // ── Stories ──
  const [activeStoryUserIds, setActiveStoryUserIds] = useState(new Set());
  const [unviewedStoryUserIds, setUnviewedStoryUserIds] = useState(new Set());
  const [storiesCount, setStoriesCount] = useState(0);

  // ── Messages ──
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);

  // ── Likes ──
  const [likesCount, setLikesCount] = useState(0);

  // ── Daily Stats (women) ──
  const [dailyStats, setDailyStats] = useState({ minutes: 0, earnings: 0 });

  // ── Online status batch cache ──
  const [onlineUsers, setOnlineUsers] = useState({});
  const onlineUnsubsRef = useRef([]);

  // ── Incoming Call ──
  const [activeIncomingCall, setActiveIncomingCall] = useState(null);

  // ── Persistent Global Video Call State ──
  const [isVideoCallVisible, setIsVideoCallVisible] = useState(false);
  const [currentCallId, setCurrentCallId] = useState(null);
  const [isCaller, setIsCaller] = useState(false);
  const [callPartner, setCallPartner] = useState(null);
  
  const startGlobalCall = useCallback((callId, isCallerRole, partnerData) => {
    setCurrentCallId(callId);
    setIsCaller(isCallerRole);
    setCallPartner(partnerData);
    setIsVideoCallVisible(true);
  }, []);

  const endGlobalCall = useCallback(() => {
    setIsVideoCallVisible(false);
    setCurrentCallId(null);
    setIsCaller(false);
    setCallPartner(null);
  }, []);

  // ── Midnight reset ──
  const [currentDateKey, setCurrentDateKey] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });

  // friendIds ref for story listener closure
  const friendIdsRef = useRef([]);
  useEffect(() => { friendIdsRef.current = friendIds; }, [friendIds]);

  // ──────────────────────────────────────
  // Load cached badge counts for instant UI
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    AsyncStorage.getItem(`badge_counts_${userId}`).then(cached => {
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed.req !== undefined) setRequestsCount(parsed.req);
          if (parsed.fri !== undefined) setFriendsCount(parsed.fri);
          if (parsed.unread !== undefined) setUnreadMessagesCount(parsed.unread);
          if (parsed.likes !== undefined) setLikesCount(parsed.likes);
          if (parsed.stories !== undefined) setStoriesCount(parsed.stories);
        } catch (e) {}
      }
    });
  }, [userId]);

  // ──────────────────────────────────────
  // Persist badge counts (debounced)
  // ──────────────────────────────────────
  const saveBadgeTimeout = useRef(null);
  const saveBadgeCounts = useCallback((counts) => {
    if (saveBadgeTimeout.current) clearTimeout(saveBadgeTimeout.current);
    saveBadgeTimeout.current = setTimeout(() => {
      if (userId) {
        AsyncStorage.setItem(`badge_counts_${userId}`, JSON.stringify(counts)).catch(() => {});
      }
    }, 1000);
  }, [userId]);

  // ──────────────────────────────────────
  // Midnight checker (every 60s)
  // ──────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const nowMs = now.getTime();
      if (nowMs !== currentDateKey) {
        setCurrentDateKey(nowMs);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [currentDateKey]);

  // ──────────────────────────────────────
  // 1. USER PROFILE (single listener)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setUserProfile(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const unsubscribe = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        setUserProfile({ uid: userId, ...docSnap.data() });
      }
      setProfileLoading(false);
    }, (err) => {
      console.warn('[AppData] Profile listener error:', err);
      setProfileLoading(false);
    });

    return () => unsubscribe();
  }, [userId]);

  // ──────────────────────────────────────
  // 2. FRIENDS (single listener)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setFriendIds([]);
      setFriendsRaw([]);
      setFriendsCount(0);
      return;
    }

    const q = query(collection(db, 'friends'), where('userId', '==', userId));
    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const ids = docs.map(d => d.friendId);
      setFriendsRaw(docs);
      setFriendIds(ids);
      const count = ids.length;
      setFriendsCount(count);
      saveBadgeCounts(prev => ({ ...prev, fri: count }));
    }, (err) => console.warn('[AppData] Friends listener error:', err));

    return () => unsub();
  }, [userId]);

  // ──────────────────────────────────────
  // 3. BLOCKS (single listener, bidirectional)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setMyBlockedIds([]);
      setBlockedMeIds([]);
      return;
    }

    const unsub1 = onSnapshot(
      query(collection(db, 'blocks'), where('blockerId', '==', userId)),
      (snap) => setMyBlockedIds(snap.docs.map(d => d.data().blockedId)),
      (err) => console.warn('[AppData] MyBlocks listener error:', err)
    );

    const unsub2 = onSnapshot(
      query(collection(db, 'blocks'), where('blockedId', '==', userId)),
      (snap) => setBlockedMeIds(snap.docs.map(d => d.data().blockerId)),
      (err) => console.warn('[AppData] BlockedMe listener error:', err)
    );

    return () => { unsub1(); unsub2(); };
  }, [userId]);

  // ──────────────────────────────────────
  // 4. FRIEND REQUESTS (single listener each)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setIncomingRequests([]);
      setSentRequests([]);
      setRequestsCount(0);
      return;
    }

    const qIncoming = query(
      collection(db, 'friendRequests'),
      where('toUserId', '==', userId),
      where('status', '==', 'pending')
    );
    const unsub1 = onSnapshot(qIncoming, (snap) => {
      const reqs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setIncomingRequests(reqs);
      const count = reqs.length;
      setRequestsCount(count);
      saveBadgeCounts(prev => ({ ...prev, req: count }));
    }, (err) => console.warn('[AppData] IncomingReqs listener error:', err));

    const qSent = query(
      collection(db, 'friendRequests'),
      where('fromUserId', '==', userId),
      where('status', '==', 'pending')
    );
    const unsub2 = onSnapshot(qSent, (snap) => {
      const reqs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setSentRequests(reqs);
    }, (err) => console.warn('[AppData] SentReqs listener error:', err));

    return () => { unsub1(); unsub2(); };
  }, [userId]);

  // ──────────────────────────────────────
  // 5. UNREAD MESSAGES COUNT (single listener)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setUnreadMessagesCount(0);
      return;
    }

    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', userId),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const uniqueSenders = new Set(snap.docs.map(d => d.data().senderId));
      const count = uniqueSenders.size;
      setUnreadMessagesCount(count);
      saveBadgeCounts(prev => ({ ...prev, unread: count }));
    }, (err) => console.warn('[AppData] UnreadMessages listener error:', err));

    return () => unsub();
  }, [userId]);

  // ──────────────────────────────────────
  // 6. LIKES COUNT (single listener)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setLikesCount(0);
      return;
    }

    const q = query(
      collection(db, 'likes'),
      where('targetUserId', '==', userId),
      where('read', '==', false)
    );
    const unsub = onSnapshot(q, (snap) => {
      const count = snap.docs.length;
      setLikesCount(count);
      saveBadgeCounts(prev => ({ ...prev, likes: count }));
    }, (err) => console.warn('[AppData] Likes listener error:', err));

    return () => unsub();
  }, [userId]);

  // ──────────────────────────────────────
  // 7. STORIES (SINGLE listener for all)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setActiveStoryUserIds(new Set());
      setUnviewedStoryUserIds(new Set());
      setStoriesCount(0);
      return;
    }

    const q = query(
      collection(db, 'stories'),
      where('status', '==', 'approved')
    );

    const unsub = onSnapshot(q, (snap) => {
      const now = new Date();
      const activeIds = new Set();
      const unviewedIds = new Set();
      let friendUnviewedCount = 0;

      snap.docs.forEach(d => {
        const data = d.data();
        const expiresAt = data.expiresAt
          ? (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt))
          : null;
        const viewedBy = data.viewedBy || [];

        if (expiresAt && expiresAt > now) {
          activeIds.add(data.userId);

          if (!viewedBy.includes(userId)) {
            unviewedIds.add(data.userId);
            // Count unique friend story posters for badge
            if (friendIdsRef.current.includes(data.userId)) {
              friendUnviewedCount++;
            }
          }
        }
      });

      setActiveStoryUserIds(activeIds);
      setUnviewedStoryUserIds(unviewedIds);
      
      // Count unique friends with unviewed stories
      const uniqueFriendPosters = new Set();
      snap.docs.forEach(d => {
        const data = d.data();
        const expiresAt = data.expiresAt
          ? (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt))
          : null;
        if (expiresAt && expiresAt > now && friendIdsRef.current.includes(data.userId) && !data.viewedBy?.includes(userId)) {
          uniqueFriendPosters.add(data.userId);
        }
      });
      const sCount = uniqueFriendPosters.size;
      setStoriesCount(sCount);
      saveBadgeCounts(prev => ({ ...prev, stories: sCount }));
    }, (err) => console.warn('[AppData] Stories listener error:', err));

    return () => unsub();
  }, [userId]);

  // ──────────────────────────────────────
  // 8. DAILY EARNINGS (women only, conditional)
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId || !userProfile || userProfile.gender !== 'woman') {
      setDailyStats({ minutes: 0, earnings: 0 });
      return;
    }

    const today = new Date(currentDateKey);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const q = query(
      collection(db, 'earnings'),
      where('userId', '==', userId)
    );

    const unsub = onSnapshot(q, {
      next: (snap) => {
        let totalMinutes = 0;
        let totalEarnings = 0;
        snap.forEach((d) => {
          const data = d.data();
          const createdAt = data.createdAt?.toDate?.() || new Date(0);
          if (createdAt >= today && createdAt < tomorrow && data.status !== 'annulled') {
            totalMinutes += data.minutes || 0;
            totalEarnings += data.earnings || 0;
          }
        });
        setDailyStats({ minutes: totalMinutes, earnings: totalEarnings });
      },
      error: (err) => {
        if (err.code !== 'permission-denied') {
          console.error('[AppData] Daily stats error:', err);
        }
      }
    });

    return () => unsub();
  }, [userId, userProfile?.gender, currentDateKey]);

  // ──────────────────────────────────────
  // 9. GLOBAL INCOMING CALL LISTENER
  // ──────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setActiveIncomingCall(null);
      return;
    }

    const q = query(
      collection(db, 'calls'),
      where('calleeId', '==', userId),
      where('status', '==', 'ringing')
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        // Take the latest ringing call
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const latestCall = docs.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))[0];
        setActiveIncomingCall(latestCall);
      } else {
        setActiveIncomingCall(null);
      }
    }, (err) => console.warn('[AppData] Global call listener error:', err));

    return () => unsub();
  }, [userId]);

  // ──────────────────────────────────────
  // 9b. GLOBAL CALL SYSTEM MESSAGES LISTENER
  //     Mirrors browser App.js logic: creates deterministic
  //     call messages so they appear in chat on BOTH platforms.
  // ──────────────────────────────────────
  const processedCallStartsRef = useRef(new Set());
  const processedCallEndsRef = useRef(new Set());

  useEffect(() => {
    if (!userId) return;

    const getChatId = (uid1, uid2) => {
      if (!uid1 || !uid2) return null;
      return [uid1, uid2].sort().join('_');
    };

    const q = query(
      collection(db, 'calls'),
      where('participants', 'array-contains', userId)
    );

    const unsub = onSnapshot(q, (snap) => {
      // Process ringing docs → create "Started a video call" message
      const ringingDocs = snap.docs.filter(d => {
        const data = d.data();
        if (data?.status !== 'ringing') return false;
        // Skip calls older than 15 minutes to prevent mass-processing on boot
        const now = Date.now();
        const createdAt = data.createdAt?.toMillis?.() || (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : now);
        return (now - createdAt) < 15 * 60 * 1000;
      });

      for (const d of ringingDocs) {
        const id = d.id;
        if (!processedCallStartsRef.current.has(id)) {
          const data = d.data();
          // Only the CALLER creates the message (prevents duplicates)
          if (data.callerId === userId) {
            const messageId = `call_${id}_started`;
            const docRef = doc(db, 'messages', messageId);
            setDoc(docRef, {
              chatId: getChatId(data.callerId, data.calleeId),
              senderId: data.callerId,
              receiverId: data.calleeId,
              participants: [data.callerId, data.calleeId],
              text: '📞 ' + t('chat.started_a_video_call'),
              timestamp: data.createdAt || serverTimestamp(),
              read: true,
              type: 'call',
              callId: id,
              callType: 'video'
            }, { merge: true }).catch(() => {});
          }
          processedCallStartsRef.current.add(id);
        }
      }

      // Process ended/declined docs → create system message
      const endedDocs = snap.docs.filter(d => {
        const data = d.data();
        const s = data?.status;
        if (s !== 'ended' && s !== 'declined') return false;
        // Skip calls older than 15 minutes to prevent mass-processing on boot
        const now = Date.now();
        const createdAt = data.createdAt?.toMillis?.() || (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : now);
        return (now - createdAt) < 15 * 60 * 1000;
      });

      for (const d of endedDocs) {
        const id = d.id;
        if (!processedCallEndsRef.current.has(id)) {
          const data = d.data() || {};
          const chatId = getChatId(data.callerId, data.calleeId);

          // Only the CALLER creates the ended/declined system message
          if (data.callerId === userId) {
            const callerId = data.callerId;
            const calleeId = data.calleeId;
            if (callerId && calleeId) {
              const messageId = `call_${id}_${data.status}`;
              const messageText = data.status === 'declined'
                ? '📞 ' + t('chat.video_call_declined')
                : '📞 ' + t('chat.video_call_ended');

              const senderId = data.endedBy || (data.status === 'declined' ? calleeId : callerId);
              const receiverId = senderId === callerId ? calleeId : callerId;

              const docRef = doc(db, 'messages', messageId);
              setDoc(docRef, {
                chatId,
                senderId,
                receiverId,
                participants: [callerId, calleeId],
                text: messageText,
                timestamp: serverTimestamp(),
                read: true,
                type: 'call',
                callId: id,
                callType: 'video'
              }, { merge: true }).catch(() => {});
            }
          }

          processedCallEndsRef.current.add(id);
        }
      }
    }, (err) => console.warn('[AppData] Call messages listener error:', err));

    return () => unsub();
  }, [userId]);

  // ──────────────────────────────────────
  // 10. BATCHED ONLINE STATUS
  // ──────────────────────────────────────
  const trackOnlineStatusForUsers = useCallback((userIds) => {
    // Clean up previous subscriptions
    onlineUnsubsRef.current.forEach(u => u && u());
    onlineUnsubsRef.current = [];

    if (!userIds || userIds.length === 0) return;

    // Only subscribe to unique IDs we're not already tracking
    const uniqueIds = [...new Set(userIds)].filter(id => id && id !== userId);

    uniqueIds.forEach(uid => {
      const unsub = onSnapshot(doc(db, 'users', uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const now = new Date();
          let isOnline = false;

          if (data.lastSeen) {
            let lastSeen = null;
            if (data.lastSeen.toDate && typeof data.lastSeen.toDate === 'function') {
              lastSeen = data.lastSeen.toDate();
            } else if (data.lastSeen.seconds) {
              lastSeen = new Date(data.lastSeen.seconds * 1000);
            }

            if (lastSeen && !isNaN(lastSeen.getTime())) {
              const diffMins = Math.floor((now - lastSeen) / 60000);
              isOnline = diffMins < 3; // Match new heartbeat interval
            }
          }

          onlineStatusCache[uid] = isOnline;
          setOnlineUsers(prev => {
            if (prev[uid] === isOnline) return prev;
            return { ...prev, [uid]: isOnline };
          });
        }
      }, (err) => {
        // Silently fail for individual status
      });

      onlineUnsubsRef.current.push(unsub);
    });
  }, [userId]);

  // Cleanup online listeners on unmount
  useEffect(() => {
    return () => {
      onlineUnsubsRef.current.forEach(u => u && u());
      onlineUnsubsRef.current = [];
    };
  }, []);

  // ──────────────────────────────────────
  // Build context value (memoized)
  // ──────────────────────────────────────
  const contextValue = useMemo(() => ({
    // User
    userProfile,
    profileLoading,

    // Friends
    friendIds,
    friendsRaw,
    friendsCount,

    // Requests
    incomingRequests,
    sentRequests,
    requestsCount,

    // Blocks
    myBlockedIds,
    blockedMeIds,

    // Stories
    activeStoryUserIds,
    unviewedStoryUserIds,
    storiesCount,

    // Messages
    unreadMessagesCount,

    // Likes
    likesCount,

    // Daily stats
    dailyStats,
    currentDateKey,

    // Online status
    onlineUsers,
    trackOnlineStatusForUsers,
    onlineStatusCache,

    // Incoming Call
    activeIncomingCall,
    setActiveIncomingCall,

    // Global Call States
    isVideoCallVisible,
    startGlobalCall,
    endGlobalCall,
    currentCallId
  }), [
    userProfile, profileLoading,
    friendIds, friendsRaw, friendsCount,
    incomingRequests, sentRequests, requestsCount,
    myBlockedIds, blockedMeIds,
    activeStoryUserIds, unviewedStoryUserIds, storiesCount,
    unreadMessagesCount, likesCount,
    dailyStats, currentDateKey,
    onlineUsers, trackOnlineStatusForUsers,
    activeIncomingCall,
    isVideoCallVisible, startGlobalCall, endGlobalCall, currentCallId
  ]);

  return (
    <AppDataContext.Provider value={contextValue}>
      {children}

      {/* Global Video Call Modal — Persistent across all screens */}
      {isVideoCallVisible && currentCallId && (
        <VideoCallModal
          visible={true}
          callId={currentCallId}
          isCaller={isCaller}
          remoteUserId={callPartner?.id || callPartner?.uid}
          remoteUserName={callPartner?.name}
          remoteUserAvatar={callPartner?.avatar}
          remoteUserGender={callPartner?.gender}
          currentUserGender={userProfile?.gender}
          currentUserProfile={userProfile}
          onEndCall={endGlobalCall}
        />
      )}

      {/* Global Incoming Call Banner/Modal */}
      <GlobalIncomingCall />
    </AppDataContext.Provider>
  );
}
