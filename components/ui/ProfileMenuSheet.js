import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform, Image } from 'react-native';
import React, { useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from './icon-symbol';
import EarningsStatsModal from './EarningsStatsModal';

export default function ProfileMenuSheet({ isVisible, onClose, userProfile, onOpenStats, onOpenWithdrawal, onOpenPaymentDetails }) {
  const router = useRouter();
  const { t } = useTranslation();

  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : 'U';
  };

  const getAvatarColor = (uid) => {
    if (!uid) return Colors.dark.primary;
    const colors = ['#0ef0ff', '#ff00ff', '#7000ff', '#38bdf8', '#525252'];
    const index = uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  const handleLogout = async () => {
    try {
      console.log("[Nexus] Tapping Logout...");
      onClose(); // Close modal immediately
      await auth.signOut(); // Trigger firebase logout
      // Root layout's navigation guard will catch the auth state change
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}>
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={onClose}>
        <View style={styles.sheetContainer}>
          <TouchableOpacity activeOpacity={1} style={styles.sheetContent}>
            
            {/* User Info Header in Sheet */}
            <View style={styles.sheetHeader}>
              <View style={[
                  styles.profileAvatar,
                  !userProfile?.avatar && { backgroundColor: getAvatarColor(userProfile?.uid) }
                ]}>
                {userProfile?.originalAvatarUrl || userProfile?.avatar ? (
                  <Image source={{ uri: userProfile.originalAvatarUrl || userProfile.avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarFallback}>{getInitials(userProfile?.name)}</Text>
                )}
              </View>
              <View style={styles.headerTextCol}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{userProfile?.name || t('dropdown.profile', { defaultValue: 'Profile' })}</Text>
                {userProfile?.email && (
                  <Text style={styles.sheetSubtitle} numberOfLines={1}>{userProfile.email}</Text>
                )}
              </View>
            </View>

            {/* Menu Items */}
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { onClose(); router.push('/profile'); }}>
              <IconSymbol name="person.fill" size={24} color={Colors.dark.text} />
              <Text style={styles.menuText}>{t('dropdown.profile', { defaultValue: 'My Profile' })}</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { onClose(); router.push('/media'); }}>
              <IconSymbol name="camera.fill" size={24} color={Colors.dark.text} />
              <Text style={styles.menuText}>{t('dropdown.my_media', { defaultValue: 'My Media' })}</Text>
            </TouchableOpacity>

            {userProfile?.gender === 'woman' && (
              <>
                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={onOpenStats}
                >
                  <IconSymbol name="chart.bar.fill" size={24} color={Colors.dark.text} />
                  <Text style={styles.menuText}>{t('dropdown.earnings_stats', { defaultValue: 'Earnings Stats' })}</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={onOpenWithdrawal}
                >
                  <IconSymbol name="creditcard.fill" size={24} color={Colors.dark.text} />
                  <Text style={styles.menuText}>{t('dropdown.withdraw_earnings', { defaultValue: 'Withdraw Earnings' })}</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={styles.menuItem}
                  onPress={onOpenPaymentDetails}
                >
                  <IconSymbol name="doc.text.fill" size={24} color={Colors.dark.text} />
                  <Text style={styles.menuText}>{t('dropdown.payment_details', { defaultValue: 'Payment Details' })}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { onClose(); router.push('/blocked-users'); }}>
              <IconSymbol name="person.slash.fill" size={24} color={Colors.dark.text} />
              <Text style={styles.menuText}>{t('dropdown.blocked_users', { defaultValue: 'Blocked Users' })}</Text>
            </TouchableOpacity>

            <View style={styles.divider} />

            {/* Logout Button */}
            <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
              <IconSymbol name="rectangle.portrait.and.arrow.right" size={24} color="#ff4444" />
              <Text style={[styles.menuText, { color: '#ff4444' }]}>{t('dropdown.logout', { defaultValue: 'Log Out' })}</Text>
            </TouchableOpacity>
            
            <SafeAreaView edges={['bottom']} style={styles.sheetFooter} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#111827', // Darker gray/blue for the sheet
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 0, // Reset to let SafeArea handle it
    elevation: 0, // Forcefully remove Android elevation highlight
    borderTopWidth: 1, // Add very subtle border for definition
    borderColor: 'rgba(255, 255, 255, 0.05)',
    marginBottom: -100, // Aggressive bleed for Android bottom gaps
    paddingBottom: 100,
    minHeight: 300, // Ensure it doesn't collapse
  },
  sheetFooter: {
    paddingBottom: 15, // Minimal extra breathing room
  },
  sheetContent: {
    width: '100%',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    marginRight: 16,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#0ef0ff',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'left',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 2,
    textAlign: 'left',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  menuText: {
    fontSize: 16,
    color: '#f3f4f6',
    marginLeft: 16,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginVertical: 10,
  },
  logoutItem: {
    marginTop: 5,
  },
});
