import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Image } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { OnlineStatusIndicator } from './OnlineStatusIndicator';
import { Colors } from '../../constants/theme';
import { getAvatarColor } from '../../utils/avatarUtils';

/**
 * StoryAvatar Component
 * 
 * Renders a user avatar with an optional colorful ring if they have active stories.
 * Also includes the online status indicator.
 * 
 * @param {string} userId - ID of the user
 * @param {string} avatarUrl - URL of the user's avatar
 * @param {string} name - Name of the user (for placeholder)
 * @param {number} size - Size of the avatar (default: 50)
 * @param {boolean} hasStories - Whether to show the story ring
 * @param {function} onPress - Callback when the avatar is pressed
 * @param {function} onStoryPress - Callback when the story ring is pressed
 */
export const StoryAvatar = ({ 
  userId, 
  avatarUrl, 
  name, 
  size = 50, 
  hasStories = false, 
  allViewed = false,
  onPress,
  onStoryPress,
  showStatus = true,
  isOnline,
}) => {
  const ringWidth = size > 60 ? 3 : 2;
  const padding = size > 60 ? 4 : 3;
  const innerSize = size - (hasStories ? (ringWidth + padding) * 2 : 0);

  const renderContent = () => (
    <View style={[
      styles.avatarContainer, 
      { width: size, height: size }
    ]}>
      {hasStories ? (
        <LinearGradient
          colors={allViewed ? ['#95a5a6', '#7f8c8d'] : ['#f09433', '#e6683c', '#dc2743', '#cc2366', '#bc1888']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.ring, 
            { width: size, height: size, borderRadius: size / 2, padding: padding }
          ]}
        >
          <View style={[
            styles.innerContainer, 
            { width: size - padding * 2, height: size - padding * 2, borderRadius: (size - padding * 2) / 2 }
          ]}>
            {renderAvatar(size - (padding + ringWidth) * 2)}
          </View>
        </LinearGradient>
      ) : (
        renderAvatar(size)
      )}
      
      {showStatus && (
        <OnlineStatusIndicator 
          userId={userId}
          isOnline={isOnline}
          style={[
            styles.statusDot,
            {
              width: size > 100 ? 18 : 12,
              height: size > 100 ? 18 : 12,
              borderRadius: size > 100 ? 9 : 6,
              bottom: size > 100 ? size * 0.06 : 0,
              right: size > 100 ? size * 0.06 : 0,
              borderWidth: size > 100 ? 2.5 : 2,
              borderColor: '#030e21',
            }
          ]} 
        />
      )}
    </View>
  );

  const renderAvatar = (avatarSize) => {
    if (avatarUrl) {
      return (
        <View style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2, overflow: 'hidden' }}>
          <Image
            source={typeof avatarUrl === 'string' ? { uri: avatarUrl } : avatarUrl}
            style={{ width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }}
          />
        </View>
      );
    }

    // Placeholder
    const initial = (name || '?').charAt(0).toUpperCase();
    const bgColor = getAvatarColor(userId);

    return (
      <View style={[
        styles.placeholder, 
        { 
          width: avatarSize, 
          height: avatarSize, 
          borderRadius: avatarSize / 2, 
          backgroundColor: bgColor
        }
      ]}>
        <Text style={[styles.placeholderText, { fontSize: avatarSize * 0.45 }]}>{initial}</Text>
      </View>
    );
  };

  if (onPress || onStoryPress) {
    return (
      <TouchableOpacity 
        onPress={hasStories && onStoryPress ? onStoryPress : onPress}
        activeOpacity={0.6}
      >
        {renderContent()}
      </TouchableOpacity>
    );
  }

  return renderContent();
};


const styles = StyleSheet.create({
  avatarContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerContainer: {
    backgroundColor: '#030e21', // Dark background for the inner ring gap
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#030e21',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: '#fff',
    fontWeight: '700',
  },
  statusDot: {
    // Override the absolute position if needed, though OnlineStatusIndicator 
    // already has bottom: 0, right: 0
  }
});
