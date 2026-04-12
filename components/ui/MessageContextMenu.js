import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal, 
  TouchableWithoutFeedback, 
  Dimensions,
  Platform,
  StatusBar
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/theme';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const availableReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

const MessageContextMenu = ({ 
  visible, 
  onClose, 
  onAction, 
  onReaction, 
  position, 
  isMe,
  messageType
}) => {
  const { t } = useTranslation();

  if (!visible) return null;

  const handleAction = (action) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onAction(action);
    onClose();
  };

  const handleReaction = (emoji) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onReaction(emoji);
    onClose();
  };

  // Smarter positioning logic
  const MENU_HEIGHT = 280; // Estimated max height including reactions and padding
  const OFFSET = 8;
  const SAFE_BOTTOM_MARGIN = 40; // Space to keep away from bottom edge/input field
  
  const spaceBelow = SCREEN_HEIGHT - (position.y + position.height);
  const showAbove = spaceBelow < (MENU_HEIGHT + SAFE_BOTTOM_MARGIN);

  const menuStyle = {};
  
  if (showAbove) {
    // Show above the message: position.y (top of bubble) minus menu height minus small offset
    // Ensure we don't go above screen top (10px padding)
    const calculatedTop = position.y - MENU_HEIGHT - 5; // Use 5px offset to "lower" it as requested
    menuStyle.top = Math.max(10, calculatedTop);
  } else {
    // Show below the message
    menuStyle.top = position.y + position.height + OFFSET;
  }

  // Horizontal positioning: align to the bubble's outer edge
  if (isMe) {
    menuStyle.right = Math.max(16, SCREEN_WIDTH - (position.x + position.width));
  } else {
    menuStyle.left = Math.max(16, position.x);
  }

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <View style={[styles.menuContainer, menuStyle]}>
            <View style={styles.reactionRow}>
              {availableReactions.map((emoji) => (
                <TouchableOpacity 
                  key={emoji} 
                  style={styles.reactionBtn}
                  onPress={() => handleReaction(emoji)}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.menuItem} onPress={() => handleAction('reply')}>
              <Ionicons name="chatbubble-outline" size={20} color="#fff" />
              <Text style={styles.menuText}>{t('chat.reply')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuItem} onPress={() => handleAction('copy')}>
              <Ionicons name="copy-outline" size={20} color="#fff" />
              <Text style={styles.menuText}>{t('common.copy')}</Text>
            </TouchableOpacity>

            {isMe && messageType === 'text' && (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleAction('edit')}>
                <Ionicons name="pencil-outline" size={20} color="#fff" />
                <Text style={styles.menuText}>{t('common.edit')}</Text>
              </TouchableOpacity>
            )}

            {isMe && (
              <TouchableOpacity style={styles.menuItem} onPress={() => handleAction('select')}>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={styles.menuText}>{t('common.select', 'Select')}</Text>
              </TouchableOpacity>
            )}

            {isMe && (
              <TouchableOpacity style={[styles.menuItem, styles.deleteItem]} onPress={() => handleAction('delete')}>
                <Ionicons name="trash-outline" size={20} color="#ff4d4d" />
                <Text style={[styles.menuText, styles.deleteText]}>{t('common.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  menuContainer: {
    position: 'absolute',
    backgroundColor: '#1c263b', // Matches theme secondary/dark
    borderRadius: 14,
    width: 200,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 15,
    elevation: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  reactionRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reactionBtn: {
    padding: 2,
    transition: 'transform 0.1s',
  },
  reactionEmoji: {
    fontSize: 22,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: 4,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '500',
  },
  deleteText: {
    color: '#ff4d4d',
  },
  deleteItem: {
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  }
});

export default MessageContextMenu;
