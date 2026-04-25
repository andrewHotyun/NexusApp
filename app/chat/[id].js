import Ionicons from '@expo/vector-icons/Ionicons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  limit,
  orderBy,
  runTransaction
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  LinearTransition
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EmojiPicker from 'rn-emoji-keyboard';
import MessageItem from '../../components/chat/MessageItem';
import ActionMenu from '../../components/ui/ActionMenu';
import { ActionModal } from '../../components/ui/ActionModal';
import { IconSymbol } from '../../components/ui/icon-symbol';
import MessageContextMenu from '../../components/ui/MessageContextMenu';
import ReportUserModal from '../../components/ui/ReportUserModal';
import { Toast } from '../../components/ui/Toast';
import { UserProfileModal } from '../../components/ui/UserProfileModal';
import { Colors } from '../../constants/theme';
import { getAvatarColor } from '../../utils/avatarUtils';
import { auth, db, storage } from '../../utils/firebase';
import { formatLastSeen, getUserOnlineStatus } from '../../utils/onlineStatus';
import { useAppData } from '../../utils/AppDataProvider';
import { StoryAvatar } from '../../components/ui/StoryAvatar';
import { StoryViewer } from '../../components/ui/StoryViewer';
import GiftModal from '../../components/chat/GiftModal';
import GiftAnimationOverlay from '../../components/chat/GiftAnimationOverlay';
import { getEarningsRate } from '../../utils/earningsHelper';
import { GIFTS, getGiftById } from '../../constants/gifts';
import VideoCallModal from '../../components/chat/VideoCallModal';
import { mediaDevices } from 'react-native-webrtc';
import { updateConversation } from '../../utils/conversationHelper';

export default function ChatScreen() {
  const { id, name, gender, autoAcceptCallId } = useLocalSearchParams();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const [deleteMsgConfirmVisible, setDeleteMsgConfirmVisible] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [messagesLimit, setMessagesLimit] = useState(50);

  const insets = useSafeAreaInsets();
  const user = auth.currentUser;
  const { startGlobalCall } = useAppData();
  const flatListRef = useRef(null);
  const inputRef = useRef(null);

  const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
  const partnerId = id;

  const [partner, setPartner] = useState({
    uid: id,
    name: name || 'User',
    avatar: null,
    gender: gender || null
  });
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [menuVisible, setMenuVisible] = useState(false);
  const [clearConfirmVisible, setClearConfirmVisible] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [friendshipStatus, setFriendshipStatus] = useState('loading'); // loading, friends, not_friends, request_sent, request_received
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [isBlockedByPartner, setIsBlockedByPartner] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportSuccessVisible, setReportSuccessVisible] = useState(false);
  const [userProfileVisible, setUserProfileVisible] = useState(false);
  const [fullScreenAvatarVisible, setFullScreenAvatarVisible] = useState(false);
  const [removeFriendConfirmVisible, setRemoveFriendConfirmVisible] = useState(false);
  const [blockConfirmVisible, setBlockConfirmVisible] = useState(false);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [fullScreenMedia, setFullScreenMedia] = useState(null);
  const [isPartnerTyping, setIsPartnerTyping] = useState(false);
  const [giftModalVisible, setGiftModalVisible] = useState(false);
  const typingTimeoutRef = useRef(null);

  // Story states
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStories, setViewerStories] = useState([]);
  const [hasPartnerStories, setHasPartnerStories] = useState(false);
  const [areStoriesAllViewed, setAreStoriesAllViewed] = useState(false);
  const [activeGiftAnimation, setActiveGiftAnimation] = useState(null);
  const animatedGiftsRef = useRef(new Set());

  // 1.2 Video call state moved to AppDataProvider (Global Persistence)

  const handledAutoAcceptIds = useRef(new Set());
  // Handle global call acceptance redirect
  useEffect(() => {
    if (autoAcceptCallId && autoAcceptCallId !== 'null' && autoAcceptCallId !== 'undefined'
        && partner && !handledAutoAcceptIds.current.has(autoAcceptCallId)) {
      handledAutoAcceptIds.current.add(autoAcceptCallId);
      startGlobalCall(autoAcceptCallId, false, partner);
    }
  }, [autoAcceptCallId, partner]);

  // --- Typing indicator Animation ---
  const typingDot1 = useSharedValue(0.4);
  const typingDot2 = useSharedValue(0.4);
  const typingDot3 = useSharedValue(0.4);

  useEffect(() => {
    if (isPartnerTyping) {
      const animate = (sv, delay) => {
        sv.value = withRepeat(
          withSequence(
            withDelay(delay, withTiming(1, { duration: 400, easing: Easing.bezier(0.33, 1, 0.68, 1) })),
            withTiming(0.4, { duration: 400, easing: Easing.bezier(0.33, 1, 0.68, 1) })
          ),
          -1,
          false
        );
      };
      animate(typingDot1, 0);
      animate(typingDot2, 150);
      animate(typingDot3, 300);
    } else {
      typingDot1.value = 0.4;
      typingDot2.value = 0.4;
      typingDot3.value = 0.4;
    }
  }, [isPartnerTyping]);

  const dotStyle1 = useAnimatedStyle(() => ({
    opacity: typingDot1.value,
    transform: [
      { translateY: interpolate(typingDot1.value, [0.4, 1], [0, -3]) },
      { scale: interpolate(typingDot1.value, [0.4, 1], [1, 1.1]) }
    ]
  }));
  const dotStyle2 = useAnimatedStyle(() => ({
    opacity: typingDot2.value,
    transform: [
      { translateY: interpolate(typingDot2.value, [0.4, 1], [0, -3]) },
      { scale: interpolate(typingDot2.value, [0.4, 1], [1, 1.1]) }
    ]
  }));
  const dotStyle3 = useAnimatedStyle(() => ({
    opacity: typingDot3.value,
    transform: [
      { translateY: interpolate(typingDot3.value, [0.4, 1], [0, -3]) },
      { scale: interpolate(typingDot3.value, [0.4, 1], [1, 1.1]) }
    ]
  }));
  // ---------------------------------

  // Context Menu & Actions States
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [deletingMessageIds, setDeletingMessageIds] = useState([]);
  const [editText, setEditText] = useState('');
  const [originalEditText, setOriginalEditText] = useState('');  // Stores original text for the preview bar

  // Selection Mode States
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);

  // Search States
  const [isSearchVisible, setIsSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollArrows, setShowScrollArrows] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);
  const [highlightedId, setHighlightedId] = useState(null);

  // Database Safety Locks
  const dbLockRef = useRef(false);
  const prevMessageIdsRef = useRef('');  // Track last known message IDs to prevent unnecessary rerenders
  const markAsReadRef = useRef(null);    // Stable ref for markAsRead to avoid stale closures
  const lastTypingTimeRef = useRef(0);

  const normalizeGender = (g) => {
    if (!g) return '';
    const v = String(g).trim().toLowerCase();
    if (['male', 'm', 'man', 'boy', 'чоловік', 'хлопець', 'ч', 'чол'].includes(v)) return 'male';
    if (['female', 'f', 'woman', 'girl', 'жінка', 'дівчина', 'ж', 'жін'].includes(v)) return 'female';
    return '';
  };

  // Real-time online status state
  const [isOnline, setIsOnline] = useState(false);
  const [lastSeenText, setLastSeenText] = useState('');

  // 1. Fetch partner info in realtime (to get live minutes balance, online status, etc.)
  useEffect(() => {
    if (!partnerId) return;

    const unsub = onSnapshot(doc(db, 'users', partnerId), (docSnap) => {
      if (docSnap.exists()) {
        setPartner(prev => ({ ...prev, uid: partnerId, ...docSnap.data() }));
      }
    }, (e) => {
      console.error("Error fetching partner:", e);
    });

    return () => unsub();
  }, [partnerId]);

  // 1a. Fetch current user data for gender checks
  useEffect(() => {
    if (!user?.uid) return;
    const fetchUser = async () => {
      try {
        const docSnap = await getDoc(doc(db, 'users', user.uid));
        if (docSnap.exists()) {
          setCurrentUserData({ uid: user.uid, ...docSnap.data() });
        }
      } catch (e) {
        console.error("Error fetching current user:", e);
      }
    };
    fetchUser();
  }, [user?.uid]);

  // Track keyboard strictly for Android
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Listen for real-time online status
  useEffect(() => {
    if (!partnerId) return;

    const unsubscribe = getUserOnlineStatus(partnerId, (status) => {
      setIsOnline(status.isOnline);
      if (!status.isOnline && status.lastSeen) {
        setLastSeenText(formatLastSeen(status.lastSeen));
      } else {
        setLastSeenText('');
      }
    });

    return () => {
      if (unsubscribe && typeof unsubscribe === 'function') unsubscribe();
    };
  }, [partnerId]);

  // Typing indicator: listen for partner typing
  useEffect(() => {
    if (!user || !partnerId) return;
    const typingRef = doc(db, 'typingStatus', `${partnerId}_${user.uid}`);
    const unsubTyping = onSnapshot(typingRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIsPartnerTyping(data.isTyping || false);
      } else {
        setIsPartnerTyping(false);
      }
    }, (err) => console.error('Typing status listener error:', err));

    return () => unsubTyping();
  }, [user?.uid, partnerId]);

  // Clean up own typing status on unmount
  useEffect(() => {
    return () => {
      if (user?.uid && partnerId) {
        const typingRef = doc(db, 'typingStatus', `${user.uid}_${partnerId}`);
        setDoc(typingRef, { isTyping: false, updatedAt: serverTimestamp() }, { merge: true })
          .catch(err => console.error("Error clearing typing status on unmount:", err));
      }
    };
  }, [user?.uid, partnerId]);

  // 1.0 Listen for real-time bidirectional blocks
  useEffect(() => {
    if (!user || !partnerId) return;

    // Check if I blocked them
    const unsubMe = onSnapshot(doc(db, 'blocks', `${user.uid}_${partnerId}`), (snap) => {
      setIsBlockedByMe(snap.exists());
    }, (err) => console.warn('BlockedByMe listener error:', err));

    // Check if they blocked me
    const unsubPartner = onSnapshot(doc(db, 'blocks', `${partnerId}_${user.uid}`), (snap) => {
      setIsBlockedByPartner(snap.exists());
    }, (err) => console.warn('BlockedByPartner listener error:', err));

    return () => {
      unsubMe();
      unsubPartner();
    };
  }, [user?.uid, partnerId]);

  // 1.1 Listen for Friendship Status
  useEffect(() => {
    if (!user || !partnerId) return;

    setFriendshipStatus('loading');

    // Check if they are friends
    const friendsQuery = query(
      collection(db, 'friends'),
      where('userId', '==', user.uid),
      where('friendId', '==', partnerId)
    );

    const unsubFriends = onSnapshot(friendsQuery, (snap) => {
      if (!snap.empty) {
        setFriendshipStatus('friends');
      } else {
        // Checking for pending requests
        const sentReqQuery = query(
          collection(db, 'friendRequests'),
          where('fromUserId', '==', user.uid),
          where('toUserId', '==', partnerId),
          where('status', '==', 'pending')
        );

        const unsubSent = onSnapshot(sentReqQuery, (sentSnap) => {
          if (!sentSnap.empty) {
            setFriendshipStatus('request_sent');
          } else {
            const receivedReqQuery = query(
              collection(db, 'friendRequests'),
              where('fromUserId', '==', partnerId),
              where('toUserId', '==', user.uid),
              where('status', '==', 'pending')
            );

            const unsubReceived = onSnapshot(receivedReqQuery, (recSnap) => {
              if (!recSnap.empty) {
                setFriendshipStatus('request_received');
              } else {
                setFriendshipStatus('not_friends');
              }
            }, (err) => console.warn('ReceivedReq listener error:', err));
            return () => unsubReceived();
          }
        }, (err) => console.warn('SentReq listener error:', err));
        return () => unsubSent();
      }
    }, (err) => console.warn('Friends listener error:', err));

    return () => unsubFriends();
  }, [user?.uid, partnerId]);

  // 1.05 Listen for partner's active stories to show ring in header
  // Uses userId + status only (index exists from web version).
  useEffect(() => {
    if (!partnerId) return;

    const q = query(
      collection(db, 'stories'),
      where('userId', '==', partnerId),
      where('status', '==', 'approved')
    );
    const unsub = onSnapshot(q, (snap) => {
      const now = new Date();
      let active = false;
      let unviewed = false;
      
      snap.docs.forEach(doc => {
        const data = doc.data();
        const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)) : null;
        if (expiresAt && expiresAt > now) {
          active = true;
          if (!data.viewedBy?.includes(user?.uid)) {
            unviewed = true;
          }
        }
      });
      
      setHasPartnerStories(active);
      setAreStoriesAllViewed(active && !unviewed);
    }, (err) => console.warn('Stories listener error:', err));
    return () => unsub();
  }, [partnerId]);

  // 1.2 Listen for Blocked Status
  useEffect(() => {
    if (!user || !partnerId) return;

    const blockQuery = query(
      collection(db, 'blocks'),
      where('blockerId', '==', user.uid),
      where('blockedId', '==', partnerId)
    );

    const unsubBlock = onSnapshot(blockQuery, (snap) => {
      setIsBlockedByMe(!snap.empty);
    }, (err) => console.warn('BlockStatus listener error:', err));

    return () => unsubBlock();
  }, [user?.uid, partnerId]);

  // --- Video Call Handlers (Browser-like) ---
  const performStartCall = async () => {
    if (!user?.uid || !partnerId || !partner) return;

    try {
      // 1. Fetch latest data for both participants (Balance & Status checks)
      const [callerSnap, calleeSnap] = await Promise.all([
        getDoc(doc(db, 'users', user.uid)),
        getDoc(doc(db, 'users', partnerId))
      ]);

      const callerData = callerSnap.exists() ? callerSnap.data() : null;
      const calleeData = calleeSnap.exists() ? calleeSnap.data() : null;

      // 2. Block calls if suspended or rejected
      if (callerData?.callSuspended === true || callerData?.verificationStatus === 'rejected') {
        setToastMessage(t('call_verification.suspended_hint', 'Your calls are suspended due to identity verification issues.'));
        setToastVisible(true);
        return;
      }

      // 3. Balance checks (Identical to Web/Browser logic)
      const callerGender = normalizeGender(callerData?.gender || callerData?.sex);
      const calleeGender = normalizeGender(calleeData?.gender || calleeData?.sex);

      if (callerGender === 'male' && calleeGender === 'female') {
        const bal = parseInt(callerData?.minutesBalance || 0, 10);
        if (isNaN(bal) || bal <= 0) {
          setToastMessage(t('chat.no_minutes_male', 'You don\'t have enough minutes for a video call.'));
          setToastVisible(true);
          return;
        }
      } else if (callerGender === 'female' && calleeGender === 'male') {
        const bal = parseInt(calleeData?.minutesBalance || 0, 10);
        if (isNaN(bal) || bal <= 0) {
          setToastMessage(t('chat.no_minutes_female', 'This user has no minutes to receive a video call.'));
          setToastVisible(true);
          return;
        }
      }

      // 4. Create call document
      const callsRef = collection(db, 'calls');
      const callDoc = await addDoc(callsRef, {
        callerId: user.uid,
        callerName: callerData?.name || t('common.user'),
        callerAvatar: callerData?.avatar || null,
        calleeId: partnerId,
        calleeName: calleeData?.name || partner?.name || t('common.user'),
        calleeAvatar: calleeData?.avatar || partner?.avatar || null,
        callerGender: callerGender,
        calleeGender: calleeGender,
        type: 'video',
        status: 'ringing',
        participants: [user.uid, partnerId],
        createdAt: serverTimestamp()
      });

      // Removed camera warmup as it causes rapid acquire/release cycles on Android

      // 6. Update global state to show modal
      startGlobalCall(callDoc.id, true, partner);

    } catch (e) {
      console.error("Error starting call:", e);
      setToastMessage(t('chat.call_init_failed', 'Call initialization failed'));
      setToastVisible(true);
    }
  };

  // ------------------------------------------

  // 1.3 Removed Local Incoming Call Listener (Now Global in AppDataProvider)

  // 2. Listen for messages — fast chatId query + self-healing legacy migration
  useEffect(() => {
    if (!user || !partnerId) return;

    const chatId = [user.uid, partnerId].sort().join('_');
    const messagesRef = collection(db, 'messages');

    // Match Web App logic: 3 listeners to catch BOTH new messages (with chatId) AND legacy unmigrated messages
    // Added orderBy and limit to enforce pagination and significantly reduce DB reads/crashes
    const byChatIdQ = query(messagesRef, where('chatId', '==', chatId), orderBy('timestamp', 'desc'), limit(messagesLimit));
    const bySenderAReceiverBQ = query(messagesRef, where('senderId', '==', user.uid), where('receiverId', '==', partnerId), orderBy('timestamp', 'desc'), limit(messagesLimit));
    const bySenderBReceiverAQ = query(messagesRef, where('senderId', '==', partnerId), where('receiverId', '==', user.uid), orderBy('timestamp', 'desc'), limit(messagesLimit));

    const allUnsubs = [];
    const results = { byChatId: [], a2b: [], b2a: [] };
    const processAndCommit = () => {
      // Merge all queries and deduplicate by document ID
      const map = new Map();
      [...results.byChatId, ...results.a2b, ...results.b2a].forEach((m) => {
        if (m && m.id) map.set(m.id, m);
      });
      let merged = Array.from(map.values());

      // Calculate cutoff to prevent asymmetric timeline gaps from independent limits
      let cutoffTimestamp = 0;
      const extractTs = (m) => m?.timestamp?.toMillis?.() || (m?.timestamp?.seconds ? m.timestamp.seconds * 1000 : Date.now());

      const checkCutoff = (arr) => {
        if (arr.length === messagesLimit) {
          const oldest = arr[arr.length - 1]; // The last item is the oldest since Firebase sorts 'desc'
          const t = extractTs(oldest);
          if (t > cutoffTimestamp) cutoffTimestamp = t;
        }
      };

      checkCutoff(results.byChatId);
      checkCutoff(results.a2b);
      checkCutoff(results.b2a);

      if (cutoffTimestamp > 0) {
        merged = merged.filter(m => extractTs(m) >= cutoffTimestamp);
      }

      // Deduplicate legacy call messages
      const seenCallKeys = new Set();
      merged = merged.filter(m => {
        if (m.type === 'call' && m.callId) {
          const key = `${m.callId}_${m.text}`;
          if (seenCallKeys.has(key)) return false;
          seenCallKeys.add(key);
        }
        return true;
      });

      // Sort: Oldest to Newest
      merged.sort((a, b) => {
        const aT = extractTs(a);
        const bT = extractTs(b);
        if (aT === bT) return a.id.localeCompare(b.id);
        return aT - bT;
      });

      const newIdsKey = merged.map(m =>
        `${m.id}_${m.updatedAt?.toMillis?.() || extractTs(m)}`
      ).join(',');

      if (newIdsKey !== prevMessageIdsRef.current) {
        prevMessageIdsRef.current = newIdsKey;
        setMessages(merged);

        // Check for new gifts to animate (scan all messages for un-animated fresh gifts)
        const freshGifts = merged.filter(m => 
          m.type === 'gift' && 
          !animatedGiftsRef.current.has(m.id) && 
          (Date.now() - extractTs(m)) < 15000 // 15s window for better reliability
        );

        if (freshGifts.length > 0) {
          // Take the newest fresh gift
          const latestGift = freshGifts[freshGifts.length - 1];
          animatedGiftsRef.current.add(latestGift.id);
          setActiveGiftAnimation({
            gift: getGiftById(latestGift.giftId),
            isSender: latestGift.senderId === user?.uid,
            partnerName: partner?.name || 'User'
          });
        }

        setTimeout(() => markAsReadRef.current?.(merged), 300);
      }
      setIsInitialLoad(false);
    };

    const makeListener = (q, key) =>
      onSnapshot(q, (snapshot) => {
        results[key] = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        processAndCommit();
      }, (err) => console.error('Messages listener error:', err));

    allUnsubs.push(makeListener(byChatIdQ, 'byChatId'));
    allUnsubs.push(makeListener(bySenderAReceiverBQ, 'a2b'));
    allUnsubs.push(makeListener(bySenderBReceiverAQ, 'b2a'));

    return () => allUnsubs.forEach((u) => u && u());
  }, [partnerId, user?.uid, messagesLimit]);

  const markAsRead = useCallback(async (msgs) => {
    if (!user || dbLockRef.current) return;
    const unread = msgs.filter(m => m.receiverId === user.uid && !m.read);
    if (unread.length === 0) return;

    try {
      const batch = writeBatch(db);
      unread.forEach((m) => {
        batch.update(doc(db, 'messages', m.id), { read: true });
      });

      // Also mark the conversation's lastMessage as read
      const chatId = [user.uid, partnerId].sort().join('_');
      batch.set(doc(db, 'conversations', chatId), {
        lastMessage: { read: true }
      }, { merge: true });

      await batch.commit();
    } catch (e) {
      console.error("Error marking messages read:", e);
    }
  }, [user]);

  // Keep markAsRead ref current to avoid stale closures in snapshot listeners
  useEffect(() => {
    markAsReadRef.current = markAsRead;
  }, [markAsRead]);

  const handleTyping = () => {
    if (!user || !partnerId || dbLockRef.current) return;

    const now = Date.now();
    // Throttle DB writes: maximum 1 write per 2.5 seconds per user
    if (now - lastTypingTimeRef.current < 2500) {
      return;
    }
    lastTypingTimeRef.current = now;

    const typingRef = doc(db, 'typingStatus', `${user.uid}_${partnerId}`);
    setDoc(typingRef, {
      senderId: user.uid,
      receiverId: partnerId,
      isTyping: true,
      updatedAt: serverTimestamp()
    }, { merge: true }).catch(err => console.error("Error setting typing status:", err));

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setDoc(typingRef, {
        isTyping: false,
        updatedAt: serverTimestamp()
      }, { merge: true }).catch(err => console.error("Error setting typing status off:", err));
      lastTypingTimeRef.current = 0; // reset
    }, 3000); // 3 seconds timeout to clear typing status
  };

  const sendMessage = async () => {
    const trimmedText = inputText.trim();
    if (!trimmedText || !user || !partnerId || sending) return;

    setSending(true);
    try {
      const chatId = [user.uid, partnerId].sort().join('_');
      const messageData = {
        chatId: chatId,
        senderId: user.uid,
        receiverId: partnerId,
        text: trimmedText,
        timestamp: serverTimestamp(),
        read: false,
        type: 'text',
        participants: [user.uid, partnerId]
      };

      if (replyingToMessage) {
        messageData.replyTo = {
          messageId: replyingToMessage.id,
          senderName: replyingToMessage.senderId === user.uid ? (currentUserData?.name || 'Me') : (partner?.name || 'User'),
          text: replyingToMessage.text?.trim()
        };
      }

      await addDoc(collection(db, 'messages'), messageData);
      updateConversation(chatId, messageData.participants, messageData);
      setInputText('');
      setReplyingToMessage(null);
    } catch (e) {
      console.error("Error sending message:", e);
      setInputText(trimmedText);
    } finally {
      setSending(false);
    }
  };

  const handleSendGift = async (gift) => {
    if (!user || !partnerId || !gift) return;

    try {
      const maleRef = doc(db, 'users', user.uid);
      const femaleRef = doc(db, 'users', partnerId);
      const chatId = [user.uid, partnerId].sort().join('_');
      const ratePerMinute = await getEarningsRate();

      await runTransaction(db, async (transaction) => {
        const maleDoc = await transaction.get(maleRef);
        const femaleDoc = await transaction.get(femaleRef);

        if (!maleDoc.exists()) throw new Error("User docs do not exist");

        const currentMinutes = parseInt(maleDoc.data().minutesBalance || 0, 10);
        if (currentMinutes < gift.minutes) {
          throw new Error("Insufficient balance");
        }

        // 1. Deduct minutes from man
        transaction.update(maleRef, {
          minutesBalance: currentMinutes - gift.minutes
        });

        // 2. Add earnings to woman
        const giftEarnings = gift.minutes * ratePerMinute;
        const femaleData = femaleDoc.data() || {};
        const currentEarnings = parseFloat(femaleData.totalEarnings || 0);
        const currentMinutesEarned = parseInt(femaleData.totalMinutesEarned || 0, 10);
        const currentFemaleBalance = parseInt(femaleData.minutesBalance || 0, 10);

        transaction.update(femaleRef, {
          totalEarnings: parseFloat((currentEarnings + giftEarnings).toFixed(2)),
          totalMinutesEarned: currentMinutesEarned + gift.minutes,
          minutesBalance: currentFemaleBalance + gift.minutes
        });

        // 3. Create actual gift message
        const messageData = {
          chatId: chatId,
          senderId: user.uid,
          receiverId: partnerId,
          text: `🎁 «${t(gift.nameKey)}» (+${gift.minutes} ${t('gifts.minutes_unit')})`,
          timestamp: serverTimestamp(),
          read: false,
          type: 'gift',
          giftId: gift.id,
          minutes: gift.minutes,
          participants: [user.uid, partnerId],
          senderLanguage: i18n.language || 'en'
        };

        const messagesRef = collection(db, 'messages');
        const newMessageRef = doc(messagesRef);
        transaction.set(newMessageRef, messageData);
        
        // Add conversation update via transaction
        const conversationRef = doc(db, 'conversations', chatId);
        transaction.set(conversationRef, {
          id: chatId,
          participants: messageData.participants,
          lastMessage: {
            text: messageData.text,
            senderId: messageData.senderId,
            type: messageData.type,
            timestamp: serverTimestamp(),
            read: false
          },
          updatedAt: serverTimestamp()
        }, { merge: true });

        // 4. Create actual earnings record
        const earningsRef = doc(collection(db, 'earnings'));
        transaction.set(earningsRef, {
          userId: partnerId,
          partnerId: user.uid,
          minutes: gift.minutes,
          earnings: parseFloat((gift.minutes * ratePerMinute).toFixed(2)),
          type: 'gift',
          giftId: gift.id,
          status: 'completed',
          createdAt: serverTimestamp()
        });
      });

      setToastMessage(t('gifts.gift_sent_success', { name: t(gift.nameKey) }));
      setToastVisible(true);
    } catch (error) {
      console.error('Error sending gift:', error);
      Alert.alert(t('common.error'), error.message === 'Insufficient balance' ? t('gifts.not_enough_minutes') : error.message);
    }
  };

  const handleLongPress = (message, position) => {
    setSelectedMessage(message);
    setContextMenuVisible(true);
    if (position) {
      setContextMenuPos(position);
    } else {
      setContextMenuPos({ x: SCREEN_WIDTH / 2, y: SCREEN_HEIGHT / 2, width: 0, height: 0 });
    }
  };

  const handleReaction = async (emoji) => {
    if (!selectedMessage || !user) return;
    const messageRef = doc(db, 'messages', selectedMessage.id);
    const reactionPath = `reactions.${user.uid}`;

    try {
      const currentReaction = selectedMessage.reactions?.[user.uid];
      if (currentReaction === emoji) {
        await updateDoc(messageRef, { [reactionPath]: deleteField() });
      } else {
        await updateDoc(messageRef, { [reactionPath]: emoji });
      }
    } catch (e) {
      console.error("Error updating reaction:", e);
    }
  };

  const handleContextMenuAction = (action) => {
    if (!selectedMessage) return;

    switch (action) {
      case 'reply':
        setReplyingToMessage(selectedMessage);
        setEditingMessage(null);
        break;
      case 'copy':
        Clipboard.setString(selectedMessage.text);
        break;
      case 'edit':
        setEditingMessage(selectedMessage.id);
        setEditText(selectedMessage.text || '');
        setOriginalEditText(selectedMessage.text || '');  // Save original for preview
        setReplyingToMessage(null);
        break;
      case 'delete':
        setDeleteMsgConfirmVisible(true);
        break;
      case 'select':
        setIsSelectionMode(true);
        setSelectedIds([selectedMessage.id]);
        break;
    }
  };

  const toggleMessageSelection = (id) => {
    const msg = messages.find(m => m.id === id);
    if (!msg || msg.senderId !== user.uid) return;

    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0 || dbLockRef.current) return;
    setDeleteMsgConfirmVisible(true);
  };

  const performBulkDelete = async () => {
    if (selectedIds.length === 0 || dbLockRef.current) return;

    // 1. Capture the current IDs to delete
    const idsToDelete = [...new Set(selectedIds)].filter(id => !deletingMessageIds.includes(id));
    if (idsToDelete.length === 0) return;

    dbLockRef.current = true; // LOCK DATABASE

    // 2. Set all IDs immediately for a simultaneous start (no stagger)
    setDeletingMessageIds(prev => [...new Set([...prev, ...idsToDelete])]);

    // 3. Exit selection mode
    setIsSelectionMode(false);
    setSelectedIds([]);

    // 4. Atomic batch deletion - timed to finish as the animation ends
    const totalAnimationTime = 500; // Fast and snappy to prevent dizziness
    setTimeout(async () => {
      try {
        const batch = writeBatch(db);
        idsToDelete.forEach(id => {
          batch.delete(doc(db, 'messages', id));
        });
        await batch.commit();

        // Final cleanup
        setTimeout(() => {
          setDeletingMessageIds(prev => prev.filter(id => !idsToDelete.includes(id)));
        }, 300);
        
        setToastMessage(t('chat.delete_success_toast'));
        setToastVisible(true);
      } catch (e) {
        console.log("Bulk delete error:", e);
      } finally {
        setTimeout(() => {
          dbLockRef.current = false;
        }, 100);
      }
    }, totalAnimationTime);
  };

  const onConfirmDelete = () => {
    if (isSelectionMode) {
      performBulkDelete();
    } else if (selectedMessage) {
      setDeletingMessageIds(prev => [...prev, selectedMessage.id]);
    }
    setDeleteMsgConfirmVisible(false);
  };

  const cancelSelection = () => {
    setIsSelectionMode(false);
    setSelectedIds([]);
  };

  const saveEdit = async () => {
    const trimmedText = editText.trim();
    if (!editingMessage || !trimmedText) return;
    try {
      setSending(true);
      await updateDoc(doc(db, 'messages', editingMessage), {
        text: trimmedText,
        isEdited: true,
        updatedAt: serverTimestamp()
      });
      setEditingMessage(null);
      setEditText('');
      setOriginalEditText('');
    } catch (e) {
      console.error("Error editing message:", e);
    } finally {
      setSending(false);
    }
  };

  const cancelEdit = () => {
    setEditingMessage(null);
    setEditText('');
    setOriginalEditText('');
  };

  const cancelReply = () => {
    setReplyingToMessage(null);
  };

  const onDeletionComplete = async (messageId) => {
    try {
      // If db is locked, it means a bulk operation is already handling the server-side deletion.
      // We only clean up the animation tracking state here.
      if (!dbLockRef.current) {
        await deleteDoc(doc(db, 'messages', messageId));
        setToastMessage(t('chat.delete_success_toast'));
        setToastVisible(true);
      }

      // Small delay to prevent the message re-appearing for a millisecond before snapshot update
      setTimeout(() => {
        setDeletingMessageIds(prev => prev.filter(id => id !== messageId));
      }, 1000);
    } catch (e) {
      console.log("Error deleting message:", e);
    }
  };

  const handleAttachment = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.All,
        allowsEditing: false,
        quality: 0.7, // Трохи зменшив якість для швидкості
        maxWidth: 1200, // Обмежив розмір, щоб файл не важив 10 МБ
        maxHeight: 1200,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        uploadAttachment(result.assets[0]);
      }
    } catch (e) {
      console.error("Error picking attachment", e);
      Alert.alert(t('common.error', 'Error'), t('chat.upload_error', 'Upload error'));
    }
  };

  const uploadAttachment = async (asset) => {
    if (!user || !partnerId) return;

    try {
      setSending(true);
      const fileExt = asset.uri.split('.').pop().toLowerCase();
      const isVideo = asset.type === 'video' || asset.duration || ['mp4', 'mov'].includes(fileExt);
      const filename = `${Date.now()}_attachment.${fileExt}`;
      const chatId = [user.uid, partnerId].sort().join('_');
      const storageRef = ref(storage, `chats/${chatId}/${filename}`);

      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const uploadTask = uploadBytesResumable(storageRef, blob);

      uploadTask.on('state_changed',
        (snapshot) => { },
        (error) => {
          console.error("Upload error", error);
          setSending(false);
          Alert.alert(t('common.error', 'Error'), t('chat.upload_error', 'Upload error'));
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const messageData = {
            chatId: chatId,
            senderId: user.uid,
            receiverId: partnerId,
            text: isVideo ? `🎥 ${asset.fileName || 'Video'}` : `📷 ${asset.fileName || 'Image'}`,
            fileData: downloadURL,
            fileName: asset.fileName || filename,
            mimeType: isVideo ? (asset.mimeType || 'video/mp4') : (asset.mimeType || 'image/jpeg'),
            type: isVideo ? 'video' : 'image',
            timestamp: serverTimestamp(),
            read: false,
            participants: [user.uid, partnerId]
          };

          await addDoc(collection(db, 'messages'), messageData);
          setSending(false);
          setTimeout(() => {
            flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 100);
        }
      );
    } catch (e) {
      console.error("Upload process error", e);
      setSending(false);
      Alert.alert(t('common.error', 'Error'), t('chat.upload_error', 'Upload error'));
    }
  };

  const performClearChat = async () => {
    if (!user || !partnerId) return;

    try {
      setSending(true);
      const chatId = [user.uid, partnerId].sort().join('_');
      const messagesRef = collection(db, 'messages');

      const queriesToClear = [
        query(messagesRef, where('chatId', '==', chatId)),
        query(messagesRef, where('senderId', '==', user.uid), where('receiverId', '==', partnerId)),
        query(messagesRef, where('senderId', '==', partnerId), where('receiverId', '==', user.uid))
      ];

      let totalDeleted = 0;
      for (const q of queriesToClear) {
        const snap = await getDocs(q);
        if (snap.empty) continue;

        // Firestore batches are limited to 500 ops
        const docs = snap.docs;
        for (let i = 0; i < docs.length; i += 450) {
          const batch = writeBatch(db);
          docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
          await batch.commit();
          totalDeleted += docs.slice(i, i + 450).length;
        }
      }

      console.log(`[Nexus] Cleared ${totalDeleted} messages`);
      router.replace('/(tabs)/chats');
    } catch (e) {
      console.error("Error clearing chat:", e);
      Alert.alert(t('common.error'), t('chat.clear_error'));
    } finally {
      setSending(false);
    }
  };

  const performAddFriend = async () => {
    if (!user || !partnerId || friendshipStatus !== 'not_friends') return;
    try {
      setSending(true);
      await addDoc(collection(db, 'friendRequests'), {
        fromUserId: user.uid,
        toUserId: partnerId,
        status: 'pending',
        timestamp: serverTimestamp()
      });
    } catch (e) {
      console.error("Error sending friend request:", e);
    } finally {
      setSending(false);
    }
  };

  const performRemoveFriend = async () => {
    if (!user || !partnerId) return;
    try {
      setSending(true);
      const friendsRef = collection(db, 'friends');

      // 1. Remove from my side
      const q1 = query(friendsRef, where('userId', '==', user.uid), where('friendId', '==', partnerId));
      const snap1 = await getDocs(q1);
      snap1.forEach(async (d) => await deleteDoc(doc(db, 'friends', d.id)));

      // 2. Remove from their side
      const q2 = query(friendsRef, where('userId', '==', partnerId), where('friendId', '==', user.uid));
      const snap2 = await getDocs(q2);
      snap2.forEach(async (d) => await deleteDoc(doc(db, 'friends', d.id)));

      setRemoveFriendConfirmVisible(false);
    } catch (e) {
      console.error("Error removing friend:", e);
    } finally {
      setSending(false);
    }
  };

  // performReport logic is now handled inside ReportUserModal in the background
  // The state handlers are integrated below

  const performUnblock = async () => {
    if (!user || !partnerId) return;
    try {
      setBlocking(true);
      const blockId = `${user.uid}_${partnerId}`;
      await deleteDoc(doc(db, 'blocks', blockId));
      setIsBlockedByMe(false);
    } catch (e) {
      console.error("Error unblocking user:", e);
    } finally {
      setBlocking(false);
    }
  };

  const performBlock = async () => {
    if (!user || !partnerId) return;
    try {
      setBlocking(true);

      const batch = writeBatch(db);

      // 1. Add block record
      const blockId = `${user.uid}_${partnerId}`;
      batch.set(doc(db, 'blocks', blockId), {
        blockerId: user.uid,
        blockedId: partnerId,
        timestamp: serverTimestamp()
      });

      // 2. Clear bidirectional friendships
      const friendsRef = collection(db, 'friends');
      const q1 = query(friendsRef, where('userId', '==', user.uid), where('friendId', '==', partnerId));
      const q2 = query(friendsRef, where('userId', '==', partnerId), where('friendId', '==', user.uid));

      const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);
      snap1.forEach(d => batch.delete(doc(db, 'friends', d.id)));
      snap2.forEach(d => batch.delete(doc(db, 'friends', d.id)));

      // 3. Clear bidirectional friend requests
      const reqsRef = collection(db, 'friendRequests');
      const qr1 = query(reqsRef, where('fromUserId', '==', user.uid), where('toUserId', '==', partnerId));
      const qr2 = query(reqsRef, where('fromUserId', '==', partnerId), where('toUserId', '==', user.uid));

      const [snapR1, snapR2] = await Promise.all([getDocs(qr1), getDocs(qr2)]);
      snapR1.forEach(d => batch.delete(doc(db, 'friendRequests', d.id)));
      snapR2.forEach(d => batch.delete(doc(db, 'friendRequests', d.id)));

      await batch.commit();

      // We no longer close chat automatically to match browser version
      // router.replace('/(tabs)/chats');
    } catch (e) {
      console.error("Error blocking user:", e);
    } finally {
      setBlocking(false);
    }
  };

  const groupedMessages = useMemo(() => {
    if (messages.length === 0) return [];
    const grouped = [];
    let lastDate = null;
    messages.forEach((msg) => {
      // Use fallback timestamp for messages that haven't hit the server yet
      const timestamp = msg.timestamp?.toMillis?.() || (msg.timestamp?.seconds ? msg.timestamp.seconds * 1000 : Date.now());
      const date = new Date(timestamp);
      const dateString = date.toDateString();
      if (dateString !== lastDate) {
        const localeMap = { ua: 'uk-UA', uk: 'uk-UA', en: 'en-US', es: 'es-ES', de: 'de-DE', fr: 'fr-FR' };
        const currentLocale = localeMap[i18n.language] || i18n.language || 'en-US';
        grouped.push({
          id: `date-${dateString}-${msg.id}`, // Guaranteed unique to prevent FlatList crashes
          type: 'date',
          date: date,
          text: date.toLocaleDateString(currentLocale, { day: 'numeric', month: 'long', year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined })
        });
        lastDate = dateString;
      }
      grouped.push(msg);
    });
    return [...grouped].reverse(); // Inverted: index 0 is newest
  }, [messages, i18n.language]);

  const jumpToMatch = (index) => {
    if (index < 0 || index >= groupedMessages.length) return;

    // Set highlight ID immediately for instant visual feedback
    const msgId = groupedMessages[index].id;
    setHighlightedId(msgId);

    // Perform scroll with a robust retry mechanism
    const doScroll = (retryCount = 0) => {
      if (!flatListRef.current) return;
      try {
        flatListRef.current.scrollToIndex({
          index,
          animated: true,
          viewPosition: 0.5
        });
      } catch (e) {
        if (retryCount < 3) {
          setTimeout(() => doScroll(retryCount + 1), 100);
        }
      }
    };

    // Initial wait to ensure state has propagated
    setTimeout(() => doScroll(0), 50);
  };

  const handleReplyPress = useCallback((messageId) => {
    const index = groupedMessages.findIndex(m => m.id === messageId);
    if (index !== -1) {
      jumpToMatch(index);
    }
  }, [groupedMessages]);

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (!text.trim()) {
      setSearchResults([]);
      setCurrentMatchIndex(-1);
      setHighlightedId(null);
      return;
    }
    const searchStr = text.toLowerCase().trim();
    const matches = [];

    groupedMessages.forEach((msg, index) => {
      if (msg.type !== 'date') {
        // Search ONLY in original text fields, excluding translated versions for precision
        const textsToSearch = [
          msg.text,
          msg.message,
          msg.caption,
          msg.replyTo?.text,
          msg.fileName
        ].filter(t => typeof t === 'string' && t.length > 0);

        const joinedText = textsToSearch.join(' ').toLowerCase();
        if (joinedText.includes(searchStr)) {
          matches.push(index);
        }
      }
    });

    // Sort: DESCENDING (Largest index to Smallest index) 
    // In inverted FlatList, Largest index is the OLDEST message.
    matches.sort((a, b) => b - a);

    setSearchResults(matches);
    if (matches.length > 0) {
      // Only jump to first match if we weren't already navigating or searching
      if (currentMatchIndex === -1 || !searchResults.includes(matches[currentMatchIndex])) {
        setCurrentMatchIndex(0);
        jumpToMatch(matches[0]);
      }
    } else {
      setCurrentMatchIndex(-1);
      setHighlightedId(null);
    }
  };

  // Chronological navigation for Inverted list:
  // In inverted list, Index 0 is Bottom (Newest). Index N is Top (Oldest).
  // Clicking "Up" (prevMatch) should go to HIGHER index (older messages).
  // Clicking "Down" (nextMatch) should go to LOWER index (newer messages).
  const nextMatch = () => {
    if (searchResults.length <= 1) return;
    // Next (Newer messages -> Smaller index in groupedMessages)
    // In our matches array, higher index to lower index
    let nextIdx = currentMatchIndex + 1;
    if (nextIdx >= searchResults.length) nextIdx = 0;

    setCurrentMatchIndex(nextIdx);
    jumpToMatch(searchResults[nextIdx]);
  };

  const prevMatch = () => {
    if (searchResults.length <= 1) return;
    // Previous (Older messages -> Larger index in groupedMessages)
    let nextIdx = currentMatchIndex - 1;
    if (nextIdx < 0) nextIdx = searchResults.length - 1;

    setCurrentMatchIndex(nextIdx);
    jumpToMatch(searchResults[nextIdx]);
  };

  // Stable string key for selection state — prevents array reference instability in useCallback deps
  const selectedIdsKey = useMemo(() => selectedIds.join(','), [selectedIds]);

  const renderMessage = useCallback(({ item }) => {
    if (item.type === 'date') {
      return (
        <View style={styles.dateDividerContainer}>
          <View style={styles.dateDividerLine} />
          <View style={styles.dateDividerBadge}>
            <Text style={styles.dateDividerText}>{item.text}</Text>
          </View>
        </View>
      );
    }

    const isMe = item.senderId === user.uid;
    const isDeleting = deletingMessageIds.includes(item.id);

    return (
      <MessageItem
        item={item}
        isMe={isMe}
        partner={partner}
        onLongPress={handleLongPress}
        onMediaPress={(uri) => setFullScreenMedia(uri)}
        onReplyPress={handleReplyPress}
        isDeleting={isDeleting}
        isBulk={selectedIds.length > 2}
        isHighlighted={highlightedId === item.id}
        onDeletionComplete={onDeletionComplete}
        t={t}
        i18n={i18n}
        isSelectionMode={isSelectionMode}
        isSelected={selectedIds.includes(item.id)}
        onToggleSelection={() => toggleMessageSelection(item.id)}
      />
    );
  }, [user, partner, deletingMessageIds, t, i18n, isSelectionMode, selectedIdsKey, highlightedId, searchQuery, isSearchVisible, handleReplyPress]);

  const renderEmptyChat = () => {
    if (isInitialLoad) {
      return (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <IconSymbol name="bubble.left.and.bubble.right.fill" size={40} color={Colors.dark.primary} />
        </View>
        <Text style={styles.emptyTitle}>
          {t('chat.start_conversation', { name: partner?.name || 'User' })}
        </Text>
        <Text style={styles.emptySubtitle}>
          {t('chat.start_hint')}
        </Text>
      </View>
    );
  };

  return (
    <View style={[styles.safeArea, { paddingTop: Platform.OS === 'android' ? insets.top + 10 : insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/(tabs)/chats');
          }
        }} style={styles.backBtn}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.partnerInfo}>
          <View style={styles.avatarBadgeWrapper}>
            <StoryAvatar 
              userId={partnerId} 
              avatarUrl={partner?.avatar} 
              name={partner?.name} 
              size={40}
              hasStories={hasPartnerStories}
              allViewed={areStoriesAllViewed}
              onPress={() => partner?.avatar ? setFullScreenAvatarVisible(true) : null}
              onStoryPress={async () => {
                try {
                  const q = query(
                    collection(db, 'stories'),
                    where('userId', '==', partnerId),
                    where('status', '==', 'approved')
                  );
                  const storiesSnap = await getDocs(q);
                  const now = new Date();
                  const userStories = storiesSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(s => {
                      const expiresAt = s.expiresAt ? (s.expiresAt.toDate ? s.expiresAt.toDate() : new Date(s.expiresAt)) : null;
                      return expiresAt && expiresAt > now;
                    })
                    .sort((a, b) => {
                      const timeA = a.createdAt?.toMillis?.() || 0;
                      const timeB = b.createdAt?.toMillis?.() || 0;
                      return timeA - timeB;
                    });

                  if (userStories.length > 0) {
                    setViewerStories(userStories);
                    setViewerVisible(true);
                  }
                } catch (e) {
                  console.error("Error loading stories for viewer:", e);
                }
              }}
            />
            {partner?.minutesBalance !== undefined && currentUserData && normalizeGender(currentUserData.gender || currentUserData.sex) === 'female' && normalizeGender(partner.gender || partner.sex) === 'male' && (
              <View style={styles.avatarBalanceBadge}>
                <Text style={styles.avatarBalanceText}>{partner.minutesBalance}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, justifyContent: 'center', marginLeft: 10, marginRight: 85 }}>
            <Text style={styles.headerName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{partner?.name || 'Loading...'}{partner?.age ? `, ${partner.age}` : ''}</Text>
            <Text 
              style={[styles.onlineStatus, { color: isOnline ? Colors.dark.primary : 'rgba(255,255,255,0.5)' }]} 
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {isOnline
                ? t('profile.online', 'В мережі')
                : (lastSeenText || t('profile.offline', 'Був(ла) нещодавно'))}
            </Text>
          </View>
        </View>


        <TouchableOpacity 
          onPress={performStartCall} 
          style={[styles.callHeaderBtn, !isOnline && { opacity: 0.5 }]} 
          disabled={!isOnline}
        >
          <Ionicons name="videocam" size={24} color="#fff" />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setIsSearchVisible(prev => !prev)} style={styles.headerSearchBtn}>
          <Ionicons
            name={isSearchVisible ? "search-circle" : "search-outline"}
            size={26}
            color={isSearchVisible ? Colors.dark.primary : "#fff"}
          />
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
          <IconSymbol name="ellipsis.circle" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {isSearchVisible && (
        <View style={styles.searchBarContainer}>
          <TextInput
            style={styles.searchBarInput}
            placeholder={t('chat.search_placeholder', 'Search in conversation...')}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={searchQuery}
            onChangeText={handleSearch}
            onSubmitEditing={() => {
              if (searchResults.length > 0) jumpToMatch(searchResults[0]);
            }}
            returnKeyType="search"
            autoFocus
          />

          <View style={styles.searchNavControls}>
            {searchQuery.length > 0 && searchResults.length === 0 ? (
              <Text style={[styles.searchCountText, { color: '#ff4b4b' }]}>
                {t('chat.search_no_results', 'No results found')}
              </Text>
            ) : searchResults.length > 0 && (
              <Text style={styles.searchCountText}>
                {currentMatchIndex + 1} / {searchResults.length}
              </Text>
            )}

            <TouchableOpacity onPress={prevMatch} style={styles.searchNavBtn} disabled={searchResults.length === 0}>
              <Ionicons name="chevron-up" size={24} color={searchResults.length > 0 ? "#00fbff" : "rgba(255,255,255,0.2)"} />
            </TouchableOpacity>

            <TouchableOpacity onPress={nextMatch} style={styles.searchNavBtn} disabled={searchResults.length === 0}>
              <Ionicons name="chevron-down" size={24} color={searchResults.length > 0 ? "#00fbff" : "rgba(255,255,255,0.2)"} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setSearchQuery('');
                setSearchResults([]);
                setCurrentMatchIndex(-1);
                setHighlightedId(null);
                setIsSearchVisible(false);
              }}
              style={styles.searchNavBtn}
            >
              <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.6)" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1, paddingBottom: Platform.OS === 'android' ? (keyboardHeight > 0 ? keyboardHeight + 16 : 0) : 0 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>

        <FlatList
          ref={flatListRef}
          style={{ flex: 1, width: '100%' }}
          data={groupedMessages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          onScrollToIndexFailed={(info) => {
            flatListRef.current?.scrollToOffset({
              offset: info.averageItemLength * info.index,
              animated: false
            });
            setTimeout(() => {
              flatListRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 });
            }, 100);
          }}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            setShowScrollArrows(y > 300);
          }}
          scrollEventThrottle={16}
          contentContainerStyle={[
            styles.messagesList,
            groupedMessages.length === 0 && { flexGrow: 1, justifyContent: 'center' }
          ]}
          inverted={groupedMessages.length > 0}
          ListEmptyComponent={renderEmptyChat}
          initialNumToRender={50}
          maxToRenderPerBatch={30}
          windowSize={21}
          removeClippedSubviews={Platform.OS === 'android'}
          onEndReached={() => {
            if (messages.length >= messagesLimit) {
              setMessagesLimit(prev => prev + 50);
            }
          }}
          onEndReachedThreshold={0.5}
        />

        {/* Quick Navigation Arrows (Browser-style) */}
        {showScrollArrows && (
          <View style={styles.scrollArrowsContainer}>
            <TouchableOpacity
              onPress={() => flatListRef.current?.scrollToEnd({ animated: true })}
              style={styles.scrollArrowBtn}
            >
              <Ionicons name="chevron-up" size={20} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => flatListRef.current?.scrollToOffset({ offset: 0, animated: true })}
              style={[styles.scrollArrowBtn, { marginTop: 8 }]}
            >
              <Ionicons name="chevron-down" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {editingMessage || replyingToMessage ? (
          <View style={styles.activeActionContainer}>
            <View style={styles.activeActionLine} />
            <View style={styles.activeActionContent}>
              <Text style={styles.activeActionTitle}>
                {editingMessage ? t('common.edit') : t('chat.replying_to', { name: replyingToMessage.senderId === user.uid ? 'Me' : (partner?.name || 'User') })}
              </Text>
              <Text style={styles.activeActionText} numberOfLines={1}>
                {editingMessage ? originalEditText : (() => {
                  if (replyingToMessage.type === 'gift') {
                    const gift = getGiftById(replyingToMessage.giftId);
                    if (gift) {
                      const localizedName = t(gift.nameKey);
                      return `🎁 «${localizedName}» (+${replyingToMessage.minutes} ${t('gifts.minutes_unit')})`;
                    }
                  }
                  return replyingToMessage.text;
                })()}
              </Text>
            </View>
            <TouchableOpacity onPress={editingMessage ? cancelEdit : cancelReply} style={styles.activeActionClose}>
              <Ionicons name="close-circle" size={24} color="rgba(255,255,255,0.5)" />
            </TouchableOpacity>
          </View>
        ) : isPartnerTyping && !isBlockedByMe && !isBlockedByPartner && (
          <View style={styles.typingContainer}>
            <Text style={styles.typingText}>{t('chat.is_typing', { name: name || 'Partner' })}</Text>
            <View style={styles.typingDots}>
              <Animated.View style={[styles.typingDot, dotStyle1]} />
              <Animated.View style={[styles.typingDot, dotStyle2]} />
              <Animated.View style={[styles.typingDot, dotStyle3]} />
            </View>
          </View>
        )}

        {isSelectionMode ? (
          <View style={styles.selectionToolbar}>
            <TouchableOpacity onPress={cancelSelection} style={styles.selectionCancelBtn}>
              <Text style={styles.selectionCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>

            <View style={styles.selectionCountContainer}>
              <Text style={styles.selectionCountText}>
                {t('chat.selected_count', { count: selectedIds.length })}
              </Text>
            </View>

            <View style={styles.selectionDeleteContainer}>
              <TouchableOpacity
                onPress={handleBulkDelete}
                style={[styles.selectionDeleteBtn, selectedIds.length === 0 && { opacity: 0.5 }]}
                disabled={selectedIds.length === 0}
              >
                <Ionicons name="trash" size={24} color="#ff4d4d" />
              </TouchableOpacity>
            </View>
          </View>
        ) : isBlockedByMe ? (
          <View style={styles.blockedInputContainer}>
            <Text style={styles.blockedText}>{t('chat.you_blocked_user', 'You blocked this user')}</Text>
            <TouchableOpacity style={styles.unblockBtn} onPress={performUnblock}>
              <IconSymbol name="person.fill.checkmark" size={20} color="#fff" />
              <Text style={styles.unblockBtnText}>{t('chat.unblock_user')}</Text>
            </TouchableOpacity>
          </View>
        ) : isBlockedByPartner ? (
          <View style={styles.blockedInputContainer}>
            <Text style={styles.blockedText}>{t('chat.user_blocked_you', 'This user has blocked you')}</Text>
          </View>
        ) : (
          <View style={styles.inputContainer}>
            {editingMessage ? (
              <>
                <View style={styles.textInputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder={t('chat.edit_placeholder', 'Edit message...')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={editText}
                    onChangeText={setEditText}
                    multiline
                  />
                </View>
                <TouchableOpacity style={styles.sendBtn} onPress={saveEdit}>
                  <Ionicons name="checkmark" size={24} color="#fff" />
                </TouchableOpacity>
              </>
            ) : (
              <>
                {normalizeGender(currentUserData?.gender || currentUserData?.sex) === 'male' && normalizeGender(partner?.gender || partner?.sex) === 'female' && (
                  <TouchableOpacity style={styles.giftIconBtn} onPress={() => setGiftModalVisible(true)}>
                    <IconSymbol name="gift" size={24} color="#f1c40f" />
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.leftIconBtn} onPress={handleAttachment}>
                  <Ionicons name="attach-outline" size={28} color={Colors.dark.primary} style={{ transform: [{ rotate: '45deg' }] }} />
                </TouchableOpacity>
                <View style={styles.textInputWrapper}>
                  <TextInput
                    ref={inputRef}
                    style={styles.input}
                    placeholder={t('chat.message_placeholder', { name: partner?.name || '...' })}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    value={inputText}
                    onChangeText={(text) => {
                      setInputText(text);
                      handleTyping();
                    }}
                    multiline
                  />
                  <View style={styles.innerIconsContainer}>
                    <TouchableOpacity style={styles.innerIconBtn} onPress={() => setIsEmojiPickerOpen(true)}>
                      <Ionicons name="happy-outline" size={24} color="rgba(255,255,255,0.5)" />
                    </TouchableOpacity>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.sendBtn, (!inputText.trim() && !sending) && { opacity: 0.5 }]}
                  onPress={sendMessage}
                  disabled={!inputText.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="send" size={20} color="#fff" />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}


        <MessageContextMenu
          visible={contextMenuVisible}
          onClose={() => setContextMenuVisible(false)}
          position={contextMenuPos}
          messageType={selectedMessage?.type}
          isMe={selectedMessage?.senderId === user?.uid}
          onAction={handleContextMenuAction}
          onReaction={handleReaction}
        />

        <ActionMenu
          isVisible={menuVisible}
          onClose={() => setMenuVisible(false)}
          title={`${partner?.name || 'Chat Options'}${partner?.age ? `, ${partner.age}` : ''}`}
          options={[
            {
              label: t('chat.view_profile'),
              icon: 'person.fill',
              color: '#3498db',
              onPress: () => setUserProfileVisible(true)
            },
            // Dynamic friend management
            friendshipStatus === 'friends' ? {
              label: t('chat.remove_friend_btn'),
              icon: 'person.badge.minus',
              isDestructive: true,
              color: '#f06292',
              onPress: () => setRemoveFriendConfirmVisible(true)
            } : friendshipStatus === 'not_friends' ? {
              label: t('chat.add_friend_btn'),
              icon: 'person.badge.plus',
              color: '#2ecc71',
              onPress: performAddFriend
            } : friendshipStatus === 'request_sent' ? {
              label: t('chat.request_sent'),
              icon: 'clock.fill',
              color: '#95a5a6',
              onPress: () => { }
            } : friendshipStatus === 'request_received' ? {
              label: t('chat.check_requests'),
              icon: 'bell.fill',
              color: '#9b59b6',
              onPress: () => router.push('/(tabs)/friends')
            } : null,
            {
              label: t('chat.clear_chat'),
              icon: 'trash.fill',
              color: '#e67e22',
              onPress: () => setClearConfirmVisible(true)
            },
            {
              label: t('chat.report_user'),
              icon: 'flag.fill',
              color: '#f1c40f',
              onPress: () => setReportModalVisible(true)
            },
            isBlockedByMe ? {
              label: t('chat.unblock_user'),
              icon: 'person.fill.checkmark',
              color: '#1abc9c',
              onPress: performUnblock
            } : {
              label: t('chat.block_user'),
              icon: 'slash.circle',
              isDestructive: true,
              color: '#e74c3c',
              onPress: () => setBlockConfirmVisible(true)
            }
          ].filter(Boolean)}
        />

        <ActionModal
          visible={clearConfirmVisible}
          onClose={() => setClearConfirmVisible(false)}
          onConfirm={performClearChat}
          title={t('chat.confirm_clear_title')}
          message={t('chat.confirm_clear_text')}
          confirmText={t('chat.clear_chat')}
          isDestructive={true}
        />

        <ActionModal
          visible={removeFriendConfirmVisible}
          onClose={() => setRemoveFriendConfirmVisible(false)}
          onConfirm={performRemoveFriend}
          title={t('chat.remove_friend_btn')}
          message={t('friends.remove_confirm_msg', { name: partner?.name || 'User' })}
          confirmText={t('friends.remove_btn')}
          isDestructive={true}
        />

        <ReportUserModal
          isVisible={reportModalVisible}
          onClose={() => setReportModalVisible(false)}
          reportedUser={partner}
          currentUser={user}
          onSuccess={() => {
            setReportModalVisible(false);
            setReportSuccessVisible(true);
          }}
        />

        <ActionModal
          visible={reportSuccessVisible}
          onClose={() => setReportSuccessVisible(false)}
          title={t('common.success', 'Success')}
          message={t('chat.report_success_toast')}
          confirmText={t('common.ok', 'OK')}
          showCancel={false}
        />

        <UserProfileModal
          isVisible={userProfileVisible}
          onClose={() => setUserProfileVisible(false)}
          userId={partnerId}
        />

        <ActionModal
          visible={blockConfirmVisible}
          onClose={() => setBlockConfirmVisible(false)}
          title={t('chat.block_user')}
          message={t('chat.block_confirm_msg', 'Are you sure you want to block this user?')}
          confirmText={t('chat.block_user')}
          onConfirm={() => {
            setBlockConfirmVisible(false);
            performBlock();
          }}
          isDestructive={true}
        />

        <StoryViewer
          visible={viewerVisible}
          stories={viewerStories}
          userName={partner?.name}
          userAvatar={partner?.avatar}
          onClose={() => setViewerVisible(false)}
        />

        <Modal visible={fullScreenAvatarVisible} transparent={false} animationType="fade" statusBarTranslucent>
          <View style={[styles.fullScreenOverlay, { paddingTop: insets.top }]}>
            <TouchableOpacity
              style={[styles.fullScreenCloseBtn, { top: insets.top + 20 }]}
              onPress={() => setFullScreenAvatarVisible(false)}
            >
              <IconSymbol name="xmark" size={24} color="#fff" />
            </TouchableOpacity>
            {(partner?.originalAvatarUrl || partner?.avatar) && (
              <Image
                source={{ uri: partner.originalAvatarUrl || partner.avatar }}
                style={styles.fullScreenImage}
                resizeMode="contain"
              />
            )}
          </View>
        </Modal>

        <Modal visible={!!fullScreenMedia} transparent={false} animationType="fade" statusBarTranslucent>
          <View style={[
            styles.fullScreenOverlay,
            {
              paddingTop: insets.top,
              paddingBottom: Platform.OS === 'android' ? (insets.bottom + 30) : insets.bottom
            }
          ]}>
            <TouchableOpacity
              style={[styles.fullScreenCloseBtn, { top: insets.top + 20 }]}
              onPress={() => setFullScreenMedia(null)}
            >
              <IconSymbol name="xmark" size={24} color="#fff" />
            </TouchableOpacity>
            {fullScreenMedia && (
              <View style={styles.fullScreenContentContainer}>
                {fullScreenMedia.type === 'video' ? (
                  <Video
                    source={{ uri: fullScreenMedia.uri }}
                    style={styles.fullScreenVideo}
                    resizeMode={ResizeMode.CONTAIN}
                    useNativeControls
                    shouldPlay
                  />
                ) : (
                  <Image
                    source={{ uri: fullScreenMedia.uri }}
                    style={styles.fullScreenImage}
                    resizeMode="contain"
                  />
                )}
              </View>
            )}
          </View>
        </Modal>

        <EmojiPicker
          onEmojiSelected={(emojiObject) => {
            setInputText(prev => prev + emojiObject.emoji);
          }}
          open={isEmojiPickerOpen}
          onClose={() => setIsEmojiPickerOpen(false)}
          enableSearchBar={true}
        />

        <ActionModal
          visible={deleteMsgConfirmVisible}
          onClose={() => setDeleteMsgConfirmVisible(false)}
          title={isSelectionMode ? t('chat.confirm_delete_selected_title') : t('chat.confirm_delete_msg_title')}
          message={isSelectionMode
            ? t('chat.confirm_delete_selected_text', { count: selectedIds.length })
            : t('chat.confirm_delete_msg_text')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          onConfirm={onConfirmDelete}
          isDestructive={true}
        />

        <Toast
          visible={toastVisible}
          message={toastMessage}
          onHide={() => setToastVisible(false)}
        />

        <GiftModal
          visible={giftModalVisible}
          onClose={() => setGiftModalVisible(false)}
          onSendGift={handleSendGift}
          userBalance={currentUserData?.minutesBalance || 0}
          recipientName={partner?.name || 'User'}
        />
      </KeyboardAvoidingView>


      {activeGiftAnimation && (
        <GiftAnimationOverlay
          gift={activeGiftAnimation.gift}
          isSender={activeGiftAnimation.isSender}
          partnerName={activeGiftAnimation.partnerName}
          onComplete={() => setActiveGiftAnimation(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.dark.background
  },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingHorizontal: 16,
    zIndex: 100,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  searchBarInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 4,
  },
  searchClearBtn: {
    marginLeft: 8,
  },
  searchBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  scrollArrowsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 100,
    zIndex: 1000,
  },
  scrollArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  menuBtn: {
    padding: 8,
    position: 'absolute',
    right: 8,
  },
  headerSearchBtn: {
    padding: 8,
    position: 'absolute',
    right: 44,
  },
  callHeaderBtn: {
    padding: 8,
    position: 'absolute',
    right: 80,
  },
  giftHeaderBtn: {
    padding: 8,
    position: 'absolute',
    right: 116,
  },
  partnerInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    borderWidth: 1,
    borderColor: Colors.dark.primary
  },
  headerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.primary
  },
  headerAvatarInitial: { color: Colors.dark.primary, fontSize: 16, fontWeight: '700' },
  avatarBadgeWrapper: {
    position: 'relative',
    marginBottom: 4,
  },
  avatarBalanceBadge: {
    position: 'absolute',
    bottom: -4,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 20,
  },
  avatarBalanceText: {
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    color: '#f1c40f',
    fontSize: 8,
    fontWeight: '800',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    overflow: 'hidden',
    textAlign: 'center',
  },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '700', marginLeft: 0 },
  onlineStatus: { fontSize: 11, marginLeft: 0, marginTop: 2 },
  messagesList: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 0 },
  messageWrapper: { flexDirection: 'row', maxWidth: '80%' },
  myWrapper: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  partnerWrapper: { alignSelf: 'flex-start', justifyContent: 'flex-start' },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, alignSelf: 'flex-end', marginRight: 8 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  myBubble: { backgroundColor: Colors.dark.primary, borderBottomRightRadius: 4 },
  partnerBubble: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
  messageText: { fontSize: 16, lineHeight: 22 },
  myText: { color: '#fff' },
  partnerText: { color: '#ecf0f1' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 },
  timeText: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  messageImage: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },
  messageVideo: { width: 240, height: 180, borderRadius: 12, marginBottom: 4 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 22 : 12,
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)'
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  typingText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    fontStyle: 'italic',
    marginRight: 6,
  },
  typingDots: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4, // Lower the dots a bit
  },
  typingDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.dark.primary,
    marginHorizontal: 1.5,
  },
  giftIconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftIconBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 20,
    alignItems: 'flex-end',
    paddingRight: 4,
    minHeight: 40,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: Platform.OS === 'ios' ? 16 : 15,
    paddingHorizontal: 12,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 120,
    minHeight: 40
  },
  innerIconsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 40,
    justifyContent: 'center',
  },
  innerIconBtn: {
    padding: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.dark.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8
  },
  blockedInputContainer: {
    padding: 16,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  blockedText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  unblockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  unblockBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 6,
  },
  fullScreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenCloseBtn: {
    position: 'absolute',
    right: 12,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  fullScreenContentContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenVideo: {
    width: '100%',
    height: '100%',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(13, 139, 209, 0.1)', // Colors.dark.primary with 10% opacity
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(13, 139, 209, 0.2)', // Colors.dark.primary with 20% opacity
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    lineHeight: 20,
  },
  dateDividerContainer: {
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    position: 'relative'
  },
  dateDividerLine: {
    position: 'absolute',
    height: 1,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.1)',
    zIndex: 1
  },
  dateDividerBadge: {
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 2
  },
  dateDividerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '600'
  },
  activeActionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  activeActionLine: {
    width: 3,
    height: '70%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
    marginRight: 12,
  },
  activeActionContent: {
    flex: 1,
    justifyContent: 'center',
  },
  activeActionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: Colors.dark.primary,
    marginBottom: 2,
  },
  activeActionText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
  },
  activeActionClose: {
    padding: 4,
  },
  selectionToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c263b',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 20,
    position: 'relative',
    height: Platform.OS === 'ios' ? 90 : 68,
  },
  selectionCancelBtn: {
    zIndex: 10,
    paddingVertical: 8,
  },
  selectionCancelText: {
    color: '#bdc3c7',
    fontSize: 16,
    fontWeight: '600',
  },
  selectionCountContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 12,
    bottom: Platform.OS === 'ios' ? 34 : 12,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  selectionCountText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  selectionDeleteContainer: {
    position: 'absolute',
    right: 20,
    top: 12,
    zIndex: 10,
  },
  selectionDeleteBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 77, 77, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    zIndex: 100,
  },
  searchBarInput: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
    paddingVertical: 4,
  },
  searchClearBtn: {
    marginLeft: 8,
  },
  searchBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  scrollArrowsContainer: {
    position: 'absolute',
    right: 12,
    bottom: 100,
    zIndex: 1000,
  },
  scrollArrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  searchNavControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchNavBtn: {
    padding: 6,
    marginLeft: 4,
  },
  searchCountText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginRight: 8,
    fontWeight: '600',
  },
});
