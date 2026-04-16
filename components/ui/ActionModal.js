import { BlurView } from 'expo-blur';
import React from 'react';
import {
  Dimensions,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { Colors } from '../../constants/theme';

const { width } = Dimensions.get('window');

/**
 * ActionModal - A custom alternative to native Alert.alert
 * Supports centered title, message, and customizable pill-shaped buttons.
 */
export const ActionModal = ({
  visible,
  title,
  message,
  onClose,
  onConfirm,
  confirmText = 'OK',
  cancelText = 'Cancel',
  isDestructive = false,
  showCancel = true
}) => {
  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      {/* Darkened Semi-transparent Background instead of Blur for Max Stability */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0, 0, 0, 0.75)' }]} />

      <View style={styles.modalContainer}>
        <View style={styles.content}>
          {title && <Text style={styles.title}>{title}</Text>}
          {message && <Text style={styles.message}>{message}</Text>}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.btn,
              isDestructive ? styles.destructiveBtn : styles.confirmBtn
            ]}
            onPress={() => {
              if (onConfirm) onConfirm();
              onClose();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.confirmBtnText}>{confirmText}</Text>
          </TouchableOpacity>

          {showCancel && (
            <TouchableOpacity
              style={[styles.btn, styles.cancelBtn]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>{cancelText}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: 'transparent',
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#1e293b', // Deep slate for premium dark feel
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
    overflow: 'hidden',
  },
  content: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    padding: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  btn: {
    flex: 1,
    height: 54,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtn: {
    backgroundColor: Colors.dark.primary, // #0ef0ff
  },
  destructiveBtn: {
    backgroundColor: '#e5566f', // Premium red
  },
  cancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  confirmBtnText: {
    color: '#030e21', // Dark contrast for primary
    fontSize: 16,
    fontWeight: 'bold',
    flexShrink: 1,
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '600',
  },
});
