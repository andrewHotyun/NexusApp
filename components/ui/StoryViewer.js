import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Modal,
  Dimensions,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  PanResponder,
  Animated as RNAnimated,
  Platform,
  StatusBar,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from './icon-symbol';
import { db, auth } from '../../utils/firebase';
import {
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc,
  onSnapshot,
  addDoc,
  collection,
  serverTimestamp,
} from 'firebase/firestore';
import earningsManager from '../../utils/earningsManager';

const { width, height } = Dimensions.get('window');

export const StoryViewer = ({
  visible,
  stories = [],
  initialIndex = 0,
  userName,
  userAvatar,
  onClose,
}) => {
  const { t } = useTranslation();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isLoading, setIsLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [liveStoryData, setLiveStoryData] = useState(null);
  const [isLiked, setIsLiked] = useState(false);
  const [loadError, setLoadError] = useState(null);
  
  const videoRef = useRef(null);
  const currentUser = auth.currentUser;
  const currentStory = stories[currentIndex];

  // Animation for dismissing (swipe down)
  const translateY = useRef(new RNAnimated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      setProgress(0);
      setIsLoading(true);
      setIsPaused(false);
      setLoadError(null);
      translateY.setValue(0);
    }
  }, [visible, initialIndex]);

  // Handle problematic WebM format on iOS immediately
  useEffect(() => {
    if (visible && currentStory?.videoUrl && Platform.OS === 'ios') {
      if (currentStory.videoUrl.toLowerCase().includes('.webm')) {
        setLoadError(t('stories.format_not_supported', 'WebM format is not supported on iPhone'));
        setIsLoading(false);
      }
    }
  }, [visible, currentIndex, currentStory?.videoUrl]);

  // Safety timeout for loading
  useEffect(() => {
    let timer;
    if (isLoading && !loadError && visible) {
      timer = setTimeout(() => {
        if (isLoading) {
          setLoadError(t('stories.loading_timeout', 'Taking too long to load...'));
          setIsLoading(false);
        }
      }, 5000); // 5 seconds safety timeout
    }
    return () => clearTimeout(timer);
  }, [isLoading, loadError, visible, currentIndex]);

  // Real-time listener for current story interaction (likes/views)
  useEffect(() => {
    if (!visible || !currentStory?.id) return;

    const unsub = onSnapshot(doc(db, 'stories', currentStory.id), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLiveStoryData({ id: snap.id, ...data });
        setIsLiked(data.likedBy?.includes(currentUser?.uid));
      }
    }, (err) => console.warn('StoryViewer detail listener error:', err));

    // Mark as viewed
    const markViewed = async () => {
      if (!currentUser || currentStory.userId === currentUser.uid) return;
      if (currentStory.viewedBy?.includes(currentUser.uid)) return;

      try {
        await updateDoc(doc(db, 'stories', currentStory.id), {
          viewedBy: arrayUnion(currentUser.uid)
        });
      } catch (e) {}
    };
    markViewed();

    return () => unsub();
  }, [visible, currentStory?.id]);

  const handlePlaybackStatusUpdate = (status) => {
    if (status.isLoaded) {
      setIsLoading(false);
      setLoadError(null);
      if (status.durationMillis) {
        const p = (status.positionMillis / status.durationMillis) * 100;
        setProgress(p);
      }
      if (status.didJustFinish) {
        handleNext();
      }
    } else if (status.error) {
      setLoadError(status.error);
      setIsLoading(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setProgress(0);
      setIsLoading(true);
    } else {
      onClose();
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setProgress(0);
      setIsLoading(true);
    } else {
      videoRef.current?.setPositionAsync(0);
      setProgress(0);
    }
  };

  const handleLike = async () => {
    if (!currentUser || !currentStory?.id) return;

    const alreadyLiked = isLiked;
    const storyDocRef = doc(db, 'stories', currentStory.id);

    try {
      if (alreadyLiked) {
        await updateDoc(storyDocRef, { likedBy: arrayRemove(currentUser.uid) });
      } else {
        await updateDoc(storyDocRef, { likedBy: arrayUnion(currentUser.uid) });
        
        // Earnings
        if (currentStory.userId !== currentUser.uid) {
          await earningsManager.addLikeEarnings(currentStory.userId, currentUser.uid, 'story', currentStory.id);
          
          // Notifications for women
          const targetUserDoc = await getDoc(doc(db, 'users', currentStory.userId));
          if (targetUserDoc.exists()) {
            const targetUser = targetUserDoc.data();
            const g = (targetUser.gender || targetUser.sex || '').toLowerCase();
            if (['woman', 'female', 'жінка'].includes(g)) {
              await addDoc(collection(db, 'likes'), {
                senderId: currentUser.uid,
                targetUserId: currentStory.userId,
                contentUrl: currentStory.videoUrl || '',
                contentType: 'story',
                createdAt: serverTimestamp(),
                read: false
              });
            }
          }
        }
      }
    } catch (e) {}
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 10,
      onPanResponderMove: (_, gesture) => {
        if (gesture.dy > 0) {
          translateY.setValue(gesture.dy);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 100) {
          onClose();
        } else {
          RNAnimated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  if (!visible || !currentStory) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <RNAnimated.View 
        style={[styles.container, { transform: [{ translateY }] }]}
        {...panResponder.panHandlers}
      >
        <StatusBar hidden />
        
        {/* Main Video */}
        <Video
          ref={videoRef}
          key={currentStory?.id || 'no-story'}
          source={currentStory?.videoUrl ? { uri: currentStory.videoUrl } : null}
          style={styles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay={visible && !isPaused && !loadError}
          isMuted={false}
          onPlaybackStatusUpdate={handlePlaybackStatusUpdate}
          onLoadStart={() => {
            setIsLoading(true);
            setLoadError(null);
          }}
          onLoad={() => {
            setIsLoading(false);
            setLoadError(null);
          }}
          onError={(error) => {
            console.log("Story Video Error:", error);
            setIsLoading(false);
            setLoadError(error);
          }}
        />

        {/* Tap areas for navigation */}
        <View style={styles.navigationContainer}>
          <TouchableOpacity 
            style={styles.navSection} 
            onPress={handlePrev} 
            activeOpacity={1} 
          />
          <TouchableOpacity 
            style={styles.navSection} 
            onPress={() => setIsPaused(!isPaused)} 
            activeOpacity={1} 
          />
          <TouchableOpacity 
            style={styles.navSection} 
            onPress={handleNext} 
            activeOpacity={1} 
          />
        </View>

        {/* Overlays */}
        <LinearGradient
          colors={['rgba(0,0,0,0.6)', 'transparent']}
          style={styles.topGradient}
        >
          {/* Progress Bars */}
          <View style={styles.progressRow}>
            {stories.map((_, i) => (
              <View key={i} style={styles.progressBarBg}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { width: i === currentIndex ? `${progress}%` : i < currentIndex ? '100%' : '0%' }
                  ]} 
                />
              </View>
            ))}
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.userInfo}>
              <View style={styles.avatarMini}>
                {userAvatar ? (
                  <ExpoImage source={userAvatar} style={styles.avatarImg} />
                ) : (
                  <View style={styles.placeholder}><Text style={styles.placeholderText}>{userName?.charAt(0)}</Text></View>
                )}
              </View>
              <Text style={styles.userNameText}>{userName}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconSymbol name="xmark" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.6)']}
          style={styles.bottomGradient}
        >
          <View style={styles.footer}>
            <View style={{ flex: 1 }} />
            
            <TouchableOpacity onPress={handleLike} activeOpacity={0.7} style={styles.likeBtn}>
              <IconSymbol 
                name={isLiked ? "heart.fill" : "heart"} 
                size={26} 
                color={isLiked ? "#ff4d4d" : "#fff"} 
              />
              <Text style={styles.likeCount}>
                {liveStoryData?.likedBy?.length || currentStory.likedBy?.length || 0}
              </Text>
            </TouchableOpacity>
            
            {/* Owner stats if applicable */}
            {currentStory.userId === currentUser?.uid && liveStoryData && (
              <View style={styles.ownerStats}>
                <View style={styles.statItem}>
                  <IconSymbol name="eye" size={16} color="#fff" />
                  <Text style={styles.statText}>{liveStoryData.viewedBy?.length || 0}</Text>
                </View>
              </View>
            )}
          </View>
        </LinearGradient>

        {isLoading && !loadError && (
          <View style={styles.loaderContainer}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
        )}

        {loadError && (
          <View style={styles.loaderContainer}>
            <IconSymbol name="exclamationmark.triangle.fill" size={50} color="#e74c3c" />
            <Text style={styles.errorText}>
              {t('stories.format_not_supported', 'Format not supported on iOS')}
            </Text>
            <TouchableOpacity style={styles.skipBtn} onPress={handleNext}>
              <Text style={styles.skipText}>
                {currentIndex < stories.length - 1 ? t('common.next', 'Next') : t('common.close', 'Close')}
              </Text>
              <IconSymbol 
                name={currentIndex < stories.length - 1 ? "chevron.right" : "xmark"} 
                size={16} 
                color="#fff" 
              />
            </TouchableOpacity>
          </View>
        )}
      </RNAnimated.View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    width: width,
    height: height,
  },
  navigationContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  navSection: {
    flex: 1,
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    width: '100%',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    paddingBottom: Platform.OS === 'ios' ? 50 : 30,
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  progressRow: {
    flexDirection: 'row',
    height: 3,
    gap: 4,
    marginBottom: 16,
  },
  progressBarBg: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarMini: {
    width: 32,
    height: 32,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#3498db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  userNameText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  likeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  likeCount: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  ownerStats: {
    flexDirection: 'row',
    gap: 15,
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  loaderContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  skipBtn: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  skipText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});
