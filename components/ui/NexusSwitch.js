import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withSpring, 
  interpolateColor,
  withTiming 
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '../../constants/theme';

const NexusSwitch = ({ value, onValueChange, activeColor = Colors.dark.primary, inactiveColor = '#34495e' }) => {
  const translateX = useSharedValue(value ? 21 : 0);
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    translateX.value = withSpring(value ? 21 : 0, {
      mass: 1,
      damping: 15,
      stiffness: 150,
      overshootClamping: true
    });
    progress.value = withTiming(value ? 1 : 0, { duration: 250 });
  }, [value]);

  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onValueChange(!value);
  };

  const animatedTrackStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [inactiveColor, activeColor + '40'] // Light version of primary when active
    );
    const borderColor = interpolateColor(
      progress.value,
      [0, 1],
      ['rgba(255,255,255,0.1)', activeColor + '80']
    );

    return {
      backgroundColor,
      borderColor,
    };
  });

  const animatedThumbStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      ['#95a5a6', activeColor]
    );

    return {
      transform: [{ translateX: translateX.value }],
      backgroundColor,
      shadowColor: activeColor,
      shadowOpacity: progress.value * 0.5,
      shadowRadius: progress.value * 6,
      elevation: progress.value * 4,
    };
  });

  return (
    <Pressable onPress={handleToggle} style={styles.container}>
      <Animated.View style={[styles.track, animatedTrackStyle]}>
        <Animated.View style={[styles.thumb, animatedThumbStyle]} />
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    width: 50,
    height: 28,
    justifyContent: 'center',
  },
  track: {
    width: 48,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    justifyContent: 'center',
    padding: 2,
  },
  thumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    // iOS Shadow for Glow
    shadowOffset: { width: 0, height: 0 },
  },
});

export default NexusSwitch;
