import React, { useEffect, useRef } from 'react';
import { Animated, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';

export const Toast = ({ visible, message, type = 'success', onHide }) => {
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
      case 'success': return '#2ecc71';
      case 'error': return '#e74c3c';
      case 'cancel': return '#e74c3c';
      case 'info': return '#3498db';
      default: return '#3498db';
    }
  };

  return (
    <Animated.View style={[
      styles.container,
      { transform: [{ translateY }], opacity }
    ]}>
      <IconSymbol name={getIconName()} size={24} color={getIconColor()} />
      <Text style={styles.message} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(44, 62, 80, 0.95)',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    zIndex: 9999,
  },
  message: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
    marginLeft: 12,
    flex: 1,
  },
});
