import React, { useEffect, useRef, useMemo, useState } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  useSharedValue, 
  withTiming, 
  Easing,
  interpolate,
  runOnJS
} from 'react-native-reanimated';

const PixelFragment = ({ index, gridSize, bubbleWidth, bubbleHeight, children, progress }) => {
  const row = Math.floor(index / gridSize);
  const col = index % gridSize;
  const fragWidth = bubbleWidth / gridSize;
  const fragHeight = bubbleHeight / gridSize;
  
  const left = col * fragWidth;
  const top = row * fragHeight;

  // Randomized drift parameters
  const driftX = useMemo(() => (Math.random() - 0.5) * 200, []);
  const driftY = useMemo(() => -Math.random() * 200 - 80, []);
  const rotate = useMemo(() => (Math.random() - 0.5) * 180, []);

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    return {
      transform: [
        { translateX: interpolate(p, [0, 1], [0, driftX]) },
        { translateY: interpolate(p, [0, 1], [0, driftY]) },
        { rotate: `${interpolate(p, [0, 1], [0, rotate])}deg` },
        { scale: interpolate(p, [0, 0.7, 1], [1, 0.8, 0]) },
      ],
      opacity: interpolate(p, [0, 0.8, 1], [1, 1, 0]),
    };
  });

  return (
    <Animated.View 
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left,
          top,
          width: fragWidth,
          height: fragHeight,
          overflow: 'hidden',
          zIndex: 100,
        },
        animatedStyle
      ]}
    >
      <View style={{ position: 'absolute', left: -left, top: -top, width: bubbleWidth, height: bubbleHeight }}>
        {children}
      </View>
    </Animated.View>
  );
};

const DisintegrationEffect = ({ children, isDeleting, isBulk = false, duration = 800, onComplete, style }) => {
  const dimensionsRef = useRef({ width: 0, height: 0 });
  const [overlayDimensions, setOverlayDimensions] = useState({ width: 0, height: 0 });
  const progress = useSharedValue(0);
  const [renderOverlay, setRenderOverlay] = useState(false);

  // iOS gets premium 8x8, Android/Bulk gets 5x5 to keep 60fps
  const gridSize = useMemo(() => {
    if (Platform.OS === 'android' || isBulk) return 5;
    return 8;
  }, [isBulk]);

  const totalFragments = useMemo(() => gridSize * gridSize, [gridSize]);

  const onLayout = (event) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      dimensionsRef.current = { width, height };
    }
  };

  useEffect(() => {
    if (isDeleting && dimensionsRef.current.width > 0) {
      setOverlayDimensions({ ...dimensionsRef.current });
      setRenderOverlay(true);
      progress.value = withTiming(1, { 
        duration, 
        easing: Easing.bezier(0.4, 0, 0.2, 1) 
      }, (finished) => {
        if (finished && onComplete) {
          runOnJS(onComplete)();
        }
      });
    } else if (!isDeleting) {
      setRenderOverlay(false);
      progress.value = 0;
    }
  }, [isDeleting]);

  return (
    <View onLayout={onLayout} style={[styles.container, style]}>
      <View style={[styles.targetBox, renderOverlay ? { opacity: 0 } : { opacity: 1 }]}>
        {children}
      </View>

      {renderOverlay && overlayDimensions.width > 0 && (
        <View 
          pointerEvents="none"
          style={[styles.gridContainer, { width: overlayDimensions.width, height: overlayDimensions.height }]}
        >
          {Array.from({ length: totalFragments }).map((_, i) => (
            <PixelFragment
              key={i}
              index={i}
              gridSize={gridSize}
              bubbleWidth={overlayDimensions.width}
              bubbleHeight={overlayDimensions.height}
              progress={progress}
            >
              {children}
            </PixelFragment>
          ))}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'visible',
    flexShrink: 1,
    maxWidth: '100%',
  },
  targetBox: {
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  gridContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 100,
  },
});

export default DisintegrationEffect;
