import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform, StatusBar, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';

export const Toast = ({ visible, title, message, type = 'success', onHide }) => {
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: Platform.OS === 'ios' ? 50 : StatusBar.currentHeight + 10,
          useNativeDriver: true,
          bounciness: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        })
      ]).start();

      const timer = setTimeout(() => {
        hideToast();
      }, 3000);

      return () => clearTimeout(timer);
    } else {
      hideToast();
    }
  }, [visible]);

  const hideToast = () => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      })
    ]).start(() => {
      if (onHide) onHide();
    });
  };

  if (!visible && opacity._value === 0) return null;

  const getIconName = () => {
    switch (type) {
      case 'success': return 'checkmark.circle.fill';
      case 'error': return 'exclamationmark.circle.fill';
      case 'cancel': return 'xmark.circle.fill';
      case 'info': return 'info.circle.fill';
      default: return 'info.circle.fill';
    }
  };

  const getIconColor = () => {
    switch (type) {
      case 'success': return '#0ef0ff'; // Neon Cyan
      case 'error': return '#ff4757'; // Vibrant Red
      case 'cancel': return '#ff4757';
      case 'info': return '#70a1ff'; // Bright Blue
      default: return '#70a1ff';
    }
  };

  return (
    <Animated.View style={[
      styles.container,
      { 
        transform: [{ translateY }], 
        opacity,
        borderLeftColor: getIconColor()
      }
    ]}>
      <IconSymbol name={getIconName()} size={22} color={getIconColor()} />
      <View style={styles.textContainer}>
        {title && <Text style={styles.title}>{title}</Text>}
        <Text style={styles.message} numberOfLines={3}>{message}</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 16,
    right: 16,
    backgroundColor: '#162033', // Match Colors.dark.card
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    borderLeftWidth: 4, // Accent strip
    zIndex: 9999,
  },
  textContainer: {
    marginLeft: 14,
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 1,
    letterSpacing: 0.2,
  },
  message: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 16,
  },
});
