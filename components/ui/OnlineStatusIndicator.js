import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { getUserOnlineStatus } from '../../utils/onlineStatus';

/**
 * Reusable Online Status Indicator (Green Dot)
 * 
 * Accepts `isOnline` prop from parent (preferred, avoids individual listeners).
 * Falls back to subscribing to Firestore only when `isOnline` prop is not provided.
 */
export const OnlineStatusIndicator = ({ userId, isOnline: isOnlineProp, style }) => {
  const [isOnlineLocal, setIsOnlineLocal] = useState(false);

  // Only create a Firestore listener if isOnline prop is NOT provided
  const needsListener = isOnlineProp === undefined || isOnlineProp === null;

  useEffect(() => {
    if (!needsListener || !userId) return;

    const unsubscribe = getUserOnlineStatus(userId, (status) => {
      setIsOnlineLocal(status.isOnline);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId, needsListener]);

  const online = needsListener ? isOnlineLocal : isOnlineProp;

  if (!online) return null;

  return (
    <View style={[styles.dot, style]} />
  );
};

const styles = StyleSheet.create({
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#2ecc71',
    borderWidth: 2,
    borderColor: '#0f172a',
    position: 'absolute',
    bottom: 0,
    right: 0,
    zIndex: 10,
  },
});
