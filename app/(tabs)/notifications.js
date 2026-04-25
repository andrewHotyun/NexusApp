import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit, 
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { StoryAvatar } from '../../components/ui/StoryAvatar';
import { StoryViewer } from '../../components/ui/StoryViewer';
import { Colors } from '../../constants/theme';
import { auth, db } from '../../utils/firebase';
import { getGiftById } from '../../constants/gifts';
import { useAppData } from '../../utils/AppDataProvider';

// Simple in-memory cache for profile details
const userCache = {};

export default function NotificationsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = auth.currentUser;

  // Use centralized data from AppDataProvider
  const {
    friendIds: friends,
    activeStoryUserIds,
    unviewedStoryUserIds,
  } = useAppData();

  const [messages, setMessages] = useState([]);
  const [requests, setRequests] = useState([]);
  const [likes, setLikes] = useState([]);
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStories, setViewerStories] = useState([]);
  const [viewerUser, setViewerUser] = useState({ name: '', avatar: '' });

  // Optimistic UI: Load from cache
  useEffect(() => {
    const loadCache = async () => {
      try {
        if (!user) return;
        const cached = await AsyncStorage.getItem(`notifications_cache_${user.uid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed.messages) setMessages(parsed.messages);
          if (parsed.requests) setRequests(parsed.requests);
          if (parsed.likes) setLikes(parsed.likes);
          setLoading(false); // Instantly remove loader
        }
      } catch (e) { }
    };
    loadCache();
  }, [user?.uid]);

  // Optimistic UI: Save to cache
  useEffect(() => {
    if (!user) return;
    if (messages.length === 0 && requests.length === 0 && likes.length === 0 && loading) return;

    // Batch save
    const saveTimeout = setTimeout(() => {
      AsyncStorage.setItem(`notifications_cache_${user.uid}`, JSON.stringify({ messages, requests, likes })).catch(() => { });
    }, 1000);

    return () => clearTimeout(saveTimeout);
  }, [messages, requests, likes, user?.uid, loading]);

  // 1. Listen for unread messages
  useEffect(() => {
    if (!user) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      where('read', '==', false),
      limit(50)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

      msgs.sort((a, b) => {
        const tA = a.timestamp?.toMillis?.() || (a.timestamp?.seconds ? a.timestamp.seconds * 1000 : 0);
        const tB = b.timestamp?.toMillis?.() || (b.timestamp?.seconds ? b.timestamp.seconds * 1000 : 0);
        return tB - tA;
      });

      const bySender = {};
      for (const m of msgs) {
        if (!bySender[m.senderId]) bySender[m.senderId] = [];
        bySender[m.senderId].push(m);
      }

      const grouped = [];
      for (const [senderId, senderMsgs] of Object.entries(bySender)) {
        let userData = userCache[senderId];
        if (!userData) {
          try {
            const userSnap = await getDoc(doc(db, 'users', senderId));
            if (userSnap.exists()) {
              userData = { uid: senderId, id: userSnap.id, ...userSnap.data() };
              userCache[senderId] = userData;
            }
          } catch (e) {
            console.error('Error fetching sender data:', e);
          }
        }

        const defaultData = userData || { uid: senderId, name: 'User' };
        grouped.push({
          id: `msg-${senderId}`,
          type: 'message',
          sender: defaultData,
          unreadCount: senderMsgs.length,
          lastMessage: senderMsgs[0],
          timestamp: senderMsgs[0].timestamp,
          sortTime: senderMsgs[0].timestamp?.toMillis?.() || (senderMsgs[0].timestamp?.seconds ? senderMsgs[0].timestamp.seconds * 1000 : Date.now())
        });
      }
      setMessages(grouped);
      setLoading(false);
    }, (err) => console.warn('UnreadMessages listener error:', err));

    return () => unsub();
  }, [user?.uid]);

  // 2. Listen for friend requests
  useEffect(() => {
    if (!user) {
      setRequests([]);
      return;
    }

    const qReq = query(
      collection(db, 'friendRequests'),
      where('toUserId', '==', user.uid),
      where('status', '==', 'pending'),
      limit(20)
    );

    const unsubReq = onSnapshot(qReq, (snap) => {
      const reqs = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          type: 'friend_request',
          sender: {
            uid: data.fromUserId,
            name: data.fromUserName || 'User',
            avatar: data.fromUserAvatar || '',
          },
          timestamp: data.createdAt,
          sortTime: data.createdAt?.toMillis?.() || (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : Date.now())
        };
      });
      setRequests(reqs);
    }, (err) => console.warn('FriendRequests listener error:', err));

    return () => unsubReq();
  }, [user?.uid]);

  // 3. Listen for likes
  useEffect(() => {
    if (!user) {
      setLikes([]);
      return;
    }

    const qLikes = query(
      collection(db, 'likes'),
      where('targetUserId', '==', user.uid),
      where('read', '==', false),
      limit(20)
    );

    const unsubLikes = onSnapshot(qLikes, async (snap) => {
      const items = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        const senderId = data.senderId;

        let userData = userCache[senderId];
        if (!userData) {
          try {
            const userSnap = await getDoc(doc(db, 'users', senderId));
            if (userSnap.exists()) {
              userData = { uid: senderId, id: userSnap.id, ...userSnap.data() };
              userCache[senderId] = userData;
            }
          } catch (e) {
            console.error('Error fetching sender data for like:', e);
          }
        }

        return {
          id: d.id,
          type: 'like',
          sender: userData || { uid: senderId, name: 'User' },
          timestamp: data.createdAt,
          contentUrl: data.contentUrl,
          contentType: data.contentType,
          read: data.read || false,
          sortTime: data.createdAt?.toMillis?.() || (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : Date.now())
        };
      }));
      setLikes(items);
      setLoading(false);
    }, (err) => console.warn('Likes listener error:', err));

    return () => unsubLikes();
  }, [user?.uid]);



  // 4-5. Friends and stories now come from AppDataProvider
  // Build story notifications from shared story data
  useEffect(() => {
    if (!user?.uid || friends.length === 0) {
      setStories([]);
      return;
    }

    // Build story notifications from unviewed stories for friends
    const buildStoryNotifications = async () => {
      const friendStories = [];
      const seenUsers = new Set();

      // We need to query stories to get the actual story data for notifications
      const storiesQuery = query(
        collection(db, 'stories'),
        where('status', '==', 'approved')
      );

      const unsub = onSnapshot(storiesQuery, async (snapshot) => {
        const newFriendStories = [];
        const newSeenUsers = new Set();
        const now = new Date();

        for (const d of snapshot.docs) {
          const data = d.data();
          const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)) : null;

          if (expiresAt && expiresAt > now) {
            if (friends.includes(data.userId) && !newSeenUsers.has(data.userId) && !data.viewedBy?.includes(user?.uid)) {
              newSeenUsers.add(data.userId);

              let userData = userCache[data.userId];
              if (!userData) {
                try {
                  const uSnap = await getDoc(doc(db, 'users', data.userId));
                  if (uSnap.exists()) {
                    userData = { uid: data.userId, ...uSnap.data() };
                    userCache[data.userId] = userData;
                  }
                } catch (e) { }
              }

              newFriendStories.push({
                id: `story-${data.userId}`,
                type: 'story',
                sender: userData || { uid: data.userId, name: 'User' },
                timestamp: data.createdAt,
                sortTime: data.createdAt?.toMillis?.() || (data.createdAt?.seconds ? data.createdAt.seconds * 1000 : Date.now())
              });
            }
          }
        }
        setStories(newFriendStories);
      }, (err) => console.warn('StoriesNotify listener error:', err));

      return unsub;
    };

    let unsubStories;
    buildStoryNotifications().then(unsub => {
      unsubStories = unsub;
    });

    return () => {
      if (unsubStories) unsubStories();
    };
  }, [user?.uid, friends]);

  // 6. Filter categories
  const filterCategories = [
    { id: 'all', icon: 'bell.fill', color: '#2ecc71' },
    { id: 'message', icon: 'message.fill', color: '#0ef0ff', count: messages.length },
    { id: 'friend_request', icon: 'person.badge.plus', color: '#f1c40f', count: requests.length },
    { id: 'like', icon: 'heart.fill', color: '#ff4757', count: likes.length },
    { id: 'story', icon: 'play.circle.fill', color: '#a855f7', count: stories.length },
  ];

  // 7. Combined & Filtered Activity
  const activityItems = useMemo(() => {
    // Only show unread likes to keep the list clean as requested
    const unreadLikes = likes.filter(l => !l.read);
    const all = [...messages, ...requests, ...unreadLikes, ...stories];
    const filtered = activeFilter === 'all' ? all : all.filter(item => item.type === activeFilter);
    return filtered.sort((a, b) => b.sortTime - a.sortTime);
  }, [messages, requests, likes, stories, activeFilter]);

  const acceptRequest = async (request) => {
    if (!user) return;
    setProcessingId(request.id);
    try {
      const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
      const fromUserDoc = await getDoc(doc(db, 'users', request.sender.uid));

      const currentUserData = currentUserDoc.data() || {};
      const fromUserData = fromUserDoc.data() || {};

      const batch = writeBatch(db);

      const friendRef1 = doc(collection(db, 'friends'));
      batch.set(friendRef1, {
        userId: user.uid,
        friendId: request.sender.uid,
        friendName: fromUserData.name || request.sender.name || 'Unknown',
        friendAvatar: fromUserData.avatar || request.sender.avatar || '',
        friendCity: fromUserData.city || '',
        friendCountry: fromUserData.country || '',
        addedAt: serverTimestamp()
      });

      const friendRef2 = doc(collection(db, 'friends'));
      batch.set(friendRef2, {
        userId: request.sender.uid,
        friendId: user.uid,
        friendName: currentUserData.name || 'Unknown',
        friendAvatar: currentUserData.avatar || '',
        friendCity: currentUserData.city || '',
        friendCountry: currentUserData.country || '',
        addedAt: serverTimestamp()
      });

      batch.delete(doc(db, 'friendRequests', request.id));
      await batch.commit();
    } catch (error) {
      console.error("Error accepting request:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const rejectRequest = async (requestId) => {
    setProcessingId(requestId);
    try {
      await deleteDoc(doc(db, 'friendRequests', requestId));
    } catch (error) {
      console.error("Error rejecting request:", error);
    } finally {
      setProcessingId(null);
    }
  };

  const formatTime = (ts) => {
    if (!ts) return '';
    const ms = ts.toMillis ? ts.toMillis() : (ts.seconds ? ts.seconds * 1000 : 0);
    if (!ms) return '';
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const handleOpenStories = async (uid, name, avatar) => {
    try {
      const qStories = query(
        collection(db, 'stories'),
        where('userId', '==', uid),
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
        .sort((a, b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));

      if (userStories.length > 0) {
        setViewerStories(userStories);
        setViewerUser({ name, avatar });
        setViewerVisible(true);
      }
    } catch (e) {
      console.error("Error opening stories from notification:", e);
    }
  };

  const renderItem = ({ item }) => {
    const isProcessing = processingId === item.id;

    if (item.type === 'friend_request') {
      return (
        <TouchableOpacity
          style={styles.cardContainer}
          onPress={() => router.push(`/chat/${item.sender.uid}`)}
          activeOpacity={0.6}
        >
          <LinearGradient
            colors={['#1c2a4d', '#0a1224']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={styles.accentBorderRequest} />
            <View style={styles.cardHeader}>
              <View style={styles.alertTypeContainerRequest}>
                <IconSymbol name="person.badge.plus" size={12} color="#f1c40f" />
                <Text style={styles.alertTypeTextRequest}>
                  {t('notifications.friend_request', { defaultValue: 'FRIEND REQUEST' })}
                </Text>
              </View>
              <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.avatarContainer}>
                <StoryAvatar
                  userId={item.sender.uid}
                  avatarUrl={item.sender.avatar}
                  name={item.sender.name}
                  size={50}
                  hasStories={activeStoryUserIds.has(item.sender.uid)}
                  allViewed={!unviewedStoryUserIds.has(item.sender.uid)}
                  onPress={() => router.push(`/chat/${item.sender.uid}`)}
                  onStoryPress={() => handleOpenStories(item.sender.uid, item.sender.name, item.sender.avatar)}
                />
                <View style={styles.unreadDot} />
              </View>

              <View style={styles.info}>
                <Text style={styles.notificationText}>
                  <Text style={styles.nameText}>{item.sender.name}</Text>
                  {' '}{t('notifications.sent_request_notif', { defaultValue: 'sent you a friend request' })}
                </Text>

                <View style={styles.requestActions}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.acceptButton]}
                    onPress={(e) => {
                      e.stopPropagation();
                      acceptRequest(item);
                    }}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <IconSymbol name="checkmark" size={20} color="#fff" />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.rejectButton]}
                    onPress={(e) => {
                      e.stopPropagation();
                      rejectRequest(item.id);
                    }}
                    disabled={isProcessing}
                  >
                    <IconSymbol name="xmark" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    if (item.type === 'like') {
      return (
        <TouchableOpacity
          style={styles.cardContainer}
          onPress={async () => {
            try {
              const batch = writeBatch(db);
              
              // Find all unread likes from THIS sender to clear them all at once
              const unreadFromThisSender = likes.filter(l => l.sender.uid === item.sender.uid && !l.read);
              
              unreadFromThisSender.forEach(likeItem => {
                batch.update(doc(db, 'likes', likeItem.id), { read: true });
              });
              
              await batch.commit();
            } catch (e) {
              console.error('Error bulk marking likes as read:', e);
            }
            router.push(`/chat/${item.sender.uid}`);
          }}
          activeOpacity={0.7}
        >
          <LinearGradient
            colors={['#251c2e', '#0d0d14']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={styles.accentBorderLike} />
            <View style={styles.cardHeader}>
              <View style={styles.alertTypeContainerLike}>
                <IconSymbol name="heart.fill" size={12} color="#ff4757" />
                <Text style={styles.alertTypeTextLike}>
                  {t('notifications.liked_alert', { defaultValue: 'LIKED' })}
                </Text>
              </View>
              <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.avatarContainer}>
                <StoryAvatar
                  userId={item.sender.uid}
                  avatarUrl={item.sender.avatar}
                  name={item.sender.name}
                  size={50}
                  hasStories={activeStoryUserIds.has(item.sender.uid)}
                  allViewed={!unviewedStoryUserIds.has(item.sender.uid)}
                  onPress={() => router.push(`/chat/${item.sender.uid}`)}
                  onStoryPress={() => handleOpenStories(item.sender.uid, item.sender.name, item.sender.avatar)}
                />
              </View>

              <View style={styles.infoLike}>
                <Text style={styles.notificationText}>
                  <Text style={styles.nameText}>{item.sender.name}</Text>
                  {' '}{t('notifications.liked_photo_notif', { defaultValue: 'liked your photo' })}
                </Text>
              </View>

              {item.contentUrl && (
                <View style={styles.contentPreviewWrapper}>
                  <Image source={{ uri: item.contentUrl }} style={styles.contentPreview} />
                  <View style={styles.likeBadge}>
                    <IconSymbol name="heart.fill" size={10} color="#fff" />
                  </View>
                </View>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    if (item.type === 'story') {
      return (
        <TouchableOpacity
          style={styles.cardContainer}
          onPress={() => handleOpenStories(item.sender.uid, item.sender.name, item.sender.avatar)}
          activeOpacity={0.6}
        >
          <LinearGradient
            colors={['#1c1c2e', '#0a0a0f']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.card}
          >
            <View style={styles.accentBorderStory} />
            <View style={styles.cardHeader}>
              <View style={styles.alertTypeContainerStory}>
                <IconSymbol name="play.circle.fill" size={12} color="#a855f7" />
                <Text style={styles.alertTypeTextStory}>
                  {t('notifications.new_story', { defaultValue: 'NEW STORY' })}
                </Text>
              </View>
              <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.avatarContainer}>
                <StoryAvatar
                  userId={item.sender.uid}
                  avatarUrl={item.sender.avatar}
                  name={item.sender.name}
                  size={50}
                  hasStories={true}
                  allViewed={!unviewedStoryUserIds.has(item.sender.uid)}
                  onPress={() => handleOpenStories(item.sender.uid, item.sender.name, item.sender.avatar)}
                  onStoryPress={() => handleOpenStories(item.sender.uid, item.sender.name, item.sender.avatar)}
                />
              </View>

              <View style={styles.info}>
                <Text style={styles.notificationText}>
                  <Text style={styles.nameText}>{item.sender.name}</Text>
                  {' '}{t('notifications.posted_story_notif', { defaultValue: 'posted a new story' })}
                </Text>
              </View>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={styles.cardContainer}
        activeOpacity={0.8}
        onPress={() => router.push({
          pathname: `/chat/${item.sender.uid}`,
          params: { name: item.sender.name, avatar: item.sender.avatar, gender: item.sender.gender }
        })}
      >
        <LinearGradient
          colors={['#162544', '#0d162b']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.card}
        >
          <View style={styles.accentBorder} />
          <View style={styles.cardHeader}>
            <View style={styles.alertTypeContainer}>
              <IconSymbol name="bell.fill" size={12} color="#0ef0ff" />
              <Text style={styles.alertTypeText}>
                {t('notifications.new_alert', { defaultValue: 'NEW MESSAGE' }).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.timeText}>{formatTime(item.timestamp)}</Text>
          </View>

          <View style={styles.cardBody}>
            <View style={styles.avatarContainer}>
              <StoryAvatar
                userId={item.sender.uid}
                avatarUrl={item.sender.avatar}
                name={item.sender.name}
                size={50}
                hasStories={activeStoryUserIds.has(item.sender.uid)}
                allViewed={!unviewedStoryUserIds.has(item.sender.uid)}
                onPress={() => router.push(`/chat/${item.sender.uid}`)}
                onStoryPress={() => handleOpenStories(item.sender.uid, item.sender.name, item.sender.avatar)}
              />
            </View>

            <View style={styles.info}>
              <Text style={styles.notificationText}>
                <Text style={styles.nameText}>{item.sender.name || 'User'}</Text>
                {' '}{t('notifications.sent_message_notif', { defaultValue: 'sent you a message' })}
              </Text>

              <Text style={styles.messageSnippet} numberOfLines={1}>
                {(() => {
                  if (item.lastMessage.type === 'gift') {
                    const gift = getGiftById(item.lastMessage.giftId);
                    if (gift) {
                      const localizedName = t(gift.nameKey);
                      return `🎁 «${localizedName}» (+${item.lastMessage.minutes} ${t('gifts.minutes_unit')})`;
                    }
                    return '🎁 Gift';
                  }
                  if (item.lastMessage.type === 'image') return '📷 Photo';
                  if (item.lastMessage.type === 'video') return '🎥 Video';
                  return item.lastMessage.text || '...';
                })()}
              </Text>
            </View>

            {item.unreadCount > 0 && (
              <View style={styles.unreadCountBadge}>
                <Text style={styles.unreadCountText}>{item.unreadCount > 99 ? '99+' : item.unreadCount}</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerArea}>
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit={true}
        >
          {t('notifications.title', { defaultValue: 'Notifications', count: activityItems.length })}
        </Text>
        <View style={styles.headerDivider} />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {filterCategories.map((cat) => {
            const isActive = activeFilter === cat.id;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[
                  styles.filterTab,
                  isActive && { backgroundColor: `${cat.color}20`, borderColor: `${cat.color}50` },
                ]}
                onPress={() => setActiveFilter(cat.id)}
                activeOpacity={0.7}
              >
                <View style={styles.iconContainer}>
                  <IconSymbol 
                    name={cat.icon} 
                    size={20} 
                    color={isActive ? cat.color : '#64748b'} 
                  />
                  {cat.count > 0 && (
                    <View style={[styles.filterBadge, { backgroundColor: '#ff3b30' }]}>
                      <Text style={styles.filterBadgeText}>{cat.count > 99 ? '99+' : cat.count}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={Colors.dark.primary} />
        </View>
      ) : (
        <FlatList
          data={activityItems}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="bell.fill" size={64} color="#34495e" />
              <Text style={styles.emptyTitle}>{t('notifications.all_caught_up', { defaultValue: "All caught up" })}</Text>
              <Text style={styles.emptySubtitle}>{t('notifications.no_missed', { defaultValue: 'No missed messages' })}</Text>
            </View>
          }
          maxToRenderPerBatch={8}
          windowSize={5}
          initialNumToRender={10}
          removeClippedSubviews={true}
        />
      )}

      <StoryViewer
        visible={viewerVisible}
        stories={viewerStories}
        userName={viewerUser.name}
        userAvatar={viewerUser.avatar}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  headerArea: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(14, 240, 255, 0.3)',
    marginHorizontal: -4, // Adjust for headerArea padding (20-4=16)
    marginTop: 12,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: Colors.dark.primary,
    fontSize: 14,
    marginTop: 4,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 100,
  },
  cardContainer: {
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 24,
  },
  card: {
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    position: 'relative'
  },
  accentBorder: {
    position: 'absolute',
    left: 0,
    top: 15,
    bottom: 15,
    width: 3.5,
    backgroundColor: '#00f0ff', // Electric Blue
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
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
  },
  accentBorderLike: {
    position: 'absolute',
    left: 0,
    top: 15,
    bottom: 15,
    width: 3.5,
    backgroundColor: '#ff0070', // Neon Pink/Red
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  accentBorderStory: {
    position: 'absolute',
    left: 0,
    top: 15,
    bottom: 15,
    width: 3.5,
    backgroundColor: '#a855f7', // Purple
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  alertTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  alertTypeContainerRequest: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  alertTypeContainerLike: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 0, 112, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  alertTypeContainerStory: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(168, 85, 247, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  alertTypeText: {
    color: '#00f0ff',
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 6,
    letterSpacing: 0.8,
  },
  alertTypeTextRequest: {
    color: '#fff01f',
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 6,
    letterSpacing: 0.8,
  },
  alertTypeTextLike: {
    color: '#ff0070',
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 6,
    letterSpacing: 0.8,
  },
  alertTypeTextStory: {
    color: '#a855f7',
    fontSize: 10,
    fontWeight: '900',
    marginLeft: 6,
    letterSpacing: 0.8,
  },
  requestActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 10,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptButton: {
    backgroundColor: Colors.dark.primary,
  },
  rejectButton: {
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(231, 76, 60, 0.3)',
  },
  cardBody: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#34495e',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  info: {
    flex: 1,
    marginLeft: 14,
  },
  notificationText: {
    color: '#cbd5e1',
    fontSize: 15,
    lineHeight: 20,
  },
  nameText: {
    color: '#fff',
    fontWeight: '800',
  },
  messageSnippet: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 2,
  },
  timeText: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '600',
  },
  unreadCountBadge: {
    backgroundColor: '#e74c3c',
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 12,
  },
  unreadCountText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 120,
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: '#7f8c8d',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  infoLike: {
    marginLeft: 12,
    maxWidth: '65%',
  },
  contentPreviewWrapper: {
    width: 52,
    height: 52,
    borderRadius: 10,
    marginLeft: 12,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    position: 'relative',
    backgroundColor: '#1a1a1a',
  },
  contentPreview: {
    width: '100%',
    height: '100%',
  },
  likeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#ff4757',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0d0d14',
    shadowColor: '#ff4757',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    elevation: 3,
  },
  // Filter Bar Styles
  filterBar: {
    paddingBottom: 8,
  },
  filterScrollContent: {
    paddingHorizontal: 12,
    gap: 8,
    flexGrow: 1,
    justifyContent: 'center',
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  iconContainer: {
    position: 'relative',
    padding: 2,
  },
  filterBadge: {
    position: 'absolute',
    top: -8,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: Colors.dark.background,
  },
  filterBadgeText: {
    color: '#000',
    fontSize: 9,
    fontWeight: '900',
  },
});
