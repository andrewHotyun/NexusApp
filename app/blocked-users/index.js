import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  Platform
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  getDoc,
  deleteDoc 
} from 'firebase/firestore';

import { auth, db } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { ActionModal } from '../../components/ui/ActionModal';

export default function BlockedUsersScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentUser = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [unblockingId, setUnblockingId] = useState(null);
  const [actionModal, setActionModal] = useState({ 
    visible: false, title: '', message: '', confirmText: 'OK', onConfirm: () => {}, isDestructive: false, showCancel: true 
  });

  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'blocks'),
      where('blockerId', '==', currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const blockDocs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // For each block, fetch the user details
      const detailedUsers = await Promise.all(
        blockDocs.map(async (block) => {
          try {
            const userSnap = await getDoc(doc(db, 'users', block.blockedId));
            if (userSnap.exists()) {
              return {
                uid: block.blockedId,
                ...userSnap.data()
              };
            }
            return { uid: block.blockedId, name: 'Unknown User' };
          } catch (error) {
            console.error("Error fetching blocked user details:", error);
            return { uid: block.blockedId, name: 'Error Loading' };
          }
        })
      );

      setBlockedUsers(detailedUsers);
      setLoading(false);
    }, (error) => {
      console.error("Blocked users listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser?.uid]);

  const handleUnblock = (userId, userName) => {
    setActionModal({
      visible: true,
      title: t('dropdown.unblock'),
      message: t('chat.unblock_confirm', { name: userName }),
      confirmText: t('dropdown.unblock'),
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        setUnblockingId(userId);
        try {
          // Web uses ID format: ${blockerId}_${blockedId}
          await deleteDoc(doc(db, 'blocks', `${currentUser.uid}_${userId}`));
          // Success toast or alert if needed
        } catch (error) {
          console.error("Unblock error:", error);
          setActionModal({
            visible: true,
            title: t('common.error'),
            message: t('chat.unblock_error'),
            showCancel: false
          });
        } finally {
          setUnblockingId(null);
        }
      }
    });
  };

  const renderItem = ({ item }) => (
    <View style={styles.userItem}>
      <View style={styles.userInfo}>
        {item.originalAvatarUrl || item.avatar || item.photoURL ? (
          <Image source={{ uri: item.originalAvatarUrl || item.avatar || item.photoURL }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarInitial}>
              {item.name ? item.name.charAt(0).toUpperCase() : '?'}
            </Text>
          </View>
        )}
        <View style={styles.userDetails}>
          <Text style={styles.userName} numberOfLines={1}>
            {`${item.name || item.displayName || 'User'}${item.age ? `, ${item.age}` : ''}`}
          </Text>
          <Text style={styles.userLocation} numberOfLines={1}>
            {item.city && item.country ? `${item.city}, ${item.country}` : item.country || item.city || ''}
          </Text>
        </View>
      </View>
      
      <TouchableOpacity 
        style={styles.unblockBtn} 
        onPress={() => handleUnblock(item.uid, item.name)}
        disabled={unblockingId === item.uid}>
        {unblockingId === item.uid ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text style={styles.unblockBtnText}>{t('dropdown.unblock')}</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('profile.blocked_users')}</Text>
        <View style={{ width: 44 }} />
      </View>

      <FlatList
        data={blockedUsers}
        keyExtractor={(item) => item.uid}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconSymbol name="person.crop.circle.badge.xmark" size={80} color="rgba(255,255,255,0.05)" />
            <Text style={styles.emptyTitle}>{t('profile.no_blocked')}</Text>
            <Text style={styles.emptySubtitle}>
              {t('profile.blocked_desc')}
            </Text>
          </View>
        }
      />
      <ActionModal
        visible={actionModal.visible}
        title={actionModal.title}
        message={actionModal.message}
        confirmText={actionModal.confirmText}
        cancelText={t('common.cancel')}
        isDestructive={actionModal.isDestructive}
        showCancel={actionModal.showCancel}
        onConfirm={actionModal.onConfirm}
        onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight + 8 : 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  headerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  listContent: {
    padding: 16,
    flexGrow: 1,
  },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  avatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(52, 73, 94, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  avatarInitial: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  userDetails: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  userLocation: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  unblockBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    minHeight: 36,
    minWidth: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unblockBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    marginBottom: 60, // Slight upward bias for better visual balance
  },
  emptyTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: '#7f8c8d',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
