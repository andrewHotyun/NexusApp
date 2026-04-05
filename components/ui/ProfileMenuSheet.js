import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { auth } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { IconSymbol } from './icon-symbol';

export default function ProfileMenuSheet({ isVisible, onClose, userProfile }) {
  const router = useRouter();
  const { t } = useTranslation();

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
              <Text style={styles.sheetTitle}>{userProfile?.name || t('dropdown.profile', { defaultValue: 'Profile' })}</Text>
              {userProfile?.email && (
                <Text style={styles.sheetSubtitle}>{userProfile.email}</Text>
              )}
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
                <TouchableOpacity style={styles.menuItem}>
                  <IconSymbol name="gift.fill" size={24} color={Colors.dark.text} />
                  <Text style={styles.menuText}>{t('dropdown.earnings_stats', { defaultValue: 'Earnings Stats' })}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                  <Text style={styles.menuText}>💳 {t('dropdown.withdraw_earnings', { defaultValue: 'Withdraw Earnings' })}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.menuItem}>
                  <Text style={styles.menuText}>📄 {t('dropdown.payment_details', { defaultValue: 'Payment Details' })}</Text>
                </TouchableOpacity>
              </>
            )}

            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => { onClose(); router.push('/blocked-users'); }}>
              <IconSymbol name="person.text.rectangle.fill" size={24} color={Colors.dark.text} />
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
    borderWidth: 1, // Add very subtle border for definition
    borderColor: 'rgba(255, 255, 255, 0.05)',
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
    marginBottom: 10,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#fff',
  },
  sheetSubtitle: {
    fontSize: 14,
    color: '#9ca3af',
    marginTop: 4,
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
