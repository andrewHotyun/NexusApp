import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Image, 
  TouchableOpacity, 
  SafeAreaView,
  ActivityIndicator,
  RefreshControl,
  Platform,
  StatusBar,
  TextInput,
  KeyboardAvoidingView
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../../utils/firebase';
import { collection, query, where, onSnapshot, orderBy, doc, getDoc, getDocs, limit, writeBatch, deleteDoc } from 'firebase/firestore';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/theme';
import { IconSymbol } from '../../components/ui/icon-symbol';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { getAvatarColor } from '../../utils/avatarUtils';
import { OnlineStatusIndicator } from '../../components/ui/OnlineStatusIndicator';
import { Swipeable, GestureHandlerRootView, RectButton } from 'react-native-gesture-handler';
import { ActionModal } from '../../components/ui/ActionModal';
import { Alert } from 'react-native';
import { StoryAvatar } from '../../components/ui/StoryAvatar';
import { getGiftById } from '../../constants/gifts';
import { StoryViewer } from '../../components/ui/StoryViewer';

// In-memory cache for user profiles to avoid redundant fetches
const userProfileCache = {};

export default function ChatsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = auth.currentUser;
  
  const [sentMessages, setSentMessages] = useState([]);
  const [receivedMessages, setReceivedMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [initialFetchesDone, setInitialFetchesDone] = useState({ sent: false, received: false });
  const [deletingChatId, setDeletingChatId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const swipeableRefs = useRef(new Map());
  const migrationDone = useRef(false);
  const [hiddenChats, setHiddenChats] = useState(new Set());
  const [myBlockedIds, setMyBlockedIds] = useState([]);
  const [blockedMeIds, setBlockedMeIds] = useState([]);
  const [blocksLoaded, setBlocksLoaded] = useState(false);
  const [profileFetchCount, setProfileFetchCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [typingUsers, setTypingUsers] = useState({}); // { senderId: boolean }
  const [activeStoryUserIds, setActiveStoryUserIds] = useState(new Set());
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStories, setViewerStories] = useState([]);
  const [viewerUser, setViewerUser] = useState({ name: '', avatar: '' });
  // Clean up in-memory cache on logout if user changes
  useEffect(() => {
    return () => {
      // Also clear in-memory cache on logout if user changes
      if (!user) {
        Object.keys(userProfileCache).forEach(key => delete userProfileCache[key]);
      }
    };
  }, [user]);

  // Load chats from fast local cache immediately
  useEffect(() => {
    if (user?.uid) {
      AsyncStorage.getItem(`chats_cache_${user.uid}`).then(cached => {
        if (cached) {
          try {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.length > 0) {
              parsed.forEach(chat => {
                if (chat.partner?.uid && !userProfileCache[chat.partner.uid]) {
                  // Pre-hydrate cache with old known valid data so UI does not flicker
                  userProfileCache[chat.partner.uid] = { ...chat.partner, _fresh: false };
                }
              });
              setChats(parsed);
              setLoading(false);
            }
          } catch (e) {
            console.error('Error parsing cached chats:', e);
          }
        }
      });
    }
  }, [user?.uid]);

  // 1. Listen for sent messages
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'messages'),
      where('senderId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(300)
    );
    const unsub = onSnapshot(q, (snap) => {
      setSentMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInitialFetchesDone(prev => ({ ...prev, sent: true }));
    }, (err) => console.warn('SentMessages listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  // 2. Listen for received messages
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      orderBy('timestamp', 'desc'),
      limit(300)
    );
    const unsub = onSnapshot(q, (snap) => {
      setReceivedMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInitialFetchesDone(prev => ({ ...prev, received: true }));
    }, (err) => console.warn('ReceivedMessages listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  // 2.5 Listen for bidirectional blocks
  useEffect(() => {
    if (!user) return;
    
    // Who I blocked
    const unsub1 = onSnapshot(query(collection(db, 'blocks'), where('blockerId', '==', user.uid)), (snap) => {
      setMyBlockedIds(snap.docs.map(d => d.data().blockedId));
      setProfileFetchCount(prev => prev + 1);
    }, (err) => console.warn('MyBlockedIds listener error:', err));

    // Who blocked me
    const unsub2 = onSnapshot(query(collection(db, 'blocks'), where('blockedId', '==', user.uid)), (snap) => {
      setBlockedMeIds(snap.docs.map(d => d.data().blockerId));
      setProfileFetchCount(prev => prev + 1);
    }, (err) => console.warn('BlockedMeIds listener error:', err));

    setBlocksLoaded(true);
    return () => {
      unsub1();
      unsub2();
    };
  }, [user?.uid]);

  // 2.6 Listen for typing statuses
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'typingStatus'),
      where('receiverId', '==', user.uid),
      where('isTyping', '==', true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const typing = {};
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.senderId) {
          typing[data.senderId] = true;
        }
      });
      setTypingUsers(typing);
    }, (err) => console.warn('TypingUsers listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  // 2.7 Listen for all active stories to show rings
  // Only filter by status (auto-indexed) — no composite index needed.
  // Filter by expiresAt locally to match web ChatList.js pattern.
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
    }, (err) => console.warn('Stories listener error:', err));
    return () => unsub();
  }, [user?.uid]);

  // Global migration: patch old messages without chatId (runs once on load)
  useEffect(() => {
    if (!user || migrationDone.current) return;
    const allMsgs = [...sentMessages, ...receivedMessages];
    const toPatch = allMsgs.filter(m => !m.chatId && m.senderId && m.receiverId);
    if (toPatch.length === 0) {
      if (initialFetchesDone.sent && initialFetchesDone.received) {
        migrationDone.current = true;
      }
      return;
    }

    (async () => {
      try {
        // Firestore batches support max 500 writes
        for (let i = 0; i < toPatch.length; i += 400) {
          const chunk = toPatch.slice(i, i + 400);
          const batch = writeBatch(db);
          chunk.forEach(m => {
            const chatId = [m.senderId, m.receiverId].sort().join('_');
            batch.update(doc(db, 'messages', m.id), { chatId });
          });
          await batch.commit();
        }
        console.log(`Migrated ${toPatch.length} messages with chatId`);
      } catch (e) {
        console.error('Migration error:', e);
      }
    })();
  }, [sentMessages, receivedMessages, user?.uid]);

  // 3. Aggregate messages into conversations
  useEffect(() => {
    const aggregate = async () => {
      if (!user) return;
      if (!initialFetchesDone.sent || !initialFetchesDone.received) return;
      
      const allMessages = [...sentMessages, ...receivedMessages].sort((a, b) => {
        const timeA = a.timestamp?.toMillis?.() || 0;
        const timeB = b.timestamp?.toMillis?.() || 0;
        return timeB - timeA;
      });

      const conversationMap = new Map();
      const uniquePartnerIds = new Set();

      allMessages.forEach(msg => {
        const partnerId = msg.senderId === user.uid ? msg.receiverId : msg.senderId;
        if (!partnerId) return;
        
        if (!conversationMap.has(partnerId)) {
          conversationMap.set(partnerId, {
            id: partnerId,
            lastMessage: msg,
            unreadCount: 0
          });
          uniquePartnerIds.add(partnerId);
        }

        // Count unread (only for received messages)
        if (msg.receiverId === user.uid && !msg.read) {
          conversationMap.get(partnerId).unreadCount++;
        }
      });

      // Fetch user profiles for each conversation asynchronously
      const chatList = [...conversationMap.values()].map((chat) => {
        const cached = userProfileCache[chat.id];
        
        // If profile is missing or stale, start a subscription
        if ((!cached || (!cached._fresh && !cached._fetching)) && chat.id !== 'system' && chat.id !== 'admin') {
          if (!cached) {
            userProfileCache[chat.id] = { _fetching: true };
          } else {
            userProfileCache[chat.id]._fetching = true;
          }
          
          // Perform a ONE-OFF background fetch instead of a permanent DB listener
          getDoc(doc(db, 'users', chat.id)).then(userDoc => {
            if (userDoc.exists()) {
              userProfileCache[chat.id] = { 
                ...userProfileCache[chat.id], 
                ...userDoc.data(), 
                _fresh: true, 
                _fetching: false 
              };
            } else {
              userProfileCache[chat.id] = { 
                ...userProfileCache[chat.id], 
                _notFound: true, 
                _fresh: true, 
                _fetching: false 
              };
            }
            
            // Incrementally update the existing chats state without re-triggering the full aggregate effect
            setChats(prevChats => {
              let changed = false;
              const next = prevChats.map(c => {
                if (c.id === chat.id) {
                  changed = true;
                  return {
                    ...c,
                    partner: { 
                      ...(userProfileCache[chat.id]._notFound ? {} : userProfileCache[chat.id]), 
                      name: userProfileCache[chat.id].name || c.partner.name,
                      uid: chat.id 
                    }
                  };
                }
                return c;
              });
              
              // Sync to backup cache
              if (changed && user?.uid) {
                AsyncStorage.setItem(`chats_cache_${user.uid}`, JSON.stringify(next)).catch(()=>{});
              }
              return changed ? next : prevChats;
            });
          }).catch(e => {
            if (userProfileCache[chat.id]) userProfileCache[chat.id]._fetching = false;
            console.error(`Error fetching user ${chat.id}:`, e);
          });
        }
        
        const updatedCached = userProfileCache[chat.id];

        // Use cached name, or fallback to the message metadata, or "User"
        const partnerName = updatedCached?.name || 
                           (chat.lastMessage.senderId === chat.id ? chat.lastMessage.senderName : chat.lastMessage.receiverName) || 
                           'User';

        return {
          ...chat,
          partner: { 
            ...(updatedCached?._notFound ? {} : updatedCached), 
            name: partnerName, 
            uid: chat.id
          }
        };
      });

      // Filter out technical chats, phantom users, AND blocked users
      const filteredChats = chatList.filter(chat => {
        const cached = userProfileCache[chat.id];
        
        // Hide only if it is completely brand new & fetching, OR permanently not found
        const isTemporaryNewFetch = cached?._fetching && !cached?.name;
        const hasProfile = cached && !cached._notFound && !isTemporaryNewFetch;
        
        // Bidirectional Block Filter (Sync with Web: chat disappears for both)
        const isBlocked = (myBlockedIds && myBlockedIds.includes(chat.id)) || 
                          (blockedMeIds && blockedMeIds.includes(chat.id));
        if (isBlocked) return false;

        const lastMsgText = chat.lastMessage.text || '';
        const isTechnical = chat.lastMessage.type === 'video_call_ended' || 
                            chat.lastMessage.type === 'video_call_declined' ||
                            lastMsgText.toLowerCase().includes('video call');
        
        // CRITICAL RULE: Don't show the chat if the user is missing AND it's just a call record
        // This removes the "User" ghost entries after random matches or technical sessions.
        if (!hasProfile && isTechnical) return false;
        if (chat.id === 'system' || chat.id === 'admin') return false;
        if (hiddenChats.has(chat.id)) return false;

        return true;
      });

      // Final sort by latest message
      const sortedChats = filteredChats.sort((a, b) => {
        const timeA = a.lastMessage.timestamp?.toMillis?.() || 0;
        const timeB = b.lastMessage.timestamp?.toMillis?.() || 0;
        return timeB - timeA;
      });

      setChats(sortedChats);
      setLoading(false);
      setRefreshing(false);
      
      // Save the updated computed list to local cache (instantly cached)
      if (user?.uid) {
        AsyncStorage.setItem(`chats_cache_${user.uid}`, JSON.stringify(sortedChats)).catch(e => {
          console.error("Failed to cache chats:", e);
        });
      }
    };

    aggregate();
  }, [sentMessages, receivedMessages, initialFetchesDone, user?.uid, hiddenChats, myBlockedIds, blockedMeIds]);

  const onRefresh = () => {
    setRefreshing(true);
    
    // Invalidate local profile cache to force re-fetching standard and online status
    chats.forEach(chat => {
      if (chat.partner?.uid && userProfileCache[chat.partner.uid]) {
        userProfileCache[chat.partner.uid]._fresh = false;
        userProfileCache[chat.partner.uid]._fetching = false;
      }
    });
    
    // Force re-render which will trigger the profile fetch logic again
    setProfileFetchCount(c => c + 1);

    // Turn off the spinner after giving Firestore a moment to respond
    setTimeout(() => {
      setRefreshing(false);
    }, 1200);
  };

  const handleDeleteChat = () => {
    if (!user || !deletingChatId) return;
    
    const partnerId = deletingChatId;
    const chatId = [user.uid, partnerId].sort().join('_');
    
    // 1. Optimistic UI update - instantly hide chat
    setHiddenChats(prev => {
      const next = new Set(prev);
      next.add(partnerId);
      return next;
    });

    // 2. Close modal & swipeable
    const ref = swipeableRefs.current.get(partnerId);
    if (ref) ref.close();
    setDeletingChatId(null);
    
    // 3. Perform deletion in background
    setDeleting(true);
    setTimeout(async () => {
      try {
        const messagesRef = collection(db, 'messages');
        
        const queriesToClear = [
          query(messagesRef, where('chatId', '==', chatId)),
          query(messagesRef, where('senderId', '==', user.uid), where('receiverId', '==', partnerId)),
          query(messagesRef, where('senderId', '==', partnerId), where('receiverId', '==', user.uid))
        ];

        for (const q of queriesToClear) {
          const snap = await getDocs(q);
          if (snap.empty) continue;
          
          const docs = snap.docs;
          for (let i = 0; i < docs.length; i += 450) {
            const batch = writeBatch(db);
            docs.slice(i, i + 450).forEach(d => batch.delete(d.ref));
            await batch.commit();
          }
        }

        console.log(`[Nexus] Deleted chat with ${partnerId}`);
      } catch (e) {
        console.error("Error deleting chat:", e);
        // If deletion failed, we bring it back to the UI
        setHiddenChats(prev => {
          const next = new Set(prev);
          next.delete(partnerId);
          return next;
        });
        Alert.alert(t('common.error'), t('chat.clear_error'));
      } finally {
        setDeleting(false);
      }
    }, 100);
  };

  const renderRightActions = (id) => {
    return (
      <View style={{ width: 90 }}>
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1000, backgroundColor: '#ff4444' }} />
        <TouchableOpacity 
          style={styles.deleteAction}
          onPress={() => setDeletingChatId(id)}
        >
          <IconSymbol name="trash.fill" size={24} color="#fff" />
          <Text style={styles.deleteActionText}>{t('common.delete')}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderChatItem = ({ item }) => {
    const { partner, lastMessage, unreadCount } = item;
    let timeStr = '';
    if (lastMessage.timestamp) {
      const ms = typeof lastMessage.timestamp.toMillis === 'function' 
        ? lastMessage.timestamp.toMillis() 
        : (lastMessage.timestamp.seconds ? lastMessage.timestamp.seconds * 1000 : 0);
      if (ms > 0) {
        timeStr = new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    }

    return (
      <Swipeable
        containerStyle={styles.swipeableContainer}
        ref={(ref) => {
          const id = partner.uid || item.id;
          if (ref) {
            swipeableRefs.current.set(id, ref);
          } else {
            swipeableRefs.current.delete(id);
          }
        }}
        renderRightActions={() => renderRightActions(partner.uid || item.id)}
        rightThreshold={40}
        onSwipeableWillOpen={() => setDeletingChatId(partner.uid || item.id)}
      >
        <View style={styles.chatCardWrapper}>
          <View style={styles.accentBorder} />
          <View style={styles.chatCardRow}>
            <View style={styles.avatarContainerWrapper}>
              <StoryAvatar 
                userId={partner.uid || item.id} 
                avatarUrl={partner.avatar} 
                name={partner.name} 
                size={50}
                hasStories={activeStoryUserIds.has(partner.uid || item.id)}
                onPress={() => router.push({
                  pathname: `/chat/${partner.uid || item.id}`,
                  params: { 
                    name: partner.name,
                    avatar: partner.avatar,
                    gender: partner.gender
                  }
                })}
                onStoryPress={async () => {
                  try {
                    const q = query(
                      collection(db, 'stories'),
                      where('userId', '==', partner.uid || item.id),
                      where('status', '==', 'approved')
                    );
                    // Single fetch for the modal
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
                      setViewerUser({ name: partner.name, avatar: partner.avatar });
                      setViewerVisible(true);
                    }
                  } catch (e) {
                    console.error("Error loading stories for viewer:", e);
                  }
                }}
              />
            </View>

            <RectButton 
              style={styles.chatCardInfoBtn}
              underlayColor="rgba(255,255,255,0.1)"
              activeOpacity={0.6}
              onPress={() => router.push({
                pathname: `/chat/${partner.uid || item.id}`,
                params: { 
                  name: partner.name,
                  avatar: partner.avatar,
                  gender: partner.gender
                }
              })}>
              <View style={styles.chatInfo}>
                <View style={styles.chatHeader}>
                  <Text style={styles.userName} numberOfLines={1}>{partner.name || 'User'}{partner.age ? `, ${partner.age}` : ''}</Text>
                  <Text style={styles.timeText}>{timeStr}</Text>
                </View>
                <View style={styles.lastMessageRow}>
                  {typingUsers[partner.uid || item.id] ? (
                    <Text style={[styles.lastMessage, styles.typingIndicatorText]} numberOfLines={1}>
                      {t('chat.typing', 'Typing...')}
                    </Text>
                  ) : (
                    <>
                      <Text style={[styles.lastMessage, unreadCount > 0 && styles.unreadMessage]} numberOfLines={1}>
                        {(() => {
                          if (lastMessage.type === 'image') return '📷 Photo';
                          if (lastMessage.type === 'video') return '🎥 Video';
                          if (lastMessage.type === 'gift') {
                            const gift = getGiftById(lastMessage.giftId);
                            if (gift) {
                              const localizedName = t(gift.nameKey);
                              return `🎁 «${localizedName}» (+${lastMessage.minutes} ${t('gifts.minutes_unit')})`;
                            }
                          }
                          return lastMessage.text || t('chats.no_text', 'No text message');
                        })()}
                      </Text>
                    {lastMessage.senderId === user?.uid && unreadCount === 0 && (
                      <Ionicons 
                        name={lastMessage.read === true ? "checkmark-done" : "checkmark"} 
                        size={16} 
                        color={lastMessage.read === true ? "#00e5ff" : "rgba(255,255,255,0.35)"} 
                        style={{ marginLeft: 6 }}
                      />
                    )}
                  </>
                )}
                {unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadText}>{unreadCount}</Text>
                  </View>
                )}
            </View>
          </View>
        </RectButton>
      </View>
    </View>
      </Swipeable>
    );
  };

  const filteredChats = useMemo(() => {
    if (!searchQuery.trim()) return chats;
    return chats.filter(chat => {
      const q = searchQuery.toLowerCase();
      const matchesName = chat.partner?.name?.toLowerCase().includes(q);
      const matchesMsg = chat.lastMessage?.text?.toLowerCase().includes(q);
      return matchesName || matchesMsg;
    });
  }, [chats, searchQuery]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.headerArea}>
            <View style={styles.searchContainer}>
              <IconSymbol name="magnifyingglass" size={18} color="#7f8c8d" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('chats.search_placeholder', 'Search by Name or Message')}
                placeholderTextColor="#7f8c8d"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
                autoCapitalize="none"
                clearButtonMode="while-editing"
              />
            </View>
            <View style={styles.filterRow}>
              <Text style={styles.headerTitle}>
                {searchQuery ? t('chats.search_results', 'Search Results') : t('chats.all_chats', { count: chats.length })}
              </Text>
            </View>
            <View style={styles.headerDivider} />
          </View>

          {loading && !refreshing ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
            </View>
          ) : (
            <FlatList
              data={filteredChats}
          renderItem={renderChatItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.dark.primary} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <IconSymbol name="bubble.left.and.bubble.right.fill" size={64} color="#34495e" />
              <Text style={styles.emptyTitle}>{t('chats.no_chats_title', 'No Messages Yet')}</Text>
              <Text style={styles.emptySubtitle}>{t('chats.no_chats_desc', 'Start chatting with your friends to see them here.')}</Text>
              <TouchableOpacity style={styles.findFriendsBtn} onPress={() => router.push('/(tabs)/friends')}>
                <Text style={styles.findFriendsText}>{t('chats.find_friends', 'Find Friends')}</Text>
              </TouchableOpacity>
            </View>
          }
          maxToRenderPerBatch={10}
          windowSize={5}
        />
      )}

        <ActionModal 
          visible={!!deletingChatId}
          onClose={() => {
            if (deletingChatId) {
              const ref = swipeableRefs.current.get(deletingChatId);
              if (ref) {
                ref.close();
              }
            }
            setDeletingChatId(null);
          }}
          onConfirm={handleDeleteChat}
          title={t('chat.confirm_delete_title', { defaultValue: 'Delete Chat?' })}
          message={t('chat.confirm_delete_text', { defaultValue: 'Are you sure you want to delete this conversation for both parties?' })}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel', { defaultValue: 'Cancel' })}
          isDestructive={true}
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
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: Colors.dark.background
  },
  headerArea: { 
    paddingHorizontal: 16, 
    paddingTop: 10, 
    paddingBottom: 10, 
  },
  headerDivider: {
    height: 1,
    backgroundColor: 'rgba(0, 240, 255, 0.3)',
    marginTop: 12,
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
    justifyContent: 'center', 
    marginTop: 24,
    marginBottom: 6,
    width: '100%'
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800', textAlign: 'center' },
  listContent: { paddingBottom: 100, paddingTop: 12 },
  swipeableContainer: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  chatCardWrapper: {
    backgroundColor: '#121e31',
    borderRadius: 20,
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
    zIndex: 10,
  },
  chatCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainerWrapper: {
    paddingLeft: 16,
    paddingVertical: 16,
    zIndex: 20,
  },
  chatCardInfoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingLeft: 12,
    paddingRight: 16,
  },
  deleteAction: {
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    width: 90,
    height: '100%',
  },
  deleteActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  avatarContainer: { position: 'relative' },
  avatar: { 
    width: 50, 
    height: 50, 
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.dark.primary
  },
  avatarPlaceholder: { 
    width: 50, 
    height: 50, 
    borderRadius: 25, 
    justifyContent: 'center', 
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.primary
  },
  avatarInitial: { color: Colors.dark.primary, fontSize: 20, fontWeight: '700' },
  chatInfo: { flex: 1, marginLeft: 0 },
  chatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  chatHeaderRight: { flexDirection: 'row', alignItems: 'center' },
  userName: { color: '#fff', fontSize: 18, fontWeight: '700', flex: 1, marginRight: 8 },
  timeText: { color: '#7f8c8d', fontSize: 12 },
  lastMessageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lastMessage: { color: '#bdc3c7', fontSize: 15, flex: 1 },
  unreadMessage: { color: '#fff', fontWeight: '600' },
  typingIndicatorText: { color: Colors.dark.primary, fontStyle: 'italic', fontWeight: '600' },
  unreadBadge: { 
    backgroundColor: '#e74c3c', 
    borderRadius: 10, 
    minWidth: 20, 
    height: 20, 
    justifyContent: 'center', 
    alignItems: 'center',
    paddingHorizontal: 6,
    marginLeft: 8
  },
  unreadText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 100, paddingHorizontal: 40 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 20 },
  emptySubtitle: { color: '#7f8c8d', fontSize: 15, textAlign: 'center', marginTop: 8 },
  findFriendsBtn: { marginTop: 24, backgroundColor: Colors.dark.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  findFriendsText: { color: '#fff', fontSize: 16, fontWeight: '700' }
});
