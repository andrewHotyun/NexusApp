import Ionicons from '@expo/vector-icons/Ionicons';
import { ResizeMode, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated';
import { Colors } from '../../constants/theme';
import CompactAudioPlayer from '../ui/CompactAudioPlayer';
import DisintegrationEffect from './DisintegrationEffect';
import { getGiftById } from '../../constants/gifts';

const MessageItem = ({
  item,
  isMe,
  partner,
  onLongPress,
  onMediaPress,
  onReplyPress,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection,
  isDeleting,
  isBulk = false,
  isHighlighted = false,
  onDeletionComplete
}) => {
  const { t } = useTranslation();
  const timeMs = item.timestamp?.toMillis?.() || (item.timestamp?.seconds ? item.timestamp.seconds * 1000 : 0);
  const time = timeMs > 0
    ? new Date(timeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : '';

  const bubbleRef = useRef(null);
  const selectionAnim = useSharedValue(0);

  useEffect(() => {
    selectionAnim.value = withTiming(isSelectionMode ? 1 : 0, {
      duration: 300,
      easing: Easing.bezier(0.33, 1, 0.68, 1)
    });
  }, [isSelectionMode]);

  const animatedSelectionStyle = useAnimatedStyle(() => {
    return {
      paddingLeft: interpolate(selectionAnim.value, [0, 1], [0, isMe ? 44 : 0]),
    };
  });

  const animatedCheckboxStyle = useAnimatedStyle(() => {
    return {
      opacity: selectionAnim.value,
      transform: [{ scale: interpolate(selectionAnim.value, [0, 1], [0.5, 1]) }],
    };
  });

  const onAnimationComplete = () => {
    if (onDeletionComplete) {
      onDeletionComplete(item.id);
    }
  };

  const handlePress = () => {
    if (isSelectionMode) {
      if (onToggleSelection && isMe && !isSystemMessage) {
        onToggleSelection();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      return;
    }
    if (item.type === 'image' || item.type === 'video') {
      onMediaPress({ uri: item.fileData || item.fileUrl, type: item.type });
    }
  };

  const handleLongPress = () => {
    if (isSelectionMode) return;
    if (isSystemMessage) return;
    if (bubbleRef.current) {
      bubbleRef.current.measureInWindow((x, y, width, height) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress(item, { x, y, width, height });
      });
    }
  };

  const isSystemMessage = ['call', 'video_call', 'gift'].includes(item.type);

  return (
    <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
      {!isSystemMessage && isMe && (
        <Animated.View style={[{ position: 'absolute', left: 8, zIndex: 1000, width: 32, height: 32, justifyContent: 'center', alignItems: 'center' }, animatedCheckboxStyle]}>
          <TouchableOpacity
            style={styles.selectionCircle}
            onPress={onToggleSelection}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isSelected ? "checkmark-circle" : "ellipse-outline"}
              size={24}
              color={isSelected ? Colors.dark.primary : "rgba(255,255,255,0.7)"}
            />
          </TouchableOpacity>
        </Animated.View>
      )}

      <Animated.View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: isMe ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }, animatedSelectionStyle]}>
        <DisintegrationEffect
          isDeleting={isDeleting}
          isBulk={isBulk}
          onComplete={onAnimationComplete}
          duration={isBulk ? 500 : 1200}
          style={[
            styles.messageWrapper,
            isMe ? styles.myMessageWrapper : styles.partnerMessageWrapper,
            { marginBottom: (item.reactions && Object.keys(item.reactions).length > 0) ? 24 : 16 },
            isSelectionMode && { flexShrink: 1, maxWidth: '85%' }
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            {!isMe && partner?.avatar && (
              <Image source={{ uri: partner.avatar }} style={styles.miniAvatar} />
            )}
            <TouchableOpacity
              activeOpacity={0.9}
              onPress={handlePress}
              onLongPress={handleLongPress}
              delayLongPress={300}
            >
              <View
                ref={bubbleRef}
                style={[
                  styles.bubble,
                  isMe ? styles.myBubble : styles.partnerBubble,
                  isHighlighted && styles.neonBorderHighlight,
                  item.replyTo && { minWidth: 100 },
                  (item.type === 'image' || item.type === 'video') && { paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4 },
                  item.type === 'audio' && { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: 'transparent', maxWidth: '85%', minWidth: 260 },
                  item.type === 'gift' && { paddingHorizontal: 0, paddingVertical: 0, backgroundColor: 'transparent', width: 220, overflow: 'hidden' }
                ]}>
                {item.replyTo && (
                  <TouchableOpacity 
                    style={[styles.replyPreview, isMe ? styles.myReplyPreview : styles.partnerReplyPreview]}
                    onPress={() => onReplyPress?.(item.replyTo.messageId)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.replyContent}>
                      <Text style={[styles.replySender, isMe ? styles.myReplySender : styles.partnerReplySender]} numberOfLines={1}>
                        {item.replyTo.senderName}
                      </Text>
                      <Text style={[styles.replyText, isMe ? styles.myReplyText : styles.partnerReplyText]} numberOfLines={1} ellipsizeMode="tail">
                        {item.replyTo.text}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {item.type === 'image' && (item.fileData || item.fileUrl) ? (
                  <View>
                    <Image source={{ uri: item.fileData || item.fileUrl }} style={styles.messageImage} />
                  </View>
                ) : item.type === 'video' && (item.fileData || item.fileUrl) ? (
                  <View>
                    <Video
                      source={{ uri: item.fileData || item.fileUrl }}
                      style={styles.messageVideo}
                      resizeMode={ResizeMode.COVER}
                      useNativeControls
                    />
                    <Text style={[styles.messageText, isMe ? styles.myText : styles.partnerText, { marginTop: 4, marginBottom: 0, fontSize: 13 }]}>
                      {item.text}
                    </Text>
                  </View>
                ) : item.type === 'audio' && (item.fileData || item.fileUrl) ? (
                  <CompactAudioPlayer
                    url={item.fileData || item.fileUrl}
                    fileName={item.fileName || item.text?.replace('🎵 ', '')}
                    isMe={isMe}
                    timestamp={time}
                  />
                ) : item.type === 'gift' ? (
                  <View style={styles.giftBlock}>
                    <View style={styles.giftHeader}>
                      <Text style={styles.giftTitle} numberOfLines={2}>
                        {(() => {
                          const gift = getGiftById(item.giftId);
                          const localizedGift = gift ? t(gift.nameKey) : t('common.unknown');
                          return isMe
                            ? t('gifts.sent_a_gift_you', { gift: localizedGift })
                            : t('gifts.sent_a_gift', {
                                sender: partner?.name || t('common.unknown_user'),
                                gift: localizedGift
                              });
                        })()}
                      </Text>
                    </View>
                    <LinearGradient
                      colors={getGiftById(item.giftId)?.gradientColors || ['#333', '#666']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.giftVisual}
                    >
                      <Text style={styles.giftEmojiLarge}>{getGiftById(item.giftId)?.emoji}</Text>
                      <View style={styles.giftMinutesBadge}>
                        <Text style={styles.giftMinutesText}>+{item.minutes} {t('gifts.minutes_unit')}</Text>
                      </View>
                    </LinearGradient>
                  </View>
                ) : (
                  <Text style={[styles.messageText, isMe ? styles.myText : styles.partnerText]}>
                    {item.text}
                    {item.isEdited && <Text style={styles.editedText}> ({t('common.edited', 'edited')})</Text>}
                  </Text>
                )}

                {item.type !== 'audio' && (
                  <View style={styles.bubbleFooter}>
                    <Text style={styles.timeText}>{time}</Text>
                    {isMe && (
                      <Ionicons
                        name={item.read === true ? "checkmark-done" : "checkmark"}
                        size={16}
                        color={item.read === true ? "#00fbff" : "rgba(255,255,255,0.35)"}
                        style={{ marginLeft: 5 }}
                      />
                    )}
                  </View>
                )}
              </View>

              {/* Reactions list integrated here for lighter rendering */}
              {item.reactions && Object.keys(item.reactions).length > 0 && (
                <View style={[styles.reactionsContainer, isMe ? styles.myReactions : styles.partnerReactions]}>
                   {Object.entries(
                     Object.values(item.reactions).reduce((acc, emoji) => {
                       acc[emoji] = (acc[emoji] || 0) + 1;
                       return acc;
                     }, {})
                   ).map(([emoji, count]) => (
                     <View key={emoji} style={styles.reactionBadge}>
                       <Text style={styles.reactionText}>{emoji}</Text>
                       {count > 1 && <Text style={styles.reactionCount}>{count}</Text>}
                     </View>
                   ))}
                </View>
              )}
            </TouchableOpacity>
          </View>
        </DisintegrationEffect>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  messageWrapper: { flexDirection: 'row', maxWidth: '80%' },
  myMessageWrapper: { alignSelf: 'flex-end', justifyContent: 'flex-end' },
  partnerMessageWrapper: { alignSelf: 'flex-start', justifyContent: 'flex-start' },
  miniAvatar: { width: 24, height: 24, borderRadius: 12, alignSelf: 'flex-end', marginRight: 8 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  myBubble: { backgroundColor: Colors.dark.primary, borderBottomRightRadius: 4 },
  partnerBubble: { backgroundColor: 'rgba(255,255,255,0.1)', borderBottomLeftRadius: 4 },
  neonBorderHighlight: {
    borderWidth: 2,
    borderColor: '#00fbff',
    // No background tint, just the border
  },
  messageText: { fontSize: 16, lineHeight: 22 },
  myText: { color: '#fff' },
  partnerText: { color: '#ecf0f1' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', marginTop: 4 },
  timeText: { fontSize: 10, color: 'rgba(255,255,255,0.5)' },
  messageImage: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },
  messageVideo: { width: 240, height: 180, borderRadius: 12, marginBottom: 4 },
  editedText: { fontSize: 10, opacity: 0.6, fontStyle: 'italic' },
  replyPreview: { flexDirection: 'row', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, marginBottom: 8, borderLeftWidth: 3, overflow: 'hidden' },
  myReplyPreview: { backgroundColor: 'rgba(255, 255, 255, 0.15)', borderLeftColor: '#fff' },
  partnerReplyPreview: { backgroundColor: 'rgba(0, 0, 0, 0.05)', borderLeftColor: Colors.dark.primary },
  replyContent: { marginLeft: 2, flex: 1 },
  replySender: { fontWeight: 'bold', fontSize: 12, marginBottom: 1 },
  myReplySender: { color: '#fff' },
  partnerReplySender: { color: Colors.dark.primary },
  replyText: { fontSize: 12 },
  myReplyText: { color: 'rgba(255, 255, 255, 0.8)' },
  partnerReplyText: { color: 'rgba(255, 255, 255, 0.6)' },
  reactionsContainer: { flexDirection: 'row', flexWrap: 'wrap', position: 'absolute', bottom: -18, zIndex: 10, gap: 4 },
  myReactions: { right: 4 },
  partnerReactions: { left: 4 },
  reactionBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c263b', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  reactionText: { fontSize: 12 },
  reactionCount: { color: '#fff', fontSize: 10, marginLeft: 2, fontWeight: 'bold' },
  selectionCircle: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  giftBlock: { width: 220, borderRadius: 20, overflow: 'hidden', backgroundColor: '#1c263b', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  giftHeader: { padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  giftTitle: { color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  giftVisual: { height: 150, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  giftEmojiLarge: { fontSize: 60, marginTop: -20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
  giftMinutesBadge: { position: 'absolute', bottom: 10, backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  giftMinutesText: { color: '#0ef0ff', fontSize: 12, fontWeight: '800' },
});

const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.text === nextProps.item.text &&
    prevProps.item.read === nextProps.item.read &&
    prevProps.item.isEdited === nextProps.item.isEdited &&
    JSON.stringify(prevProps.item.reactions) === JSON.stringify(nextProps.item.reactions) &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isSelectionMode === nextProps.isSelectionMode &&
    prevProps.isDeleting === nextProps.isDeleting &&
    prevProps.isHighlighted === nextProps.isHighlighted
  );
};

export default React.memo(MessageItem, areEqual);
