import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  TextInput,
  Keyboard,
  KeyboardAvoidingView
} from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  interpolate,
  runOnJS 
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  getDoc,
  getDocs,
  limit,
  writeBatch,
  addDoc
} from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { ActionModal } from '../../components/ui/ActionModal';
import { Toast } from '../../components/ui/Toast';
import { SearchablePicker } from '../../components/ui/SearchablePicker';
import { Country, City } from 'country-state-city';
import { deduplicateCities } from '../../utils/locationUtils';
import { getAvatarColor } from '../../utils/avatarUtils';
import { useRouter } from 'expo-router';
import { OnlineStatusIndicator } from '../../components/ui/OnlineStatusIndicator';
import { StoryAvatar } from '../../components/ui/StoryAvatar';
import { StoryViewer } from '../../components/ui/StoryViewer';
import { LinearGradient } from 'expo-linear-gradient';

// In-memory cache for search — force reset on app reload
let globalUsersCache = null;
let globalUsersCacheTimestamp = null;

// Force clear stale cache on module load
globalUsersCache = null;
globalUsersCacheTimestamp = null;

export default function RequestsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = auth.currentUser;

  const [activeTab, setActiveTab] = useState('incoming'); // Default to incoming as requested
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [userProfiles, setUserProfiles] = useState({}); // Stores { name, avatar, age } by UID
  const [friendsList, setFriendsList] = useState([]);
  const [myBlockedIds, setMyBlockedIds] = useState([]);
  const [blockedMeIds, setBlockedMeIds] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const filterExpandProgress = useSharedValue(0);


  const animatedFiltersStyle = useAnimatedStyle(() => {
    return {
      height: interpolate(filterExpandProgress.value, [0, 1], [0, 100]),
      opacity: filterExpandProgress.value,
      overflow: 'hidden',
    };
  });

  const toggleFilters = () => {
    const nextState = !showFilters;
    if (nextState) {
      setShowFilters(true);
      filterExpandProgress.value = withTiming(1, { duration: 300 });
    } else {
      filterExpandProgress.value = withTiming(0, { duration: 250 }, () => {
        runOnJS(setShowFilters)(false);
      });
    }
  };

  const [searchFilters, setSearchFilters] = useState({ country: '', city: '', countryIso: '', chatType: '' });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);

  // Pickers
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showChatTypePicker, setShowChatTypePicker] = useState(false);
  
  const [toast, setToast] = useState({ visible: false, messageKey: '', messageParams: {}, type: 'success' });
  const [actionModal, setActionModal] = useState({
    visible: false, title: '', message: '', confirmText: 'OK', onConfirm: () => {}, isDestructive: false, showCancel: true
  });
  
  // Story States
  const [activeStoryUserIds, setActiveStoryUserIds] = useState(new Set());
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStories, setViewerStories] = useState([]);
  const [viewerUser, setViewerUser] = useState({ name: '', avatar: '' });

  const [currentUserData, setCurrentUserData] = useState(null);
  
  // Reset tab to 'incoming' when screen is focused
  useFocusEffect(
    useCallback(() => {
      setActiveTab('incoming');
      setSearchQuery('');
    }, [])
  );


  const allCountries = useMemo(() => {
    return Country.getAllCountries().map(c => ({
      label: `${c.flag} ${c.name}`,
      value: c.name,
      isoCode: c.isoCode
    }));
  }, []);

  const allCities = useMemo(() => {
    if (!searchFilters.countryIso) return [];
    const cities = City.getCitiesOfCountry(searchFilters.countryIso);
    return deduplicateCities(cities).map(c => ({
      label: c.name,
      value: c.name
    }));
  }, [searchFilters.countryIso]);

  const allChatTypes = useMemo(() => [
    { label: t('search.all_chat_types', 'All Chat Types'), value: '' },
    { label: t('search.chat_type_normal', 'Normal communication'), value: 'normal' },
    { label: t('search.chat_type_18', 'Communication 18+'), value: '18+' }
  ], [t]);

  // 1. Incoming Requests
  useEffect(() => {
    if (!user) return;
    const incomingQuery = query(
      collection(db, 'friendRequests'),
      where('toUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(incomingQuery, (snap) => {
      setIncomingRequests(snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      );
      setLoading(false);
    }, (err) => console.warn('IncomingReq listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  // 2. Sent Requests
  useEffect(() => {
    if (!user) return;
    const sentQuery = query(
      collection(db, 'friendRequests'),
      where('fromUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsub = onSnapshot(sentQuery, (snap) => {
      setSentRequests(snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      );
    }, (err) => console.warn('SentReq listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  // 3. Friends List
  useEffect(() => {
    if (!user) return;
    const friendsQuery = query(
      collection(db, 'friends'),
      where('userId', '==', user.uid)
    );
    const unsub = onSnapshot(friendsQuery, (snap) => {
      setFriendsList(snap.docs.map(doc => doc.data().friendId));
    }, (err) => console.warn('FriendsList listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  // 4. Blocks (Bidirectional)
  useEffect(() => {
    if (!user) return;
    
    const unsubMyBlocks = onSnapshot(query(collection(db, 'blocks'), where('blockerId', '==', user.uid)), (snap) => {
      setMyBlockedIds(snap.docs.map(doc => doc.data().blockedId).filter(Boolean));
      globalUsersCacheTimestamp = 0; // Invalidate cache
    }, (err) => console.warn('MyBlockedIds listener error:', err));

    const unsubBlockedMe = onSnapshot(query(collection(db, 'blocks'), where('blockedId', '==', user.uid)), (snap) => {
      setBlockedMeIds(snap.docs.map(doc => doc.data().blockerId).filter(Boolean));
      globalUsersCacheTimestamp = 0; // Invalidate cache
    }, (err) => console.warn('BlockedMeIds listener error:', err));

    const unsubProfile = onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setCurrentUserData(snap.data());
    }, (err) => console.warn('Profile listener error:', err));

    return () => {
      unsubMyBlocks();
      unsubBlockedMe();
      unsubProfile();
    };
  }, [user?.uid]);

  // 5. Listen for all active stories to show rings
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'stories'),
      where('status', '==', 'approved')
    );
    const unsub = onSnapshot(q, (snap) => {
      const now = new Date();
      const ids = new Set();
      snap.docs.forEach(doc => {
        const data = doc.data();
        const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)) : null;
        if (expiresAt && expiresAt > now) {
          ids.add(data.userId);
        }
      });
      setActiveStoryUserIds(ids);
    }, (err) => console.warn('StoriesReq listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  const isUserSoftDeleted = (u) => {
    if (!u) return true;
    const status = typeof u.status === 'string' ? u.status.toLowerCase() : '';
    return (
      u.deleted === true ||
      u.isDeleted === true ||
      u.accountDeleted === true ||
      u.disabled === true ||
      u.isDisabled === true ||
      u.active === false ||
      u.enabled === false ||
      ['deleted', 'disabled', 'deactivated', 'blocked'].includes(status)
    );
  };


  // Fetch missing user data (name, avatar, age) for incoming and sent requests
  useEffect(() => {
    const fetchUserData = async () => {
      const allReqs = [...incomingRequests, ...sentRequests];
      const uidsToFetch = [...new Set(
        allReqs.map(r => r.fromUserId === user?.uid ? r.toUserId : r.fromUserId)
      )].filter(uid => uid && !userProfiles[uid]);

      if (uidsToFetch.length === 0) return;

      const newProfiles = { ...userProfiles };
      let updated = false;

      await Promise.all(
        uidsToFetch.map(async (uid) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              newProfiles[uid] = {
                name: data.name || data.displayName || 'User',
                avatar: data.avatar || data.photoURL || '',
                age: data.age || null
              };
              updated = true;
            } else {
              newProfiles[uid] = { name: 'User', avatar: '', age: null };
              updated = true;
            }
          } catch (e) {
            console.error("Error fetching request user data:", e);
          }
        })
      );

      if (updated) {
        setUserProfiles(newProfiles);
      }
    };

    if (user && (incomingRequests.length > 0 || sentRequests.length > 0)) {
      fetchUserData();
    }
  }, [incomingRequests, sentRequests, user]);

  const searchUsers = useCallback(async () => {
    if (!user) return;
    const isSearchingActive = searchQuery.trim() !== '' || searchFilters.country || searchFilters.city || searchFilters.chatType;
    
    if (!isSearchingActive) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      let querySnapshotDocs = [];
      const CACHE_TTL = 10 * 60 * 1000;
      const now = Date.now();

      if (globalUsersCache && globalUsersCacheTimestamp && (now - globalUsersCacheTimestamp < CACHE_TTL)) {
        querySnapshotDocs = globalUsersCache;
      } else {
        const usersQuery = query(collection(db, 'users'), limit(500));
        const snap = await getDocs(usersQuery);
        const docs = snap.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id }));
        globalUsersCache = docs;
        globalUsersCacheTimestamp = Date.now();
        querySnapshotDocs = docs;
      }

      const term = searchQuery.toLowerCase().trim();
      
      // Filter results: exclude self, admin, soft-deleted, and blocked users
      const results = querySnapshotDocs.filter(u => {
        const uid = u.id || u.uid;
        
        // 1. Exclude self and Admin
        if (!uid || uid === user.uid) return false;
        if (u.email === 'admin@nexus.com' || uid === '4bM0UTvNA8XHUOqv1fyzz2lYQeO2') return false;
        
        // 2. Soft-Delete & Admin-Block Check (matches Web version)
        if (isUserSoftDeleted(u)) return false;

        // 3. Exclude based on who blocked me (Unidirectional: blocker can still see blocked)
        if (blockedMeIds.includes(uid)) return false;

        const matchesName = u.name && u.name.toLowerCase().includes(term);
        const matchesUid = term.length >= 6 && uid && uid.toLowerCase().startsWith(term);
        const matchesText = !term || matchesName || matchesUid;

        const matchesCountry = !searchFilters.country || (u.country && u.country.toLowerCase() === searchFilters.country.toLowerCase());
        const matchesCity = !searchFilters.city || (u.city && u.city.toLowerCase() === searchFilters.city.toLowerCase());
        
        const uChatType = (u.chatType || u.communication_mode || '').toLowerCase();
        const fChatType = (searchFilters.chatType || '').toLowerCase();
        const matchesChatType = !fChatType || uChatType === fChatType;

        return matchesText && matchesCountry && matchesCity && matchesChatType;
      });

      // Sort matches: UA / Cyrillic -> Latin -> Digits -> Others
      results.sort((a, b) => {
        const nameA = a.name || '';
        const nameB = b.name || '';
        
        const getPriority = (str) => {
          if (!str) return 99;
          const char = str.charAt(0).toLowerCase();
          // Ukrainian / Cyrillic
          if (/[\u0400-\u04FF]/.test(char)) return 0;
          // English / Latin
          if (/[a-z]/.test(char)) return 1;
          // Digits
          if (/[0-9]/.test(char)) return 2;
          return 3;
        };

        const pA = getPriority(nameA);
        const pB = getPriority(nameB);

        if (pA !== pB) return pA - pB;
        
        return nameA.localeCompare(nameB, 'uk-UA', { sensitivity: 'base' });
      });

      setSearchResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchFilters, user, myBlockedIds, blockedMeIds]);

  useEffect(() => {
    const isActive = searchQuery.trim() !== '' || searchFilters.country || searchFilters.city || searchFilters.chatType;
    if (isActive) setSearching(true);
    const timer = setTimeout(() => {
      searchUsers();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, searchFilters, searchUsers]);

  const sendFriendRequest = async (targetUser) => {
    if (!user || targetUser.uid === user.uid) return;

    // Check if I blocked this user
    if (myBlockedIds.includes(targetUser.uid)) {
      setToast({ visible: true, messageKey: 'friends.unblock_first', messageParams: {}, type: 'error' });
      return;
    }

    // Check if this user blocked ME
    if (blockedMeIds.includes(targetUser.uid)) {
      setToast({ visible: true, messageKey: 'friends.blocked_by_user', messageParams: {}, type: 'error' });
      return;
    }

    setProcessingId(targetUser.uid);
    try {
      const senderDoc = await getDoc(doc(db, 'users', user.uid));
      const senderData = senderDoc.data() || {};

      const existing = await getDocs(query(
        collection(db, 'friendRequests'), 
        where('fromUserId', '==', user.uid), 
        where('toUserId', '==', targetUser.uid)
      ));

      if (!existing.empty) {
        setToast({ visible: true, messageKey: 'friends.request_error', messageParams: {}, type: 'error' });
        setProcessingId(null);
        return;
      }

      const requestData = {
        fromUserId: user.uid,
        fromUserName: senderData.name || 'Unknown',
        fromUserAvatar: senderData.avatar || '',
        fromUserCity: senderData.city || '',
        fromUserCountry: senderData.country || '',
        toUserId: targetUser.uid,
        toUserName: targetUser.name || 'Unknown',
        toUserAvatar: targetUser.avatar || '',
        toUserCity: targetUser.city || '',
        toUserCountry: targetUser.country || '',
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'friendRequests'), requestData);
      setToast({ visible: true, messageKey: 'friends.request_sent', messageParams: { name: targetUser.name || 'User' }, type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ visible: true, messageKey: 'friends.request_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const handleAcceptAll = async () => {
    if (!user || incomingRequests.length === 0) return;
    
    setActionModal({
      visible: true,
      title: t('friends.accept_all'),
      message: t('friends.confirm_accept_all'),
      confirmText: t('friends.accept_all'),
      isDestructive: false,
      showCancel: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
          const currentUserData = currentUserDoc.data() || {};
          
          // Fetch fresh profiles for all request senders
          const freshProfiles = {};
          await Promise.all(incomingRequests.map(async (req) => {
            try {
              const snap = await getDoc(doc(db, 'users', req.fromUserId));
              if (snap.exists()) freshProfiles[req.fromUserId] = snap.data();
            } catch (e) { console.error('Error fetching profile:', e); }
          }));

          const batch = writeBatch(db);
          for (const req of incomingRequests) {
            const fromData = freshProfiles[req.fromUserId] || {};
            const friendRef1 = doc(collection(db, 'friends'));
            batch.set(friendRef1, {
              userId: user.uid,
              friendId: req.fromUserId,
              friendName: fromData.name || req.fromUserName || 'Unknown',
              friendAvatar: fromData.avatar || req.fromUserAvatar || '',
              friendCity: fromData.city || req.fromUserCity || '',
              friendCountry: fromData.country || req.fromUserCountry || '',
              addedAt: serverTimestamp()
            });

            const friendRef2 = doc(collection(db, 'friends'));
            batch.set(friendRef2, {
              userId: req.fromUserId,
              friendId: user.uid,
              friendName: currentUserData.name || 'Unknown',
              friendAvatar: currentUserData.avatar || '',
              friendCity: currentUserData.city || '',
              friendCountry: currentUserData.country || '',
              addedAt: serverTimestamp()
            });

            const reqRef = doc(db, 'friendRequests', req.id);
            batch.delete(reqRef);
          }
          
          await batch.commit();
          setToast({ visible: true, messageKey: 'friends.bulk_accept_success', messageParams: {}, type: 'success' });
        } catch (error) {
          console.error("Error accepting all:", error);
          setToast({ visible: true, messageKey: 'friends.accept_error', messageParams: {}, type: 'error' });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleRejectAll = async () => {
    if (!user || incomingRequests.length === 0) return;
    
    setActionModal({
      visible: true,
      title: t('friends.reject_all'),
      message: t('friends.confirm_reject_all'),
      confirmText: t('friends.reject_all'),
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          for (const req of incomingRequests) {
            batch.delete(doc(db, 'friendRequests', req.id));
          }
          await batch.commit();
          setToast({ visible: true, messageKey: 'friends.bulk_reject_success', messageParams: {}, type: 'cancel' });
        } catch (error) {
          console.error("Error rejecting all:", error);
          setToast({ visible: true, messageKey: 'friends.reject_error', messageParams: {}, type: 'error' });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleAcceptWithGifts = async () => {
    if (!user || incomingRequests.length === 0) return;
    
    const giftRequests = incomingRequests.filter(r => r.hasGift === true || r.giftCount > 0);
    
    if (giftRequests.length === 0) {
      setToast({ visible: true, messageKey: 'friends.no_incoming_requests', messageParams: {}, type: 'cancel' });
      return;
    }

    setActionModal({
      visible: true,
      title: t('friends.accept_only_gifts'),
      message: t('friends.confirm_accept_gift_senders', { count: giftRequests.length }),
      confirmText: t('friends.accept_only_gifts'),
      isDestructive: false,
      showCancel: true,
      onConfirm: async () => {
        setLoading(true);
        try {
          const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
          const currentUserData = currentUserDoc.data() || {};
          
          // Fetch fresh profiles for all gift request senders
          const freshProfiles = {};
          await Promise.all(giftRequests.map(async (req) => {
            try {
              const snap = await getDoc(doc(db, 'users', req.fromUserId));
              if (snap.exists()) freshProfiles[req.fromUserId] = snap.data();
            } catch (e) { console.error('Error fetching profile:', e); }
          }));

          const batch = writeBatch(db);
          for (const req of giftRequests) {
            const fromData = freshProfiles[req.fromUserId] || {};
            const friendRef1 = doc(collection(db, 'friends'));
            batch.set(friendRef1, {
              userId: user.uid,
              friendId: req.fromUserId,
              friendName: fromData.name || req.fromUserName || 'Unknown',
              friendAvatar: fromData.avatar || req.fromUserAvatar || '',
              friendCity: fromData.city || req.fromUserCity || '',
              friendCountry: fromData.country || req.fromUserCountry || '',
              addedAt: serverTimestamp()
            });

            const friendRef2 = doc(collection(db, 'friends'));
            batch.set(friendRef2, {
              userId: req.fromUserId,
              friendId: user.uid,
              friendName: currentUserData.name || 'Unknown',
              friendAvatar: currentUserData.avatar || '',
              friendCity: currentUserData.city || '',
              friendCountry: currentUserData.country || '',
              addedAt: serverTimestamp()
            });

            const reqRef = doc(db, 'friendRequests', req.id);
            batch.delete(reqRef);
          }
          
          await batch.commit();
          setToast({ visible: true, messageKey: 'friends.bulk_accept_success', messageParams: {}, type: 'success' });
        } catch (error) {
          console.error("Error accepting gifts:", error);
          setToast({ visible: true, messageKey: 'friends.accept_error', messageParams: {}, type: 'error' });
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const acceptRequest = async (request) => {
    if (!user) return;

    setProcessingId(request.id);
    try {
      const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
      const fromUserDoc = await getDoc(doc(db, 'users', request.fromUserId));

      const currentUserData = currentUserDoc.data() || {};
      const fromUserData = fromUserDoc.data() || {};

      const batch = writeBatch(db);

      const friendRef1 = doc(collection(db, 'friends'));
      batch.set(friendRef1, {
        userId: user.uid,
        friendId: request.fromUserId,
        friendName: fromUserData.name || request.fromUserName || 'Unknown',
        friendAvatar: fromUserData.avatar || request.fromUserAvatar || '',
        friendCity: fromUserData.city || request.fromUserCity || '',
        friendCountry: fromUserData.country || request.fromUserCountry || '',
        addedAt: serverTimestamp()
      });

      const friendRef2 = doc(collection(db, 'friends'));
      batch.set(friendRef2, {
        userId: request.fromUserId,
        friendId: user.uid,
        friendName: currentUserData.name || 'Unknown',
        friendAvatar: currentUserData.avatar || '',
        friendCity: currentUserData.city || '',
        friendCountry: currentUserData.country || '',
        addedAt: serverTimestamp()
      });

      const reqRef = doc(db, 'friendRequests', request.id);
      batch.delete(reqRef);

      await batch.commit();

      setToast({ visible: true, messageKey: 'friends.friend_added', messageParams: { name: fromUserData.name || request.fromUserName || 'Unknown' }, type: 'success' });
    } catch (error) {
      console.error("Error accepting request:", error);
      setToast({ visible: true, messageKey: 'friends.accept_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const rejectRequest = async (request) => {
    setProcessingId(request.id);
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
      setToast({ visible: true, messageKey: 'friends.request_rejected', messageParams: { name: request.fromUserName || 'Unknown' }, type: 'cancel' });
    } catch (error) {
      console.error("Error rejecting request:", error);
      setToast({ visible: true, messageKey: 'friends.reject_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const cancelRequest = async (request) => {
    setProcessingId(request.id);
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
      setToast({ visible: true, messageKey: 'friends.request_canceled', messageParams: { name: request.toUserName || 'Unknown' }, type: 'cancel' });
    } catch (error) {
      console.error("Error cancelling request:", error);
      setToast({ visible: true, messageKey: 'friends.cancel_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const getFriendStatus = (uid) => {
    if (friendsList.includes(uid)) return 'friend';
    if (sentRequests.some(r => r.toUserId === uid)) return 'sent';
    if (incomingRequests.some(r => r.fromUserId === uid)) return 'incoming';
    return 'none';
  };

  const renderSearchItem = ({ item }) => {
    const status = getFriendStatus(item.uid);
    const isProcessing = processingId === item.uid;

    return (
      <View style={styles.card}>
        <View style={styles.accentBorderSearch} />
        <View style={styles.cardInfo}>
          <View style={styles.avatarWrapper}>
            <StoryAvatar 
              userId={item.uid} 
              avatarUrl={item.avatar} 
              name={item.name} 
              size={50}
              hasStories={activeStoryUserIds.has(item.uid)}
              onPress={() => router.push(`/chat/${item.uid}`)}
              onStoryPress={async () => {
                try {
                  const qStories = query(
                    collection(db, 'stories'),
                    where('userId', '==', item.uid),
                    where('status', '==', 'approved')
                  );
                  const storiesSnap = await getDocs(qStories);
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
                    setViewerUser({ name: item.name, avatar: item.avatar });
                    setViewerVisible(true);
                  }
                } catch (e) {}
              }}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.userName} numberOfLines={1}>{item.name}{item.age ? `, ${item.age}` : ''}</Text>
            {(item.city || item.country) && (
              <Text style={styles.userLocation} numberOfLines={1}>{[item.city, item.country].filter(Boolean).join(', ')}</Text>
            )}
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.chatIconBtn} 
            onPress={() => router.push(`/chat/${item.uid}`)}>
            <IconSymbol name="message.fill" size={20} color={Colors.dark.primary} />
          </TouchableOpacity>

          {status === 'friend' ? (
            <View style={styles.statusBadge}><Text style={styles.statusText}>{t('friends.status_friend', 'Friend')}</Text></View>
          ) : status === 'sent' ? (
            <View style={styles.statusBadgeWarning}><Text style={styles.statusTextWarning}>{t('friends.status_sent', 'Pending')}</Text></View>
          ) : status === 'incoming' ? (
            <TouchableOpacity 
              style={styles.actionBtnPrimary}
              onPress={() => {
                const req = incomingRequests.find(r => r.fromUserId === item.uid);
                if(req) acceptRequest(req);
              }}>
              <Text style={styles.actionBtnText}>{t('friends.status_incoming', 'Accept')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.actionBtnPrimary, isProcessing && {opacity: 0.5}]}
              onPress={() => sendFriendRequest(item)}
              disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionBtnText}>{t('friends.status_none', 'Add')}</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderIncomingItem = ({ item }) => {
    const isProcessing = processingId === item.id;
    const profile = userProfiles[item.fromUserId] || {};
    const displayName = item.fromUserName || profile.name || 'User';
    const displayAvatar = item.fromUserAvatar || profile.avatar;
    const displayAge = item.fromUserAge || profile.age || profile.age;

    return (
      <View style={styles.card}>
        <View style={styles.accentBorderRequest} />
        <View style={styles.cardInfo}>
          <View style={styles.avatarWrapper}>
            <StoryAvatar 
              userId={item.fromUserId} 
              avatarUrl={displayAvatar} 
              name={displayName} 
              size={50}
              hasStories={activeStoryUserIds.has(item.fromUserId)}
              onPress={() => router.push(`/chat/${item.fromUserId}`)}
              onStoryPress={async () => {
                try {
                  const qStories = query(
                    collection(db, 'stories'),
                    where('userId', '==', item.fromUserId),
                    where('status', '==', 'approved')
                  );
                  const storiesSnap = await getDocs(qStories);
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
                    setViewerUser({ name: displayName, avatar: displayAvatar });
                    setViewerVisible(true);
                  }
                } catch (e) {}
              }}
            />
          </View>
          <View style={styles.textContainer}>
            <View style={{flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap'}}>
              <Text style={styles.userName} numberOfLines={1}>
                {displayName}
              </Text>
              {displayAge && (
                <Text style={styles.userName}>
                  , {displayAge}
                </Text>
              )}
              {item.hasGift && (
                <IconSymbol name="gift.fill" size={14} color="#f1c40f" style={{marginLeft: 6}} />
              )}
            </View>
            {(item.fromUserCity || item.fromUserCountry) && (
              <Text style={styles.userLocation} numberOfLines={1}>{[item.fromUserCity, item.fromUserCountry].filter(Boolean).join(', ')}</Text>
            )}
          </View>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.btn, styles.btnAccept, isProcessing && { opacity: 0.5 }]} onPress={() => acceptRequest(item)} disabled={isProcessing}>
            {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <IconSymbol name="checkmark" size={20} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnReject, isProcessing && { opacity: 0.5 }]} 
            onPress={() => {
              setActionModal({
                visible: true,
                title: t('friends.reject_request', 'Reject Request'),
                message: t('friends.reject_confirm_msg', 'Are you sure you want to reject this request?'),
                confirmText: t('friends.reject', 'Reject'),
                isDestructive: true,
                showCancel: true,
                onConfirm: () => rejectRequest(item)
              });
            }} disabled={isProcessing}>
            <IconSymbol name="xmark" size={20} color="#e74c3c" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSentItem = ({ item }) => {
    const isProcessing = processingId === item.id;
    const profile = userProfiles[item.toUserId] || {};
    const displayName = item.toUserName || profile.name || 'User';
    const displayAvatar = item.toUserAvatar || profile.avatar;
    const displayAge = item.toUserAge || profile.age;
    const displayCity = item.toUserCity || profile.city;
    const displayCountry = item.toUserCountry || profile.country;

    return (
      <View style={styles.card}>
        <View style={styles.accentBorderRequest} />
        <View style={styles.cardInfo}>
          <View style={styles.avatarWrapper}>
            <StoryAvatar 
              userId={item.toUserId} 
              avatarUrl={displayAvatar} 
              name={displayName} 
              size={50}
              hasStories={activeStoryUserIds.has(item.toUserId)}
              onPress={() => router.push(`/chat/${item.toUserId}`)}
              onStoryPress={async () => {
                try {
                  const qStories = query(
                    collection(db, 'stories'),
                    where('userId', '==', item.toUserId),
                    where('status', '==', 'approved')
                  );
                  const storiesSnap = await getDocs(qStories);
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
                    setViewerUser({ name: displayName, avatar: displayAvatar });
                    setViewerVisible(true);
                  }
                } catch (e) {}
              }}
            />
          </View>
          <View style={styles.textContainer}>
            <Text style={styles.userName} numberOfLines={1}>
              {displayName}
              {displayAge ? `, ${displayAge}` : ''}
            </Text>
            {(displayCity || displayCountry) && (
              <Text style={styles.userLocation} numberOfLines={1}>{[displayCity, displayCountry].filter(Boolean).join(', ')}</Text>
            )}
          </View>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.btnCancel, isProcessing && { opacity: 0.5 }]} 
            onPress={() => {
              setActionModal({
                visible: true,
                title: t('friends.cancel_request', 'Cancel Request'),
                message: t('friends.cancel_confirm_msg', 'Are you sure you want to cancel this sent request?'),
                confirmText: t('friends.cancel_button', 'Cancel Request'),
                isDestructive: true,
                showCancel: true,
                onConfirm: () => cancelRequest(item)
              });
            }} disabled={isProcessing}>
            {isProcessing ? <ActivityIndicator size="small" color="#e74c3c" /> : <Text style={styles.cancelText}>{t('common.cancel', 'Cancel')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const isSearchActive = searchQuery.trim().length > 0 || searchFilters.country !== '' || searchFilters.city !== '' || searchFilters.chatType !== '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Search Header */}
        <Animated.View style={styles.searchHeaderArea}>
          <View style={styles.searchContainer}>
            <IconSymbol name="magnifyingglass" size={18} color="#7f8c8d" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('friends.search_placeholder', 'Search by Name or ID')}
              placeholderTextColor="#7f8c8d"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            <TouchableOpacity 
              style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
              onPress={toggleFilters}>
              <IconSymbol name="line.3.horizontal.decrease.circle" size={20} color={showFilters ? Colors.dark.primary : '#95a5a6'} />
            </TouchableOpacity>
          </View>
          
          {/* Collapsible Filters */}
          <Animated.View style={[styles.filtersSection, animatedFiltersStyle]}>
              <View style={styles.filterRow}>
                <TouchableOpacity style={styles.filterInput} onPress={() => setShowCountryPicker(true)}>
                  <Text style={styles.filterText} numberOfLines={1}>{searchFilters.country || t('auth.country', 'Country')}</Text>
                  <IconSymbol name="chevron.down" size={12} color="#7f8c8d" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.filterInput, !searchFilters.country && {opacity: 0.5}]} 
                  onPress={() => searchFilters.country && setShowCityPicker(true)}
                  disabled={!searchFilters.country}>
                  <Text style={styles.filterText} numberOfLines={1}>{searchFilters.city || t('auth.city', 'City')}</Text>
                  <IconSymbol name="chevron.down" size={12} color="#7f8c8d" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterInput} onPress={() => setShowChatTypePicker(true)}>
                  <Text style={styles.filterText} numberOfLines={1}>
                    {searchFilters.chatType ? (allChatTypes.find(c => c.value === searchFilters.chatType)?.label || searchFilters.chatType) : t('search.all_chat_types', 'Communicate')}
                  </Text>
                  <IconSymbol name="chevron.down" size={12} color="#7f8c8d" />
                </TouchableOpacity>
              </View>
              <View style={styles.filterActionsRow}>
                <TouchableOpacity 
                  style={styles.clearFilterBtnFull} 
                  onPress={() => {
                    setSearchFilters({country: '', city: '', countryIso: '', chatType: ''});
                    setSearchQuery('');
                  }}>
                  <IconSymbol name="xmark.circle.fill" size={14} color="#e74c3c" />
                  <Text style={styles.clearFilterText}>{t('friends.clear_filters', 'Clear Filters')}</Text>
                </TouchableOpacity>
              </View>
          </Animated.View>
          <View style={styles.headerDivider} />
        </Animated.View>

        {isSearchActive ? (
          /* SEARCH RESULTS VIEW */
          <View style={styles.searchResultsContainer}>
            <Text style={styles.sectionHeaderTitle}>{t('friends.search_results', 'Search Results')}</Text>
            {searching ? (
              <View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.dark.primary} /></View>
            ) : (
              <FlatList
                data={searchResults.filter(u => {
                  const uid = u.id || u.uid;
                  // Hard-block admin by UID, email, AND name
                  if (uid === '4bM0UTvNA8XHUOqv1fyzz2lYQeO2') return false;
                  if (u.uid === '4bM0UTvNA8XHUOqv1fyzz2lYQeO2') return false;
                  if (u.email === 'admin@nexus.com') return false;
                  if (u.name === 'Admin') return false;
                  if (isUserSoftDeleted(u)) return false;
                  // Exclude only if they blocked me (Unidirectional search visibility)
                  if (blockedMeIds.includes(uid)) return false;
                  return true;
                })}
                keyExtractor={item => item.uid}
                renderItem={renderSearchItem}
                contentContainerStyle={[styles.listContainer, { flexGrow: 1 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <IconSymbol name="magnifyingglass" size={60} color="#34495e" />
                    <Text style={styles.emptyText}>{t('friends.no_users_found', 'No users found matching your search.')}</Text>
                  </View>
                }
              />
            )}
          </View>
        ) : (
          /* INCOMING / SENT VIEW */
          <>
            <View style={styles.segmentedControl}>
              <TouchableOpacity 
                style={[styles.segmentBtn, activeTab === 'incoming' && styles.segmentBtnActive]} 
                onPress={() => setActiveTab('incoming')}
              >
                <Text style={[styles.segmentText, activeTab === 'incoming' && styles.segmentTextActive]}>
                  {t('friends.incoming', 'Incoming')} {incomingRequests.length > 0 ? `(${incomingRequests.length})` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.segmentBtn, activeTab === 'sent' && styles.segmentBtnActive]} 
                onPress={() => setActiveTab('sent')}
              >
                <Text style={[styles.segmentText, activeTab === 'sent' && styles.segmentTextActive]}>
                  {t('friends.sent', 'Sent')} {sentRequests.length > 0 ? `(${sentRequests.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            {incomingRequests.length > 0 && activeTab === 'incoming' && (
              <View style={styles.bulkActionsBar}>
                <TouchableOpacity style={styles.bulkBtnAccept} onPress={handleAcceptAll}>
                  <IconSymbol name="checkmark.circle.fill" size={14} color="#fff" />
                  <Text style={styles.bulkBtnText}>{t('friends.accept_all', 'Accept All')}</Text>
                </TouchableOpacity>
                {currentUserData?.gender === 'woman' && (
                  <TouchableOpacity style={styles.bulkBtnGift} onPress={handleAcceptWithGifts}>
                    <IconSymbol name="gift.fill" size={14} color="#fff" />
                    <Text style={styles.bulkBtnText}>{t('friends.accept_only_gifts', 'Accept Gifts')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.bulkBtnReject} onPress={handleRejectAll}>
                  <IconSymbol name="xmark.circle.fill" size={14} color="#e74c3c" />
                  <Text style={styles.bulkBtnTextReject}>{t('friends.reject_all', 'Reject All')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {loading ? (
              <View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.dark.primary} /></View>
            ) : (
              <FlatList
                data={activeTab === 'incoming' ? incomingRequests : sentRequests}
                keyExtractor={item => item.id}
                renderItem={activeTab === 'incoming' ? renderIncomingItem : renderSentItem}
                extraData={[userProfiles, processingId]}
                contentContainerStyle={[styles.listContainer, { flexGrow: 1 }]}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <IconSymbol 
                      name={activeTab === 'incoming' ? "person.badge.plus" : "person.crop.circle.badge.questionmark"} 
                      size={60} 
                      color="#34495e" 
                    />
                    <Text style={styles.emptyText}>
                      {activeTab === 'incoming' 
                        ? t('friends.no_incoming_requests', 'No incoming requests.') 
                        : t('friends.no_sent_requests', 'No sent requests.')
                      }
                    </Text>
                  </View>
                }
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>

      <SearchablePicker
        visible={showCountryPicker}
        onClose={() => setShowCountryPicker(false)}
        title={t('auth.selectCountry', 'Select Country')}
        data={allCountries}
        selectedValue={searchFilters.country}
        onSelect={(item) => setSearchFilters(prev => ({ ...prev, country: item.value, countryIso: item.isoCode, city: '' }))}
      />

      <SearchablePicker
        visible={showCityPicker}
        onClose={() => setShowCityPicker(false)}
        title={t('auth.selectCity', 'Select City')}
        data={allCities}
        selectedValue={searchFilters.city}
        onSelect={(item) => setSearchFilters(prev => ({ ...prev, city: item.value }))}
      />

      <SearchablePicker
        visible={showChatTypePicker}
        onClose={() => setShowChatTypePicker(false)}
        title={t('search.chatType', 'Communication Type')}
        data={allChatTypes.filter(c => c.value !== '')}
        selectedValue={searchFilters.chatType}
        onSelect={(item) => setSearchFilters(prev => ({ ...prev, chatType: item.value }))}
        searchable={false}
      />

      <ActionModal
        visible={actionModal.visible}
        title={actionModal.title}
        message={actionModal.message}
        confirmText={actionModal.confirmText}
        cancelText={t('common.cancel', 'Cancel')}
        isDestructive={actionModal.isDestructive}
        showCancel={actionModal.showCancel}
        onConfirm={() => {
          actionModal.onConfirm();
          setActionModal(prev => ({ ...prev, visible: false }));
        }}
        onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
      />

      <StoryViewer 
        visible={viewerVisible}
        stories={viewerStories}
        userName={viewerUser.name}
        userAvatar={viewerUser.avatar}
        onClose={() => setViewerVisible(false)}
      />
      
      <Toast 
        visible={toast.visible} 
        message={toast.messageKey ? t(toast.messageKey, toast.messageParams) : ''} 
        type={toast.type}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.dark.background },
  searchHeaderArea: { 
    paddingHorizontal: 16, 
    paddingTop: 12, 
    paddingBottom: 0, 
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 240, 255, 0.3)',
    marginTop: 12,
  },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(52, 73, 94, 0.4)', borderRadius: 12, height: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#34495e' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
  filterBtn: { padding: 6, marginLeft: 4 },
  filterBtnActive: { backgroundColor: 'rgba(14, 240, 255, 0.1)', borderRadius: 8 },
  filtersSection: { flexDirection: 'column', paddingTop: 12, paddingBottom: 0 },
  filterRow: { flexDirection: 'row', width: '100%', gap: 8, alignItems: 'center' },
  filterInput: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(52, 73, 94, 0.3)', borderRadius: 8, paddingHorizontal: 10, height: 36, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  filterText: { color: '#bdc3c7', fontSize: 13, flex: 1, paddingRight: 4 },
  filterActionsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, width: '100%' },
  clearFilterBtnFull: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(231, 76, 60, 0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, gap: 6, borderWidth: 1, borderColor: 'rgba(231, 76, 60, 0.2)' },
  clearFilterText: { color: '#e74c3c', fontSize: 13, fontWeight: '500' },
  segmentedControl: { flexDirection: 'row', padding: 12, gap: 10 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(52, 73, 94, 0.4)', borderWidth: 1, borderColor: 'transparent' },
  segmentBtnActive: { backgroundColor: 'rgba(14, 240, 255, 0.1)', borderColor: 'rgba(14, 240, 255, 0.3)' },
  segmentText: { color: '#95a5a6', fontWeight: '600', fontSize: 14 },
  segmentTextActive: { color: Colors.dark.primary },
  searchResultsContainer: { flex: 1 },
  sectionHeaderTitle: { color: '#7f8c8d', fontSize: 13, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 16, fontWeight: '600' },
  listContainer: { padding: 16, paddingBottom: 100 },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: 'rgba(255,255,255,0.07)', 
    borderRadius: 20, 
    padding: 16, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden'
  },
  accentBorderRequest: {
    position: 'absolute',
    left: 0,
    top: 15,
    bottom: 15,
    width: 3.5,
    backgroundColor: '#fff01f', // Neon Yellow
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    zIndex: 10,
  },
  accentBorderSearch: {
    position: 'absolute',
    left: 0,
    top: 15,
    bottom: 15,
    width: 3.5,
    backgroundColor: '#00f0ff', // Electric Blue
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    zIndex: 10,
  },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: { position: 'relative' },
  avatar: { 
    width: 44, 
    height: 44, 
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.dark.primary
  },
  avatarPlaceholder: { 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  avatarWrapper: {
    paddingVertical: 4,
    marginRight: 12,
  },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '700' },
  textContainer: { marginLeft: 12, flex: 1, paddingRight: 10 },
  userName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  userLocation: { color: '#7f8c8d', fontSize: 13 },
  actionButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(14, 240, 255, 0.1)', justifyContent: 'center', alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: Colors.dark.primary, paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusBadge: { backgroundColor: 'rgba(46, 204, 113, 0.1)', paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(46, 204, 113, 0.3)' },
  statusText: { color: '#2ecc71', fontSize: 13, fontWeight: '600' },
  statusBadgeWarning: { backgroundColor: 'rgba(241, 196, 15, 0.1)', paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(241, 196, 15, 0.3)' },
  statusTextWarning: { color: '#f1c40f', fontSize: 13, fontWeight: '600' },
  btn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  btnReject: { backgroundColor: 'rgba(231, 76, 60, 0.1)', borderWidth: 1, borderColor: 'rgba(231, 76, 60, 0.3)' },
  btnAccept: { backgroundColor: Colors.dark.primary },
  btnCancel: { paddingHorizontal: 14, height: 36, borderRadius: 12, backgroundColor: 'rgba(231, 76, 60, 0.1)', borderWidth: 1, borderColor: 'rgba(231, 76, 60, 0.3)', justifyContent: 'center' },
  cancelText: { color: '#e74c3c', fontWeight: '600', fontSize: 13 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.7, paddingBottom: 100 },
  emptyText: { color: '#7f8c8d', fontSize: 15, marginTop: 16, textAlign: 'center' },
  bulkActionsBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 6,
    justifyContent: 'space-between',
  },
  bulkBtnAccept: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2ecc71',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 3,
    height: 38,
  },
  bulkBtnGift: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.primary,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 3,
    height: 38,
  },
  bulkBtnReject: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    gap: 3,
    height: 38,
  },
  bulkBtnText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
  bulkBtnTextReject: {
    color: '#e74c3c',
    fontSize: 10,
    fontWeight: '700',
    flexShrink: 1,
  },
});
