import { ResizeMode, Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, doc, onSnapshot, query, where, addDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Animated } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert
} from 'react-native';
import { Colors } from '../../constants/theme';
import { db, auth } from '../../utils/firebase';
import { IconSymbol } from './icon-symbol';
import { earningsManager } from '../../utils/earningsManager';
import * as Haptics from 'expo-haptics';
import { StoryAvatar } from './StoryAvatar';
import { StoryViewer } from './StoryViewer';
import { getAvatarColor } from '../../utils/avatarUtils';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_MARGIN = 6;
const FOLDER_GAP = 8;
const CONTAINER_PADDING = 20;
const ITEM_SIZE = (SCREEN_WIDTH - (CONTAINER_PADDING * 2) - (ITEM_MARGIN * (COLUMN_COUNT - 1))) / COLUMN_COUNT;
const FOLDER_TAB_WIDTH = (SCREEN_WIDTH - (CONTAINER_PADDING * 2) - (FOLDER_GAP * 2)) / 3;

const CustomVideoPlayer = ({ url, isPlaying, onTogglePlay }) => {
  const [status, setStatus] = useState({ position: 0, duration: 0, isLoaded: false });

  const formatTime = (millis) => {
    if (!millis) return '0:00';
    const totalSeconds = Math.floor(millis / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const progress = status.duration > 0 ? (status.position / status.duration) * 100 : 0;

  return (
    <TouchableOpacity 
      activeOpacity={1}
      style={styles.fullScreenImage} 
      onPress={onTogglePlay}
    >
      <Video
        source={{ uri: url }}
        style={StyleSheet.absoluteFillObject}
        useNativeControls={false}
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        shouldPlay={isPlaying}
        onPlaybackStatusUpdate={(s) => {
          if (s.isLoaded) {
            setStatus({ position: s.positionMillis, duration: s.durationMillis, isLoaded: true });
          }
        }}
        progressUpdateIntervalMillis={250}
      />
      {!isPlaying && (
        <View style={styles.playPauseOverlay}>
          <BlurView intensity={40} style={styles.playPauseIconWrapper}>
            <IconSymbol name="play.fill" size={40} color="#fff" />
          </BlurView>
        </View>
      )}
      
      {status.isLoaded && (
        <View style={styles.videoControlsContainer}>
          <Text style={styles.timeText}>{formatTime(status.position)}</Text>
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
          </View>
          <Text style={styles.timeText}>{formatTime(status.duration)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

export const UserProfileModal = ({ isVisible, onClose, userId }) => {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fullScreenMediaUrl, setFullScreenMediaUrl] = useState(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [likedItems, setLikedItems] = useState(new Set());
  const [isLiking, setIsLiking] = useState(false);
  const [hasStories, setHasStories] = useState(false);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerStories, setViewerStories] = useState([]);
  const likeScale = useRef(new Animated.Value(1)).current;

  // Pop animation for the like button
  const animateLike = () => {
    Animated.sequence([
      Animated.spring(likeScale, {
        toValue: 1.3,
        useNativeDriver: true,
        speed: 50,
        bounciness: 12,
      }),
      Animated.spring(likeScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 20,
      })
    ]).start();
  };

  // Find current item dynamically from folders to avoid stale data
  const getCurrentItem = () => {
    if (!fullScreenMediaUrl) return null;
    for (const folder of folders) {
      const item = folder.items?.find(i => i.url === fullScreenMediaUrl);
      if (item) return item;
    }
    return null;
  };

  const currentItem = getCurrentItem();

  // Check if item was already liked in the session OR in the Firestore data
  const isLiked = (item) => {
    if (!item) return false;
    if (likedItems.has(item.url)) return true;
    return item.likedBy?.includes(auth.currentUser?.uid);
  };

  const handleLikePhoto = async (item) => {
    if (!auth.currentUser || !userId || isLiking || !item) return;

    const alreadyLiked = isLiked(item);
    // Optimistic UI update: toggle local state immediately
    setLikedItems(prev => {
      const next = new Set(prev);
      if (alreadyLiked) next.delete(item.url);
      else next.add(item.url);
      return next;
    });

    setIsLiking(true);
    animateLike();

    try {
      // Find the folder document to update the 'likedBy' array (for web compatibility)
      const folder = folders.find(f => f.items?.some(i => i.url === item.url));
      if (folder) {
        const folderRef = doc(db, 'galleries', folder.id);
        const updatedItems = folder.items.map(i => {
          if (i.url === item.url) {
            const currentLikedBy = i.likedBy || [];
            return {
              ...i,
              likedBy: alreadyLiked 
                ? currentLikedBy.filter(uid => uid !== auth.currentUser.uid)
                : [...currentLikedBy, auth.currentUser.uid]
            };
          }
          return i;
        });

        await updateDoc(folderRef, { items: updatedItems });
      }

      if (!alreadyLiked) {
        // Record like for notifications (new likes only)
        await addDoc(collection(db, 'likes'), {
          senderId: auth.currentUser.uid,
          targetUserId: userId,
          contentUrl: item.url,
          contentType: item.type || 'image',
          createdAt: serverTimestamp(),
          read: false
        });

        // Add earnings if recipient is a woman
        await earningsManager.addLikeEarnings(
          userId, 
          auth.currentUser.uid, 
          'gallery', 
          item.url
        );
        
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      }
    } catch (error) {
      console.error("Error toggling like:", error);
      // Revert optimistic update on error if needed (optional)
    } finally {
      setIsLiking(false);
    }
  };

  useEffect(() => {
    if (!isVisible || !userId) return;

    setLoading(true);

    // Listen to user profile
    const userUnsubscribe = onSnapshot(doc(db, 'users', userId), (docSnap) => {
      if (docSnap.exists()) {
        setProfile({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    }, (err) => {
      console.warn('UserProfileModal sync error:', err);
      setLoading(false);
    });

    // Listen to user's media folders
    const galleryQuery = query(collection(db, 'galleries'), where('userId', '==', userId));
    const galleryUnsubscribe = onSnapshot(galleryQuery, (snapshot) => {
      const foldersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Сортуємо папки так, щоб нові з'являлися в кінці (далі), а не спочатку
      foldersData.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeA - timeB;
      });

      setFolders(foldersData);
      if (foldersData.length > 0) {
        setSelectedFolderId(prev => prev || foldersData[0].id);
      }
    }, (err) => console.warn('UserGallery sync error:', err));

    // Listen for user's active stories
    // Uses userId + status only (index exists from web version).
    const qStories = query(
      collection(db, 'stories'),
      where('userId', '==', userId),
      where('status', '==', 'approved')
    );
    const storiesUnsubscribe = onSnapshot(qStories, (snap) => {
      const now = new Date();
      const hasActive = snap.docs.some(doc => {
        const data = doc.data();
        const expiresAt = data.expiresAt ? (data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)) : null;
        return expiresAt && expiresAt > now;
      });
      setHasStories(hasActive);
    }, (err) => console.warn('UserStories sync error:', err));

    return () => {
      userUnsubscribe();
      galleryUnsubscribe();
      storiesUnsubscribe();
    };
  }, [isVisible, userId]);

  const activeFolder = folders.find(f => f.id === selectedFolderId);
  const mediaItems = activeFolder?.items || [];
  const totalMediaCount = folders.reduce((sum, folder) => sum + (folder.items?.length || 0), 0);

  if (!isVisible) return null;

  const renderQuickStat = (icon, label, value) => (
    <View style={styles.statCard}>
      <IconSymbol name={icon} size={20} color={Colors.dark.primary} />
      <View style={styles.statTextWrapper}>
        <Text style={styles.statLabel}>{label}</Text>
        <Text style={styles.statValue} numberOfLines={1}>{value || t('common.not_specified')}</Text>
      </View>
    </View>
  );

  const renderBackground = () => {
    return (
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#060b16' }]}>
        <LinearGradient
          colors={['rgba(13, 139, 209, 0.25)', 'transparent']}
          style={{ height: 300, position: 'absolute', top: 0, left: 0, right: 0 }}
        />
        <LinearGradient
          colors={['transparent', 'rgba(11, 18, 32, 0.8)']}
          style={{ height: 400, position: 'absolute', bottom: 0, left: 0, right: 0 }}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <TouchableOpacity style={styles.dismissArea} activeOpacity={1} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {renderBackground()}

          <View style={styles.dragHandle} />

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loaderWrapper}>
                <ActivityIndicator size="large" color={Colors.dark.primary} />
              </View>
            ) : profile ? (
              <>
                {/* Header Section */}
                <View style={styles.header}>
                  <View style={styles.avatarContainer}>
                    <StoryAvatar 
                      userId={userId} 
                      avatarUrl={profile.avatar} 
                      name={profile.name} 
                      size={130}
                      hasStories={hasStories}
                      onPress={() => {
                        setFullScreenMediaUrl(profile.originalAvatarUrl || profile.avatar);
                        setIsVideoPlaying(true);
                      }}
                      onStoryPress={async () => {
                        try {
                          const q = query(
                            collection(db, 'stories'),
                            where('userId', '==', userId),
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
                    {profile.online && (
                      <View style={styles.onlineStatus}>
                        <View style={styles.onlineDot} />
                        <Text style={styles.onlineText}>{t('profile.online')}</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.name}>{profile.name}, {profile.age}</Text>
                  {profile.city && profile.country && (
                    <View style={styles.locationContainer}>
                      <IconSymbol name="location.fill" size={16} color={Colors.dark.primary} />
                      <Text style={styles.location}>{profile.city}, {profile.country}</Text>
                    </View>
                  )}
                </View>

                {/* Bio Section */}
                {profile.aboutMe && (
                  <View style={styles.bioSection}>
                    <Text style={styles.sectionTitle}>{t('profile.about_me')}</Text>
                    <View style={styles.bioCard}>
                      <Text style={styles.bioText}>{profile.aboutMe}</Text>
                    </View>
                  </View>
                )}

                {/* Quick Stats Grid */}
                <View style={styles.statsContainer}>
                  <View style={styles.statsRow}>
                    {renderQuickStat(profile.gender?.toLowerCase() === 'woman' ? 'female' : 'male', t('profile.gender_label'), t(`profile.gender_${profile.gender}`))}
                    {renderQuickStat('message.fill', t('profile.chat_type'), profile.chatType === '18+' ? '18+' : t('profile.chat_type_normal'))}
                  </View>
                  <View style={styles.statsRow}>
                    {renderQuickStat('birthday.cake.fill', t('profile.age_label'), t('profile.age_value', { count: profile.age }))}
                    {renderQuickStat('calendar', t('profile.registration_date'), new Date(profile.createdAt?.seconds * 1000).toLocaleDateString())}
                  </View>
                </View>

                {/* Media Gallery Section */}
                <View style={styles.galleryContainer}>
                  <View style={styles.galleryHeaderRow}>
                    <Text style={styles.sectionTitle}>{t('profile.my_gallery')}</Text>
                    <Text style={styles.mediaCount}>{totalMediaCount} {t('profile.media_items')}</Text>
                  </View>

                  {folders.length > 0 ? (
                    <>
                      <View style={styles.foldersWrapper}>
                        {folders.map(folder => (
                          <TouchableOpacity
                            key={folder.id}
                            onPress={() => setSelectedFolderId(folder.id)}
                            style={[
                              styles.folderTab,
                              selectedFolderId === folder.id && styles.activeFolderTab
                            ]}
                          >
                            <IconSymbol
                              name="folder.fill"
                              size={14}
                              color={selectedFolderId === folder.id ? '#fff' : 'rgba(255,255,255,0.4)'}
                            />
                            <Text 
                              style={[
                                styles.folderTabText,
                                selectedFolderId === folder.id && styles.activeFolderTabText
                              ]}
                              numberOfLines={1}
                              ellipsizeMode="tail"
                            >
                              {folder.folderName}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>

                      {mediaItems.length > 0 ? (
                        <View style={styles.mediaGrid}>
                          {mediaItems.map((item, index) => (
                            <TouchableOpacity
                              key={index}
                              style={styles.mediaItem}
                              activeOpacity={0.9}
                              onPress={() => {
                                setFullScreenMediaUrl(item.url);
                                setIsVideoPlaying(true);
                              }}
                            >
                              {item.type === 'video' ? (
                                <Video
                                  source={{ uri: item.url }}
                                  style={styles.mediaImage}
                                  resizeMode={ResizeMode.COVER}
                                  shouldPlay={false}
                                  isMuted={true}
                                  positionMillis={500}
                                />
                              ) : (
                                <ExpoImage
                                  source={item.url}
                                  style={styles.mediaImage}
                                  contentFit="cover"
                                  transition={150}
                                />
                              )}
                              {item.type === 'video' && (
                                <View style={styles.playOverlay}>
                                  <View style={styles.playButtonInner}>
                                    <IconSymbol name="play.fill" size={16} color="#fff" />
                                  </View>
                                </View>
                              )}
                              {item.isPremium && (
                                <View style={styles.premiumBadge}>
                                  <IconSymbol name="lock.fill" size={10} color="#fff" />
                                </View>
                              )}
                            </TouchableOpacity>
                          ))}
                        </View>
                      ) : (
                        <View style={styles.emptyGallery}>
                          <IconSymbol name="photo" size={40} color="rgba(255,255,255,0.1)" />
                          <Text style={styles.emptyText}>{t('profile.empty_folder')}</Text>
                        </View>
                      )}
                    </>
                  ) : (
                    <View style={styles.emptyGallery}>
                      <IconSymbol name="photo.on.rectangle.angled" size={40} color="rgba(255,255,255,0.1)" />
                      <Text style={styles.emptyText}>{t('profile.no_folders')}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.footerSpace} />
              </>
            ) : (
              <View style={styles.errorContainer}>
                <IconSymbol name="exclamationmark.circle.fill" size={48} color="rgba(255,255,255,0.1)" />
                <Text style={styles.errorText}>User not found</Text>
              </View>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.7}>
            <IconSymbol name="xmark" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Full Screen Media Viewer */}
      <Modal visible={!!fullScreenMediaUrl} transparent={false} animationType="fade" statusBarTranslucent>
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity
            style={styles.fullScreenClose}
            onPress={() => setFullScreenMediaUrl(null)}
          >
            <IconSymbol name="xmark" size={24} color="#fff" />
          </TouchableOpacity>
          {currentItem?.type === 'video' ? (
            <CustomVideoPlayer 
              url={currentItem.url} 
              isPlaying={isVideoPlaying} 
              onTogglePlay={() => setIsVideoPlaying(!isVideoPlaying)} 
            />
          ) : (
            <ExpoImage
              source={currentItem?.url}
              style={styles.fullScreenImage}
              contentFit="contain"
              transition={300}
            />
          )}

          {/* Like Button Overlay */}
          <Animated.View style={[
            styles.likeButtonWrapper,
            { transform: [{ scale: likeScale }] }
          ]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => handleLikePhoto(currentItem)}
              style={styles.likeButtonTouchable}
            >
              <BlurView
                intensity={30}
                tint="dark"
                style={styles.likeButtonBlur}
              >
                <IconSymbol 
                  name={isLiked(currentItem) ? "heart.fill" : "heart"} 
                  size={24} 
                  color={isLiked(currentItem) ? "#ff4757" : "#fff"} 
                />
                <Text style={styles.likesCountText}>
                  {(() => {
                    const baseCount = currentItem?.likedBy?.length || 0;
                    const isOriginallyLiked = currentItem?.likedBy?.includes(auth.currentUser?.uid);
                    const isLocallyLiked = likedItems.has(currentItem?.url);
                    
                    if (isLocallyLiked && !isOriginallyLiked) return baseCount + 1;
                    if (!isLocallyLiked && isOriginallyLiked) return Math.max(0, baseCount - 1);
                    return baseCount;
                  })()}
                </Text>
              </BlurView>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>

      <StoryViewer
        visible={viewerVisible}
        stories={viewerStories}
        userName={profile?.name}
        userAvatar={profile?.avatar}
        onClose={() => setViewerVisible(false)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  sheetContainer: {
    height: SCREEN_HEIGHT * 0.88,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    paddingTop: 12,
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  dragHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
    zIndex: 10,
  },
  scrollContent: {
    paddingHorizontal: CONTAINER_PADDING,
    paddingBottom: 40,
  },
  loaderWrapper: {
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 16,
  },
  avatarBorder: {
    width: 136,
    height: 136,
    borderRadius: 68,
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 2,
    borderColor: '#060b16',
  },
  placeholderAvatar: {
    backgroundColor: '#1c263b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontSize: 52,
    fontWeight: '800',
    color: '#fff',
  },
  onlineStatus: {
    position: 'absolute',
    bottom: -4,
    backgroundColor: 'rgba(46, 204, 113, 0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(46, 204, 113, 0.3)',
    alignSelf: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2ecc71',
    marginRight: 6,
    shadowColor: '#2ecc71',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  onlineText: {
    color: '#2ecc71',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  name: {
    fontSize: 26,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(13, 139, 209, 0.08)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  location: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  bioSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  bioCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  bioText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  statsContainer: {
    marginBottom: 24,
    gap: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statTextWrapper: {
    marginLeft: 12,
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 13,
    color: '#fff',
    fontWeight: '700',
  },
  galleryContainer: {
    marginBottom: 20,
  },
  galleryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  mediaCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: '600',
  },
  foldersWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FOLDER_GAP,
    marginBottom: 16,
  },
  folderTab: {
    width: FOLDER_TAB_WIDTH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  activeFolderTab: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  folderTabText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
  },
  activeFolderTabText: {
    color: '#fff',
  },
  mediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ITEM_MARGIN,
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(13, 139, 209, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  premiumBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#f1c40f',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyGallery: {
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 20,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  emptyText: {
    color: 'rgba(255,255,255,0.2)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  footerSpace: {
    height: 80,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 70 : 60,
    right: 12,
    zIndex: 30,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  playPauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  playPauseIconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  videoControlsContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  timeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  progressBarBackground: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary || '#e5566f', 
    borderRadius: 2,
  },
  errorContainer: {
    height: 300,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  errorText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    fontWeight: '600',
  },
  likeButtonWrapper: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 80 : 40,
    right: 24,
    zIndex: 40,
  },
  likeButtonTouchable: {
    borderRadius: 24,
    overflow: 'hidden',
  },
  likeButtonBlur: {
    paddingHorizontal: 14,
    height: 48,
    minWidth: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  likesCountText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  }
});
