import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  SafeAreaView,
  TextInput,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useTranslation } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { IconSymbol } from '../../components/ui/icon-symbol';
import NexusSwitch from '../../components/ui/NexusSwitch';
import { ActionModal } from '../../components/ui/ActionModal';
import { Toast } from '../../components/ui/Toast';
import { useRouter } from 'expo-router';
import { getAvatarColor } from '../../utils/avatarUtils';
import { OnlineStatusIndicator } from '../../components/ui/OnlineStatusIndicator';
import { getUserOnlineStatus } from '../../utils/onlineStatus';
import { StoryAvatar } from '../../components/ui/StoryAvatar';
import { StoryViewer } from '../../components/ui/StoryViewer';

export default function FriendsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = auth.currentUser;

  const [friends, setFriends] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState({}); // Track who is online in real-time
  const [userAges, setUserAges] = useState({});
  const [visibleFriendIds, setVisibleFriendIds] = useState([]);

  useEffect(() => {
    AsyncStorage.getItem('friends_ages_cache').then(cached => {
      if (cached) setUserAges(JSON.parse(cached));
    }).catch(()=>{});
  }, []); // Cache for friend ages
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOnlineOnly, setIsOnlineOnly] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [activeStoryUserIds, setActiveStoryUserIds] = useState(new Set());
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStories, setViewerStories] = useState([]);
  const [viewerUser, setViewerUser] = useState({ name: '', avatar: '' });

  const [toast, setToast] = useState({ visible: false, messageKey: '', messageParams: {}, type: 'success' });
  const [actionModal, setActionModal] = useState({
    visible: false, title: '', message: '', confirmText: 'OK', onConfirm: () => {}, isDestructive: false, showCancel: true
  });

  // 1. Listen to friends collection
  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const friendsQuery = query(
      collection(db, 'friends'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(friendsQuery, (snapshot) => {
      const friendsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort in memory: UA / Cyrillic -> Latin -> Digits -> Others
      friendsData.sort((a, b) => {
        const nameA = a.friendName || '';
        const nameB = b.friendName || '';
        
        const getPriority = (str) => {
          if (!str) return 99;
          const char = str.charAt(0).toLowerCase();
          // Ukrainian / Cyrillic range (approximate)
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
        
        // Within same category, use locale-aware comparison
        return nameA.localeCompare(nameB, 'uk-UA', { sensitivity: 'base' });
      });

      setFriends(friendsData);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching friends:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.uid]);

  // 2. Fetch missing ages for friends
  useEffect(() => {
    if (friends.length === 0) return;

    const fetchAges = async () => {
      const uidsToFetch = friends
        .map(f => f.friendId)
        .filter(uid => uid && typeof userAges[uid] === 'undefined');

      if (uidsToFetch.length === 0) return;

      const newAges = { ...userAges };
      let updated = false;

      await Promise.all(
        uidsToFetch.map(async (uid) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              newAges[uid] = userDoc.data().age || null;
              updated = true;
            } else {
              newAges[uid] = null;
              updated = true;
            }
          } catch (e) {
            console.error(`Error fetching age for ${uid}:`, e);
          }
        })
      );

      if (updated) {
        setUserAges(newAges);
        AsyncStorage.setItem('friends_ages_cache', JSON.stringify(newAges)).catch(()=>{});
      }
    };

    fetchAges();
  }, [friends, userAges]);

  // 3. Track online status ONLY for visible friends
  useEffect(() => {
    if (visibleFriendIds.length === 0) return;

    const unsubscribers = visibleFriendIds.map(friendId => {
      return getUserOnlineStatus(friendId, (status) => {
        setOnlineUsers(prev => ({
          ...prev,
          [friendId]: status.isOnline
        }));
      });
    });

    return () => {
      unsubscribers.forEach(unsub => unsub && unsub());
    };
  }, [visibleFriendIds]);

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    const ids = viewableItems.map(item => item.item.friendId).filter(Boolean);
    setVisibleFriendIds(ids);
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
    minimumViewTime: 300,
  }).current;

  // TEMPORARY: Auto-cleanup testing mock friends
  useEffect(() => {
    if (!user || friends.length === 0) return;
    const testFriends = friends.filter(f => f.friendId?.includes('mock_user_'));
    if (testFriends.length > 0) {
      const friendsRef = collection(db, 'friends');
      testFriends.forEach(async (tf) => {
        try {
          const q1 = query(friendsRef, where('userId', '==', user.uid), where('friendId', '==', tf.friendId));
          const snap1 = await getDocs(q1);
          snap1.forEach(d => deleteDoc(doc(db, 'friends', d.id)));

          const q2 = query(friendsRef, where('userId', '==', tf.friendId), where('friendId', '==', user.uid));
          const snap2 = await getDocs(q2);
          snap2.forEach(d => deleteDoc(doc(db, 'friends', d.id)));
        } catch (error) {}
      });
    }
  }, [friends, user?.uid]);

  // 4. Listen for all active stories to show rings
  // Only filter by status (auto-indexed) — no composite index needed.
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
    }, (err) => console.warn('FriendsStories listener error:', err));
    return () => unsub();
  }, [user?.uid]);


  // 5. Filter friends based on search query and "online only" toggle
  const filteredFriends = useMemo(() => {
    return friends.filter(friend => {
      const matchesSearch = 
        friend.friendName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (searchQuery.length >= 6 && friend.friendId?.toLowerCase().startsWith(searchQuery.toLowerCase()));
      
      const isOnline = onlineUsers[friend.friendId];
      const matchesOnlineFilter = !isOnlineOnly || isOnline;

      return matchesSearch && matchesOnlineFilter;
    });
  }, [friends, searchQuery, isOnlineOnly, onlineUsers]);

  const handleRemoveFriend = async (friendId, friendName) => {
    setActionModal({
      visible: true,
      title: t('friends.remove_btn', 'Remove Friend'),
      message: t('friends.remove_confirm_msg', 'Are you sure you want to remove {{name}} from friends?', { name: friendName }),
      confirmText: t('friends.remove_btn', 'Remove'),
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        try {
          setProcessingId(friendId);
          const friendsRef = collection(db, 'friends');

          // 1. Remove from my side
          const q1 = query(friendsRef, where('userId', '==', user.uid), where('friendId', '==', friendId));
          const snap1 = await getDocs(q1);
          snap1.forEach(async (d) => await deleteDoc(doc(db, 'friends', d.id)));

          // 2. Remove from their side
          const q2 = query(friendsRef, where('userId', '==', friendId), where('friendId', '==', user.uid));
          const snap2 = await getDocs(q2);
          snap2.forEach(async (d) => await deleteDoc(doc(db, 'friends', d.id)));

          setToast({
            visible: true,
            messageKey: 'friends.removed_friend',
            messageParams: { name: friendName },
            type: 'success'
          });
        } catch (error) {
          console.error('Error removing friend:', error);
          setToast({
            visible: true,
            messageKey: 'chat.remove_friend_error',
            messageParams: {},
            type: 'error'
          });
        } finally {
          setProcessingId(null);
          setActionModal(prev => ({ ...prev, visible: false }));
        }
      }
    });
  };


  const renderFriendItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.accentBorder} />
      <View style={styles.cardInfo}>
        <View style={styles.avatarContainer}>
          <StoryAvatar 
            userId={item.friendId} 
            avatarUrl={item.friendAvatar} 
            name={item.friendName} 
            size={50}
            hasStories={activeStoryUserIds.has(item.friendId)}
            onPress={() => router.push(`/chat/${item.friendId}`)}
            onStoryPress={async () => {
              try {
                const q = query(
                  collection(db, 'stories'),
                  where('userId', '==', item.friendId),
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
                  setViewerUser({ name: item.friendName, avatar: item.friendAvatar });
                  setViewerVisible(true);
                }
              } catch (e) {
                console.error("Error loading stories for viewer:", e);
              }
            }}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.userName} numberOfLines={1}>
            {`${item.friendName}${userAges[item.friendId] ? `, ${userAges[item.friendId]}` : ''}`}
          </Text>
          {(item.friendCity || item.friendCountry) && (
            <Text style={styles.userLocation} numberOfLines={1}>
              {[item.friendCity, item.friendCountry].filter(Boolean).join(', ')}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity 
          style={styles.chatBtn} 
          onPress={() => router.push(`/chat/${item.friendId}`)}>
          <IconSymbol name="message.fill" size={22} color={Colors.dark.primary} />
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.removeBtn} 
          onPress={() => handleRemoveFriend(item.friendId, item.friendName)}
          disabled={processingId === item.friendId}>
          {processingId === item.friendId ? (
            <ActivityIndicator size="small" color="#e74c3c" />
          ) : (
            <IconSymbol name="person.badge.minus" size={20} color="#e74c3c" />
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header with Search and Toggle */}
        <View style={styles.headerArea}>
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
          </View>

          <View style={styles.filterRow}>
            {!loading && friends.length > 0 && (
              <Text style={styles.sectionTitleOnLine}>
                {searchQuery 
                  ? t('friends.search_results', 'Search Results') 
                  : t('friends.my_friends', { count: friends.length })}
              </Text>
            )}
            <View style={styles.toggleContainer}>
              <Text style={styles.filterLabel}>{t('friends.online_only', 'Online only')}</Text>
              <NexusSwitch
                value={isOnlineOnly}
                onValueChange={setIsOnlineOnly}
              />
            </View>
          </View>
          <View style={styles.headerDivider} />
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredFriends}
            keyExtractor={item => item.id}
            renderItem={renderFriendItem}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <IconSymbol 
                  name={searchQuery ? "magnifyingglass" : "person.2.fill"} 
                  size={60} 
                  color="#34495e" 
                />
                <Text style={styles.emptyText}>
                  {searchQuery 
                    ? t('friends.no_users_found', 'No users found matching your search.')
                    : t('friends.no_friends_yet', 'No friends yet. Search for users to add them!')
                  }
                </Text>
              </View>
            }
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
          />
        )}

        <ActionModal
          visible={actionModal.visible}
          title={actionModal.title}
          message={actionModal.message}
          confirmText={actionModal.confirmText}
          cancelText={t('common.cancel', 'Cancel')}
          onConfirm={actionModal.onConfirm}
          onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
          isDestructive={actionModal.isDestructive}
          showCancel={actionModal.showCancel}
        />

        <Toast
          visible={toast.visible}
          message={toast.messageKey ? t(toast.messageKey, toast.messageParams) : ''}
          type={toast.type}
          onHide={() => setToast(prev => ({ ...prev, visible: false }))}
        />

        <StoryViewer
          visible={viewerVisible}
          stories={viewerStories}
          userName={viewerUser.name}
          userAvatar={viewerUser.avatar}
          onClose={() => setViewerVisible(false)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.dark.background },
  headerArea: { 
    paddingHorizontal: 16, 
    paddingTop: 10, 
    paddingBottom: 10, 
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(57, 255, 20, 0.3)',
    marginTop: 10,
  },
  searchContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: 'rgba(52, 73, 94, 0.4)', 
    borderRadius: 12, 
    height: 46, 
    paddingHorizontal: 12, 
    borderWidth: 1, 
    borderColor: '#34495e' 
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
  filterRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginTop: 10,
    width: '100%'
  },
  toggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  filterLabel: { color: '#bdc3c7', fontSize: 14 },
  sectionTitleOnLine: { 
    color: '#7f8c8d', 
    fontSize: 13, 
    textTransform: 'uppercase', 
    fontWeight: '600' 
  },
  listContainer: { padding: 16, paddingBottom: 100 },
  card: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    backgroundColor: 'rgba(255,255,255,0.07)', 
    borderRadius: 20, 
    padding: 12, 
    marginBottom: 12, 
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.08)',
    position: 'relative',
    overflow: 'hidden'
  },
  accentBorder: {
    position: 'absolute',
    left: 0,
    top: 15,
    bottom: 15,
    width: 3.5,
    backgroundColor: '#39ff14', // Electric Green
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatarContainer: { position: 'relative' },
  avatar: { 
    width: 48, 
    height: 48, 
    borderRadius: 24,
    borderWidth: 1,
    borderColor: Colors.dark.primary
  },
  avatarPlaceholder: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    justifyContent: 'center', 
    alignItems: 'center', 
    borderWidth: 1, 
    borderColor: Colors.dark.primary 
  },
  avatarInitial: { color: Colors.dark.primary, fontSize: 20, fontWeight: '700' },
  textContainer: { marginLeft: 12, flex: 1 },
  userName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  userLocation: { color: '#7f8c8d', fontSize: 13 },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  removeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(231, 76, 60, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.15)'
  },
  chatBtn: { 
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(14, 240, 255, 0.08)', 
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(14, 240, 255, 0.15)'
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', opacity: 0.7, paddingTop: 60 },
  emptyText: { color: '#7f8c8d', fontSize: 15, marginTop: 16, textAlign: 'center', paddingHorizontal: 40 }
});
