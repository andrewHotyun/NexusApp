import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Platform,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/theme';
import GIFTS from '../../constants/gifts';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

/**
 * GiftModal - A premium centered modal for selecting and sending gifts in chat.
 * 
 * @param {boolean} visible - Modal visibility
 * @param {function} onClose - Function to close the modal
 * @param {function} onSendGift - Function to execute gift sending
 * @param {number} userBalance - Current user's minutes balance
 * @param {string} recipientName - Name of the person receiving the gift
 */
export const GiftModal = ({
  visible,
  onClose,
  onSendGift,
  userBalance = 0,
  recipientName = ''
}) => {
  const { t } = useTranslation();
  const [selectedGift, setSelectedGift] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setSelectedGift(null);
      setIsConfirming(false);
      setIsSending(false);
    }
  }, [visible]);

  const handleGiftSelect = (gift) => {
    if (userBalance < gift.minutes) return;
    setSelectedGift(gift);
    setIsConfirming(true);
  };

  const handleConfirmSend = async () => {
    if (!selectedGift || isSending) return;
    
    setIsSending(true);
    try {
      await onSendGift(selectedGift);
      onClose();
    } catch (error) {
      console.error('Error sending gift:', error);
      setIsSending(false);
    }
  };

  const renderGiftGrid = () => (
    <View style={styles.gridContainer}>
      <View style={styles.grid}>
        {GIFTS.map((gift) => {
          const canAfford = userBalance >= gift.minutes;
          return (
            <TouchableOpacity
              key={gift.id}
              style={[styles.giftCard, !canAfford && styles.disabledCard]}
              onPress={() => handleGiftSelect(gift)}
              disabled={!canAfford}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={gift.gradientColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.giftIconContainer}
              >
                <Text style={styles.giftEmoji}>{gift.emoji}</Text>
              </LinearGradient>
              <Text style={styles.giftName} numberOfLines={1}>
                {t(gift.nameKey, gift.id)}
              </Text>
              <View style={styles.costContainer}>
                <Ionicons name="time-outline" size={14} color="rgba(255,255,255,0.6)" />
                <Text style={styles.giftCost}>{gift.minutes} {t('gifts.minutes_unit', 'min')}</Text>
              </View>
              {!canAfford && (
                <View style={styles.lockOverlay}>
                  <Ionicons name="lock-closed" size={16} color="#fff" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderConfirmation = () => (
    <View style={styles.confirmContainer}>
      <LinearGradient
        colors={selectedGift.gradientColors}
        style={styles.confirmPreview}
      >
        <Text style={styles.confirmEmoji}>{selectedGift.emoji}</Text>
      </LinearGradient>
      
      <Text style={styles.confirmTitle}>
        {t(selectedGift.nameKey, selectedGift.id)}
      </Text>
      
      <View style={styles.confirmCostBadge}>
        <Ionicons name="time-outline" size={18} color={Colors.dark.primary} />
        <Text style={styles.confirmCostText}>
          {selectedGift.minutes} {t('gifts.minutes_unit', 'min')}
        </Text>
      </View>

      <Text style={styles.confirmDescription}>
        {t('gifts.confirm_send', {
          name: t(selectedGift.nameKey, selectedGift.id),
          minutes: selectedGift.minutes,
          recipient: recipientName
        })}
      </Text>

      <View style={styles.confirmActions}>
        <TouchableOpacity
          style={[styles.btn, styles.sendBtn]}
          onPress={handleConfirmSend}
          disabled={isSending}
        >
          {isSending ? (
            <ActivityIndicator color="#030e21" />
          ) : (
            <Text style={styles.sendBtnText}>{t('gifts.send_btn', 'Send Gift')}</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[styles.btn, styles.cancelBtn]}
          onPress={() => setIsConfirming(false)}
          disabled={isSending}
        >
          <Text style={styles.cancelBtnText}>{t('common.cancel', 'Cancel')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Background Blur */}
        {Platform.OS === 'ios' ? (
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.85)' }]} />
        )}

        {/* Improved Centered Modal Container */}
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Ionicons name="gift" size={24} color={Colors.dark.primary} style={{ marginTop: -5 }} />
              <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>{t('gifts.title', 'Send a Gift')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView 
            contentContainerStyle={styles.scrollContainer}
            showsVerticalScrollIndicator={false}
          >
            {isConfirming ? renderConfirmation() : renderGiftGrid()}
          </ScrollView>

          <View style={styles.footer}>
            <Text style={styles.balanceText}>
              {t('gifts.your_balance', 'Your balance')}: <Text style={styles.balanceValue}>{userBalance} {t('gifts.minutes_unit', 'min')}</Text>
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    maxWidth: 340,
    maxHeight: SCREEN_HEIGHT * 0.8,
    backgroundColor: '#1c263b',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 15 },
    shadowOpacity: 0.5,
    shadowRadius: 25,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    zIndex: 10,
  },
  headerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginRight: 10,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
    letterSpacing: 0.3,
    includeFontPadding: false,
  },
  closeBtn: {
    padding: 4,
  },
  scrollContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 20,
    textTransform: 'uppercase',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
  },
  giftCard: {
    width: '48%',
    marginBottom: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  disabledCard: {
    opacity: 0.4,
  },
  giftIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  giftEmoji: {
    fontSize: 30,
  },
  giftName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  costContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  giftCost: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 13,
    fontWeight: '700',
  },
  lockOverlay: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(0,0,0,0.4)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  footer: {
    padding: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    alignItems: 'center',
  },
  balanceText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '600',
  },
  balanceValue: {
    color: Colors.dark.primary,
    fontWeight: '900',
  },
  // Confirmation step styles
  confirmContainer: {
    alignItems: 'center',
    paddingTop: 10,
  },
  confirmPreview: {
    width: 140,
    height: 140,
    borderRadius: 70,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  confirmEmoji: {
    fontSize: 70,
  },
  confirmTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#fff',
    marginBottom: 10,
  },
  confirmCostBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13, 139, 209, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  confirmCostText: {
    color: Colors.dark.primary,
    fontSize: 18,
    fontWeight: '800',
  },
  confirmDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 30,
  },
  confirmActions: {
    width: '100%',
    gap: 12,
  },
  btn: {
    width: '100%',
    height: 56,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtn: {
    backgroundColor: Colors.dark.primary,
  },
  sendBtnText: {
    color: '#030e21',
    fontSize: 18,
    fontWeight: '800',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelBtnText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default GiftModal;
