import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View, Text, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withSpring,
  runOnJS,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/theme';
import { Audio } from 'expo-av';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * GiftAnimationOverlay - A premium fullscreen animation for receiving/sending gifts.
 */
export const GiftAnimationOverlay = ({ gift, partnerName, isSender, onComplete }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(true);

  // Animation values
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const translateY = useSharedValue(20);

  useEffect(() => {
    if (!gift) return;

    let soundObject = null;
    const playSound = async () => {
      try {
        const { sound } = await Audio.Sound.createAsync(
          require('../../assets/sounds/gift-sound.mp3')
        );
        soundObject = sound;
        await sound.setVolumeAsync(0.5);
        await sound.playAsync();
      } catch (error) {
        console.error('Error playing gift sound:', error);
      }
    };

    playSound();

    // Start sequence with a small delay for Android stability
    const animDelay = setTimeout(() => {
      opacity.value = withTiming(1, { duration: 400 });
      scale.value = withSpring(1, { damping: 12, stiffness: 90 });
      translateY.value = withSpring(0, { damping: 12, stiffness: 90 });
    }, 100);

    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 500 }, () => {
        runOnJS(handleComplete)();
      });
    }, 2800);

    return () => {
      clearTimeout(timer);
      clearTimeout(animDelay);
      if (soundObject) {
        soundObject.unloadAsync().catch(() => {});
      }
    };
  }, [gift]);

  const handleComplete = () => {
    setVisible(false);
    if (onComplete) onComplete();
  };

  const animatedContentStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { scale: scale.value },
      { translateY: translateY.value }
    ],
  }));

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 9999 }]} pointerEvents="none">
      <View style={styles.modalOverlay}>
        {/* Background Blur */}
        {Platform.OS === 'ios' ? (
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
        )}

        <Animated.View style={[styles.container, animatedContentStyle]}>
          <View style={styles.emojiContainer}>
            <Text style={styles.emoji}>{gift?.emoji}</Text>
          </View>

          <Text style={styles.giftName}>{t(gift?.nameKey || '')}</Text>
          
          <View style={styles.rewardBadge}>
            <Text style={styles.rewardText}>+{gift?.minutes} {t('gifts.minutes_unit')}</Text>
          </View>

          <Text style={styles.subtitle}>
            {isSender
              ? t('gifts.you_sent_to', { name: partnerName })
              : t('gifts.sent_you', { name: partnerName })}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  emojiContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emoji: {
    fontSize: 90,
  },
  giftName: {
    fontSize: 32,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 10,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  rewardBadge: {
    backgroundColor: 'rgba(0, 251, 255, 0.15)',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0, 251, 255, 0.3)',
    marginBottom: 20,
  },
  rewardText: {
    color: '#00fbff',
    fontSize: 20,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 18,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});

export default GiftAnimationOverlay;
