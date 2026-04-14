import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { 
  doc, 
  onSnapshot, 
  updateDoc, 
  serverTimestamp, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytes, 
  getDownloadURL 
} from 'firebase/storage';
import { updateEmail, signOut } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { Country, City, State } from 'country-state-city';
import { deduplicateCities } from '../../utils/locationUtils';

import { auth, db, storage } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { SearchablePicker } from '../../components/ui/SearchablePicker';
import { ActionModal } from '../../components/ui/ActionModal';
import { MinutesPurchaseModal } from '../../components/ui/MinutesPurchaseModal';

export default function ProfileScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [actionModal, setActionModal] = useState({ 
    visible: false, title: '', message: '', confirmText: 'OK', onConfirm: () => {}, isDestructive: false, showCancel: true 
  });
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  // Edit form state
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    country: '',
    countryIso: '',
    city: '',
    gender: 'man',
    age: '',
    chatType: 'normal'
  });

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  // Memoized location data
  const allCountries = useMemo(() => {
    return Country.getAllCountries().map(c => ({
      label: `${c.flag} ${c.name}`,
      value: c.name,
      isoCode: c.isoCode
    }));
  }, []);

  const allCities = useMemo(() => {
    if (!editForm.countryIso) return [];
    const cities = City.getCitiesOfCountry(editForm.countryIso);
    return deduplicateCities(cities).map(c => ({
      label: c.name,
      value: c.name
    }));
  }, [editForm.countryIso]);

  // Real-time profile listener
  useEffect(() => {
    if (!user) {
      router.replace('/auth/login');
      return;
    }

    const unsubscribe = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setProfile(data);
        
        // Update edit form when profile loads
        if (!isEditing) {
          const matchedCountry = Country.getAllCountries().find(c => c.name === data.country);
          setEditForm({
            name: data.name || '',
            email: data.email || user.email || '',
            country: data.country || '',
            countryIso: matchedCountry?.isoCode || '',
            city: data.city || '',
            gender: data.gender || 'man',
            age: data.age?.toString() || '',
            chatType: data.chatType || 'normal'
          });
        }
      }
      setLoading(false);
    }, (error) => {
      console.error("Profile listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, isEditing]);

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setActionModal({
        visible: true,
        title: t('common.error'),
        message: t('auth.permissionDenied'),
        confirmText: t('common.ok'),
        showCancel: false
      });
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled) {
      uploadAvatar(result.assets[0]);
    }
  };

  const uploadAvatar = async (asset) => {
    setUploadingAvatar(true);
    try {
      // 1. Upload original (high quality) to Storage
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const avatarRef = ref(storage, `avatars/${user.uid}/original.jpg`);
      await uploadBytes(avatarRef, blob);
      const downloadURL = await getDownloadURL(avatarRef);

      // 2. Create a small compressed thumbnail for Firestore base64
      //    Resize to 200x200 and compress — keeps it well under the 1MB Firestore limit
      const thumbnail = await ImageManipulator.manipulateAsync(
        asset.uri,
        [{ resize: { width: 300 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const compressedBase64 = thumbnail.base64
        ? `data:image/jpeg;base64,${thumbnail.base64}`
        : '';

      await updateDoc(doc(db, 'users', user.uid), {
        avatar: compressedBase64,
        originalAvatarUrl: downloadURL,
        updatedAt: serverTimestamp()
      });

      // Update local state immediately for better UX
      setProfile(prev => ({
        ...prev,
        avatar: compressedBase64,
        originalAvatarUrl: downloadURL
      }));

      setActionModal({
        visible: true,
        title: t('common.success'),
        message: t('profile.successAvatar'),
        confirmText: t('common.ok'),
        showCancel: false
      });
    } catch (error) {
      console.error("Avatar upload error:", error);
      setActionModal({
        visible: true,
        title: t('common.error'),
        message: t('profile.errorAvatar'),
        confirmText: t('common.ok'),
        showCancel: false
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!editForm.name.trim()) {
      setActionModal({
        visible: true,
        title: t('common.error'),
        message: t('auth.errorNameLong'),
        confirmText: t('common.ok'),
        showCancel: false
      });
      return;
    }

    setSaving(true);
    try {
      const updates = {
        name: editForm.name.trim(),
        gender: editForm.gender,
        age: parseInt(editForm.age) || 18,
        country: editForm.country,
        city: editForm.city,
        chatType: editForm.chatType,
        updatedAt: serverTimestamp()
      };

      // Email update logic (requires recent login usually)
      if (editForm.email !== profile.email) {
        try {
          await updateEmail(user, editForm.email.trim());
          updates.email = editForm.email.trim();
        } catch (emailErr) {
          console.warn("Email update failed (likely re-auth needed):", emailErr);
          setActionModal({
            visible: true,
            title: t('common.attention'),
            message: t('profile.errors.email_reauth'),
            confirmText: t('common.ok'),
            showCancel: false
          });
        }
      }

      await updateDoc(doc(db, 'users', user.uid), updates);
      setIsEditing(false);
      setActionModal({
        visible: true,
        title: t('common.success'),
        message: t('profile.successUpdate'),
        confirmText: t('common.ok'),
        showCancel: false
      });
    } catch (error) {
      console.error("Profile save error:", error);
      setActionModal({
        visible: true,
        title: t('common.error'),
        message: t('profile.errors.update_failed'),
        confirmText: t('common.ok'),
        showCancel: false
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    setActionModal({
      visible: true,
      title: t('auth.logoutTitle'),
      message: t('auth.logoutConfirm'),
      confirmText: t('auth.logout'),
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        await signOut(auth);
        router.replace('/auth/login');
      }
    });
  };

  const handleDeleteAccount = () => {
    setActionModal({
      visible: true,
      title: t('profile.delete_account_title'),
      message: t('profile.delete_account_confirm'),
      confirmText: t('common.delete'),
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        const deletionDate = new Date();
        deletionDate.setMonth(deletionDate.getMonth() + 6);
        
        await updateDoc(doc(db, 'users', user.uid), {
          deletionInfo: {
            status: 'pending_deletion',
            scheduledDeletionAt: deletionDate,
            initiatedAt: new Date(),
          }
        });
        
        await signOut(auth);
        router.replace('/auth/login');
      }
    });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isEditing ? t('profile.edit_profile') : t('profile.title')}</Text>
          <TouchableOpacity 
            onPress={() => isEditing ? handleSaveProfile() : setIsEditing(true)} 
            style={styles.headerBtn}
            disabled={saving}>
            {saving ? (
              <ActivityIndicator size="small" color={Colors.dark.primary} />
            ) : (
              <Text style={styles.headerBtnText}>
                {isEditing ? t('common.save') : t('common.edit')}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.avatarSection}>
            <TouchableOpacity 
              style={styles.avatarWrapper} 
              onPress={handlePickAvatar}
              disabled={uploadingAvatar}>
              {profile?.originalAvatarUrl || profile?.avatar ? (
                <ExpoImage 
                  source={profile.originalAvatarUrl || profile.avatar} 
                  style={styles.avatar} 
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarInitial}>
                    {profile?.name ? profile.name.charAt(0).toUpperCase() : 'U'}
                  </Text>
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color="#fff" />
                </View>
              )}
              <View style={styles.editBadge}>
                <IconSymbol name="camera.fill" size={12} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.profileName}>{profile?.name}</Text>
            <Text style={styles.profileEmail}>{profile?.email}</Text>
          </View>

          <View style={styles.infoSection}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('profile.name_label')}</Text>
              {isEditing ? (
                <TextInput
                  style={styles.infoInput}
                  value={editForm.name}
                  onChangeText={(v) => setEditForm(prev => ({ ...prev, name: v }))}
                  placeholder={t('profile.name_label')}
                  placeholderTextColor="#7f8c8d"
                />
              ) : (
                <Text style={styles.infoValue}>{profile?.name}</Text>
              )}
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('profile.email_label')}</Text>
              {isEditing ? (
                <TextInput
                  style={styles.infoInput}
                  value={editForm.email}
                  onChangeText={(v) => setEditForm(prev => ({ ...prev, email: v }))}
                  placeholder={t('profile.email_label')}
                  placeholderTextColor="#7f8c8d"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              ) : (
                <Text style={styles.infoValue}>{profile?.email}</Text>
              )}
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('profile.gender_label')}</Text>
              {isEditing ? (
                <View style={styles.genderSelect}>
                  <TouchableOpacity 
                    style={[styles.genderBtn, editForm.gender === 'man' && styles.genderBtnActive]}
                    onPress={() => setEditForm(prev => ({ ...prev, gender: 'man' }))}>
                    <Text style={[styles.genderBtnText, editForm.gender === 'man' && styles.genderBtnTextActive]}>
                      {t('auth.male')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={[styles.genderBtn, editForm.gender === 'woman' && styles.genderBtnActive]}
                    onPress={() => setEditForm(prev => ({ ...prev, gender: 'woman' }))}>
                    <Text style={[styles.genderBtnText, editForm.gender === 'woman' && styles.genderBtnTextActive]}>
                      {t('auth.female')}
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.infoValue}>
                  {profile?.gender === 'woman' ? t('auth.female') : t('auth.male')}
                </Text>
              )}
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('profile.age_label')}</Text>
              {isEditing ? (
                <TextInput
                  style={styles.infoInput}
                  value={editForm.age}
                  onChangeText={(v) => setEditForm(prev => ({ ...prev, age: v }))}
                  placeholder="18+"
                  placeholderTextColor="#7f8c8d"
                  keyboardType="numeric"
                  maxLength={3}
                />
              ) : (
                <Text style={styles.infoValue}>{profile?.age || '18'}</Text>
              )}
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('auth.country')}</Text>
              {isEditing ? (
                <TouchableOpacity 
                  style={styles.pickerTrigger} 
                  onPress={() => setShowCountryPicker(true)}>
                  <Text style={styles.pickerText}>{editForm.country || t('auth.countryPlaceholder')}</Text>
                  <IconSymbol name="chevron.down" size={14} color="#7f8c8d" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.infoValue}>{profile?.country || t('common.not_specified')}</Text>
              )}
            </View>

            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>{t('auth.city')}</Text>
              {isEditing ? (
                <TouchableOpacity 
                  style={[styles.pickerTrigger, !editForm.countryIso && { opacity: 0.5 }]} 
                  onPress={() => editForm.countryIso ? setShowCityPicker(true) : null}>
                  <Text style={styles.pickerText}>{editForm.city || t('auth.cityPlaceholder')}</Text>
                  <IconSymbol name="chevron.down" size={14} color="#7f8c8d" />
                </TouchableOpacity>
              ) : (
                <Text style={styles.infoValue}>{profile?.city || t('common.not_specified')}</Text>
              )}
            </View>

            {/* Added UID and Balances for parity with web version */}
            {!isEditing && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>{t('profile.user_id')}</Text>
                  <Text style={[styles.infoValue, styles.uidText]}>{user?.uid}</Text>
                </View>

                {profile?.gender === 'man' && (
                  <View style={styles.infoRow}>
                    <View style={styles.balanceHeader}>
                      <Text style={styles.infoLabel}>{t('profile.minutes_balance')}</Text>
                      <TouchableOpacity 
                        style={styles.topUpBtn}
                        onPress={() => setShowPurchaseModal(true)}>
                        <IconSymbol name="plus" size={14} color="#fff" />
                        <Text style={styles.topUpBtnText}>{t('purchase.buy_btn')}</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.infoValue}>
                      {t('profile.minutes_unit', { count: profile?.minutesBalance || 0 })}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>

          {!isEditing && (
            <View style={styles.footerActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={handleDeleteAccount}>
                <IconSymbol name="trash.fill" size={20} color="#e74c3c" />
                <Text style={[styles.actionBtnText, { color: '#e74c3c' }]}>{t('profile.delete_account_title')}</Text>
              </TouchableOpacity>
            </View>
          )}

          {isEditing && (
            <TouchableOpacity 
              style={styles.cancelBtn} 
              onPress={() => setIsEditing(false)}>
              <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>


        {/* Pickers */}
        <SearchablePicker
          visible={showCountryPicker}
          onClose={() => setShowCountryPicker(false)}
          title={t('auth.selectCountry')}
          data={allCountries}
          selectedValue={editForm.country}
          onSelect={(item) => {
            setEditForm(prev => ({ 
              ...prev, 
              country: item.value, 
              countryIso: item.isoCode,
              city: '' 
            }));
          }}
        />

        <SearchablePicker
          visible={showCityPicker}
          onClose={() => setShowCityPicker(false)}
          title={t('auth.selectCity')}
          data={allCities}
          selectedValue={editForm.city}
          onSelect={(item) => {
            setEditForm(prev => ({ ...prev, city: item.value }));
          }}
        />
      </KeyboardAvoidingView>
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
      <MinutesPurchaseModal
        visible={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        userProfile={profile}
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
    padding: 8,
    minWidth: 60,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  headerBtnText: {
    color: Colors.dark.primary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  avatarSection: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    position: 'relative',
    marginBottom: 16,
  },
  avatar: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  avatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 60,
    backgroundColor: 'rgba(52, 73, 94, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  avatarInitial: {
    color: Colors.dark.primary,
    fontSize: 40,
    fontWeight: '700',
  },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.dark.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.dark.background,
  },
  profileName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  profileEmail: {
    color: '#7f8c8d',
    fontSize: 14,
  },
  infoSection: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  infoRow: {
    marginBottom: 24,
  },
  infoLabel: {
    color: '#7f8c8d',
    fontSize: 13,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    color: '#ecf0f1',
    fontSize: 16,
    fontWeight: '500',
  },
  infoInput: {
    backgroundColor: 'rgba(52, 73, 94, 0.4)',
    borderRadius: 12,
    color: '#fff',
    fontSize: 16,
    paddingHorizontal: 16,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  genderSelect: {
    flexDirection: 'row',
    gap: 12,
  },
  genderBtn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    backgroundColor: 'rgba(52, 73, 94, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  genderBtnActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  genderBtnText: {
    color: '#bdc3c7',
    fontWeight: '600',
  },
  genderBtnTextActive: {
    color: '#fff',
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(52, 73, 94, 0.4)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  pickerText: {
    color: '#fff',
    fontSize: 16,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 30,
    paddingHorizontal: 20,
    gap: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 12,
    alignSelf: 'center',
  },
  actionBtnText: {
    color: '#95a5a6',
    fontSize: 15,
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
    paddingHorizontal: 30,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelBtnText: {
    color: '#bdc3c7',
    fontSize: 16,
    fontWeight: '600',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginVertical: 16,
  },
  uidText: {
    fontSize: 16,
    color: '#ecf0f1',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 4,
  },
  balanceValue: {
    color: '#2ecc71',
    fontSize: 20,
    fontWeight: '700',
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  topUpBtn: {
    backgroundColor: Colors.dark.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  topUpBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
