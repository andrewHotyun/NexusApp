import React, { useState, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { getUserOnlineStatus } from '../../utils/onlineStatus';

/**
 * Reusable Online Status Indicator (Green Dot)
 * Subscribes to a user's real-time online status.
 */
export const OnlineStatusIndicator = ({ userId, style }) => {
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (!userId) return;

    // Use the existing utility to listen to the user's online status
    const unsubscribe = getUserOnlineStatus(userId, (status) => {
      setIsOnline(status.isOnline);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [userId]);

  if (!isOnline) return null;

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
