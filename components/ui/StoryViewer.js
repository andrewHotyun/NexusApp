import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { BlurView } from 'expo-blur';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/theme';
import { getAvatarColor } from '../../utils/avatarUtils';
import { auth, db } from '../../utils/firebase';
import { storyManager } from '../../utils/storyManager';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const StoryViewer = ({ visible, onClose, stories, initialIndex = 0, userName, userAvatar, viewerGender }) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLiked, setIsLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [statsModalVisible, setStatsModalVisible] = useState(false);
  const [interactionType, setInteractionType] = useState('likes'); // 'likes' or 'views'
  const [interactionUsers, setInteractionUsers] = useState([]);
  const [isFetchingStats, setIsFetchingStats] = useState(false);
  const progressTimer = useRef(null);
  const videoRef = useRef(null);
  const currentUserId = auth.currentUser?.uid;

  const currentStory = stories[currentIndex];
  const isOwnStory = currentStory?.userId === currentUserId;

  useEffect(() => {
    if (visible && stories.length > 0) {
      setCurrentIndex(initialIndex);
      setIsLiked(stories[initialIndex].likedBy?.includes(currentUserId));
      setLikeCount(stories[initialIndex].likedBy?.length || 0);

      // Mark as viewed
      if (currentUserId) {
        storyManager.markAsViewed(stories[initialIndex].id, currentUserId);
      }
    }
  }, [visible, initialIndex]);

  useEffect(() => {
    if (visible && currentStory) {
      setIsLiked(currentStory.likedBy?.includes(currentUserId));
      setLikeCount(currentStory.likedBy?.length || 0);

      // Reset progress and modal
      setProgress(0);
      setIsLoading(true);
      setStatsModalVisible(false);
      setInteractionUsers([]);
    }
  }, [currentIndex, visible]);

  useEffect(() => {
    if (visible && !isPaused && !isLoading) {
      startProgress();
    } else {
      stopProgress();
    }
    return () => stopProgress();
  }, [visible, isPaused, isLoading, currentIndex]);

  const startProgress = () => {
    stopProgress();
    progressTimer.current = setInterval(() => {
      setProgress(prev => {
        if (prev >= 1) {
          handleNext();
          return 1;
        }
        return prev + 0.01; // Approx 5 seconds total if we update every 50ms. 
        // Real logic should use video duration, but we'll use a fixed step for now or update on video status
      });
    }, 50); // 50ms * 100 steps = 5 seconds. We'll adjust based on video status later.
  };

  const stopProgress = () => {
    if (progressTimer.current) {
      clearInterval(progressTimer.current);
    }
  };

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      if (currentUserId) {
        storyManager.markAsViewed(stories[currentIndex + 1].id, currentUserId);
      }
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    } else {
      // Replay current
      if (videoRef.current) videoRef.current.replayAsync();
      setProgress(0);
    }
  };

  const fetchInteractionDetails = async (type) => {
    const uids = type === 'likes' ? currentStory.likedBy : currentStory.viewedBy;
    if (!uids || uids.length === 0) return;

    setIsPaused(true);
    setInteractionType(type);
    setStatsModalVisible(true);
    setIsFetchingStats(true);
    setInteractionUsers([]);

    try {
      const details = [];
      // Fetch details in batches or series - here we do one by one for simplicity matching browser
      for (const uid of uids) {
        if (!uid) continue;
        const userDoc = await getDoc(doc(db, 'users', uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          details.push({
            uid,
            displayName: userData.name || 'User',
            avatar: userData.avatar || null
          });
        }
      }
      setInteractionUsers(details);
    } catch (error) {
      console.error(`Error fetching story ${type}:`, error);
    } finally {
      setIsFetchingStats(false);
    }
  };

  const toggleLike = async () => {
    if (!currentStory || !currentUserId) return;

    if (!isLiked) {
      setIsLiked(true);
      setLikeCount(prev => prev + 1);
      await storyManager.likeStory(currentStory.id, currentUserId);
    } else {
      setIsLiked(false);
      setLikeCount(prev => Math.max(0, prev - 1));
      await storyManager.unlikeStory(currentStory.id, currentUserId);
    }
  };

  const onPlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      if (status.isPlaying) {
        // Sync progress with video time
        const currentProgress = status.positionMillis / status.durationMillis;
        setProgress(currentProgress);
        if (isLoading) setIsLoading(false);
      }
      if (status.didJustFinish) {
        handleNext();
      }
    }
  };

  const getTimeRemaining = (expiresAt) => {
    if (!expiresAt) return '';
    const expiry = new Date(expiresAt);
    const now = new Date();
    const diff = expiry - now;
    if (diff <= 0) return t('profile.expired_status', 'Expired');

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}${t('common.h', 'h')} ${minutes}${t('common.m', 'm')} ${t('profile.left_status', 'left')}`;
  };

  if (!visible || !currentStory) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      presentationStyle="fullScreen"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Background Blur for non-perfect ratios */}
        <BlurView intensity={20} style={StyleSheet.absoluteFill} />

        {/* Video Player */}
        <Pressable
          style={styles.videoContainer}
          onPressIn={() => setIsPaused(true)}
          onPressOut={() => setIsPaused(false)}
          onPress={(e) => {
            const { locationX } = e.nativeEvent;
            if (locationX < SCREEN_WIDTH / 3) handlePrev();
            else if (locationX > (SCREEN_WIDTH / 3) * 2) handleNext();
            else setIsPaused(!isPaused);
          }}
        >
          <Video
            ref={videoRef}
            style={styles.video}
            source={{ uri: currentStory.videoUrl }}
            resizeMode={ResizeMode.COVER}
            shouldPlay={!isPaused && !isLoading}
            onPlaybackStatusUpdate={onPlaybackStatusUpdate}
            onLoadStart={() => setIsLoading(true)}
            onLoad={() => setIsLoading(false)}
            isMuted={false}
          />

          {isLoading && (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
            </View>
          )}
        </Pressable>

        {/* HUD Layer */}
        <View style={[styles.hudOverlay, { paddingTop: Math.max(insets.top, 10) }]} pointerEvents="box-none">
          {/* Progress Bars */}
          <View style={styles.progressRow}>
            {stories.map((_, index) => (
              <View key={index} style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: index === currentIndex ? `${progress * 100}%` : index < currentIndex ? '100%' : '0%'
                    }
                  ]}
                />
              </View>
            ))}
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                {userAvatar ? (
                  <Image
                    source={{ uri: userAvatar }}
                    style={styles.avatar}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: getAvatarColor(userName) }]}>
                    <Text style={styles.avatarLabel}>{userName?.charAt(0)}</Text>
                  </View>
                )}
              </View>
              <View>
                <Text style={styles.userName}>{userName}</Text>
                {isOwnStory && currentStory?.status === 'approved' && (
                  <Text style={styles.timeInfo}>{getTimeRemaining(currentStory.expiresAt)}</Text>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={30} color="#fff" />
            </TouchableOpacity>
          </View>

          {/* Bottom Actions - Hidden when under moderation */}
          {currentStory?.status !== 'pending' && (
            <View style={styles.footer}>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {isOwnStory ? (
                  <>
                    <TouchableOpacity
                      style={styles.statsBadge}
                      onPress={() => fetchInteractionDetails('views')}
                    >
                      <Ionicons name="eye-outline" size={22} color="#fff" />
                      <Text style={styles.statText}>{currentStory.viewedBy?.length || 0}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.statsBadge}
                      onPress={() => fetchInteractionDetails('likes')}
                    >
                      <Ionicons name="heart" size={22} color="#fff" />
                      <Text style={styles.statText}>{likeCount}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <View />
                )}
              </View>

              <TouchableOpacity
                style={[styles.likeButton, isLiked && styles.likedActive]}
                onPress={toggleLike}
              >
                <Ionicons
                  name={isLiked ? "heart" : "heart-outline"}
                  size={22}
                  color={isLiked ? "#FF2D55" : "#fff"}
                />
                <Text style={styles.likeText}>{likeCount}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Interaction Stats Modal */}
        <Modal
          visible={statsModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setStatsModalVisible(false)}
        >
          <BlurView intensity={40} tint="dark" style={styles.modalOverlay}>
            <Pressable
              style={styles.modalCloseArea}
              onPress={() => {
                setStatsModalVisible(false);
                setIsPaused(false);
              }}
            />
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {interactionType === 'likes' ? (t('stories.liked_by') || 'Liked by') : (t('stories.watched_by') || 'Watched by')}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setStatsModalVisible(false);
                    setIsPaused(false);
                  }}
                  style={styles.modalCloseBtn}
                >
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              {isFetchingStats ? (
                <View style={styles.modalLoading}>
                  <ActivityIndicator color={Colors.dark.primary} />
                </View>
              ) : (
                <ScrollView style={[styles.likersList, { maxHeight: SCREEN_HEIGHT * 0.5 }]}>
                  {interactionUsers.length > 0 ? (
                    interactionUsers.map((user) => (
                      <View key={user.uid} style={styles.likerItem}>
                        <View style={[styles.likerAvatar, { backgroundColor: getAvatarColor(user.displayName) }]}>
                          {user.avatar ? (
                            <Image source={{ uri: user.avatar }} style={styles.avatarImg} />
                          ) : (
                            <Text style={styles.avatarInt}>{user.displayName.charAt(0)}</Text>
                          )}
                        </View>
                        <Text style={styles.likerName}>{user.displayName}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.emptyText}>{t('common.no_data') || 'No interactions yet'}</Text>
                  )}
                </ScrollView>
              )}
            </View>
          </BlurView>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    flex: 1,
  },
  video: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  hudOverlay: {
    ...StyleSheet.absoluteFillObject,
    paddingTop: 10,
  },
  progressRow: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    marginTop: 10,
    gap: 4,
  },
  progressBarBackground: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLabel: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  timeInfo: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
  },
  closeButton: {
    padding: 8,
  },
  footer: {
    position: 'absolute',
    bottom: 50,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    gap: 8,
  },
  statText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    gap: 8,
  },
  likedActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  likeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalCloseArea: {
    ...StyleSheet.absoluteFillObject,
  },
  modalContent: {
    backgroundColor: '#1E293B',
    width: '85%',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalLoading: {
    paddingVertical: 30,
    alignItems: 'center',
  },
  likersList: {
    // ScrollView or map? Using map inside View for simplicity if count is low
  },
  likerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  likerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarInt: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  likerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyText: {
    color: '#94a3b8',
    textAlign: 'center',
    paddingVertical: 20,
  }
});

export default StoryViewer;
