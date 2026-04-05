import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  SafeAreaView
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { storage, db } from '../../utils/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, updateDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '../../constants/theme';
import { useTranslation } from 'react-i18next';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function VerificationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { userId } = useLocalSearchParams();
  
  const [selfie, setSelfie] = useState(null);
  const [idPhoto, setIdPhoto] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickImage = async (type) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        t('verification.permissionDenied', 'Permission Denied'),
        t('verification.permissionDeniedDesc', 'We need access to your gallery to upload photos.')
      );
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      const asset = result.assets[0];

      // File size validation (matching web: 10MB max)
      if (asset.fileSize && asset.fileSize > MAX_FILE_SIZE) {
        setError(t('verification.fileTooLarge', 'File is too large. Maximum size is 10MB.'));
        return;
      }

      setError('');
      if (type === 'selfie') setSelfie(asset);
      else setIdPhoto(asset);
    }
  };

  const handleSubmit = async () => {
    if (!selfie || !idPhoto) {
      setError(t('verification.bothRequired', 'Please upload both your selfie and ID photo.'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Fetch userName from Firestore (matching web behavior)
      let userNameSnapshot = '';
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const ud = userSnap.data();
          userNameSnapshot = ud.name || ud.displayName || ud.username || (ud.email ? ud.email.split('@')[0] : '') || '';
        }
      } catch (_) { }

      // 1. Upload Selfie
      const selfieResp = await fetch(selfie.uri);
      const selfieBlob = await selfieResp.blob();
      const selfieRef = ref(storage, `verifications/${userId}/selfie_photo.jpg`);
      await uploadBytes(selfieRef, selfieBlob);
      const selfieUrl = await getDownloadURL(selfieRef);

      // 2. Upload ID Photo
      const idResp = await fetch(idPhoto.uri);
      const idBlob = await idResp.blob();
      const idRef = ref(storage, `verifications/${userId}/id_photo.jpg`);
      await uploadBytes(idRef, idBlob);
      const idUrl = await getDownloadURL(idRef);

      // 3. Create Verification Request (matching web structure)
      await addDoc(collection(db, 'verificationRequests'), {
        userId,
        userName: userNameSnapshot,
        selfiePhotoUrl: selfieUrl,
        idPhotoUrl: idUrl,
        status: 'pending',
        submittedAt: serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        adminNotes: '',
      });

      // 4. Update User Profile (matching web fields)
      await updateDoc(doc(db, 'users', userId), {
        verificationSubmitted: true,
        verificationSubmittedAt: serverTimestamp(),
        verificationStatus: 'pending'
      });

      Alert.alert(
        t('common.success', 'Success'),
        t('verification.submitted', 'Your verification has been submitted. You can now use the app while we review it.'),
        [{ text: 'OK', onPress: () => router.replace('/(tabs)') }]
      );
    } catch (err) {
      console.error(err);
      setError(t('verification.uploadFailed', 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>🔐 {t('verification.title', 'Identity Verification')}</Text>
          <Text style={styles.subtitle}>
            {t('verification.description', 'To keep our community safe, please provide the following photos')}
          </Text>
        </View>

        {/* Selfie Rules */}
        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>{t('verification.selfieRulesTitle', '📸 Selfie Requirements')}</Text>
          <Text style={styles.ruleItem}>• {t('verification.selfieRule1', 'Face must be clearly visible')}</Text>
          <Text style={styles.ruleItem}>• {t('verification.selfieRule2', 'Good lighting, no filters')}</Text>
          <Text style={styles.ruleItem}>• {t('verification.selfieRule3', 'Only you in the photo')}</Text>
        </View>

        <View style={styles.rulesCard}>
          <Text style={styles.rulesTitle}>{t('verification.idRulesTitle', '🆔 ID Requirements')}</Text>
          <Text style={styles.ruleItem}>• {t('verification.idRule1', 'All text on your ID must be readable')}</Text>
          <Text style={styles.ruleItem}>• {t('verification.idRule2', 'Passport, driver license, or national ID')}</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.card}>
          <Text style={styles.label}>1. {t('verification.selfieLabel', 'Your Selfie')}</Text>
          <Text style={styles.hint}>{t('verification.selfieHint', 'Make sure your face is clearly visible')}</Text>
          <TouchableOpacity 
            style={[styles.uploadBox, selfie && styles.uploadBoxActive]} 
            onPress={() => pickImage('selfie')}
          >
            {selfie ? (
              <Image source={{ uri: selfie.uri }} style={styles.preview} />
            ) : (
              <View style={styles.placeholder}>
                <IconSymbol name="camera.fill" size={32} color="#7f8c8d" />
                <Text style={styles.uploadText}>{t('verification.takeSelfie', 'Take Selfie')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>2. {t('verification.idLabel', 'ID Photo (Passport/ID)')}</Text>
          <Text style={styles.hint}>{t('verification.idHint', 'Ensure all text on your ID is readable')}</Text>
          <TouchableOpacity 
            style={[styles.uploadBox, idPhoto && styles.uploadBoxActive]} 
            onPress={() => pickImage('id')}
          >
            {idPhoto ? (
              <Image source={{ uri: idPhoto.uri }} style={styles.preview} />
            ) : (
              <View style={styles.placeholder}>
                <IconSymbol name="person.text.rectangle.fill" size={32} color="#7f8c8d" />
                <Text style={styles.uploadText}>{t('verification.uploadId', 'Upload ID Photo')}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.submitButton, loading && styles.submitButtonDisabled]} 
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>{t('verification.submitBtn', 'Submit Verification')}</Text>
          )}
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.skipButton} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.skipText}>{t('verification.completeLater', 'Complete Later')}</Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          {t('verification.footerNote', 'Your data is secure and will only be used for verification purposes.')}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030e21',
  },
  scrollContent: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
    marginTop: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#bdc3c7',
    lineHeight: 22,
  },
  rulesCard: {
    backgroundColor: 'rgba(14, 240, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(14, 240, 255, 0.15)',
  },
  rulesTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0ef0ff',
    marginBottom: 8,
  },
  ruleItem: {
    fontSize: 13,
    color: '#bdc3c7',
    lineHeight: 20,
    marginLeft: 4,
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 16,
    padding: 10,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 8,
  },
  card: {
    backgroundColor: 'rgba(52, 73, 94, 0.4)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  label: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0ef0ff',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 16,
  },
  uploadBox: {
    height: 160,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#34495e',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  uploadBoxActive: {
    borderColor: '#0ef0ff',
    borderStyle: 'solid',
  },
  preview: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    alignItems: 'center',
  },
  uploadText: {
    color: '#7f8c8d',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#0ef0ff',
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#0ef0ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#030e21',
    fontSize: 16,
    fontWeight: '700',
  },
  skipButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  skipText: {
    color: '#7f8c8d',
    fontSize: 14,
  },
  footerNote: {
    color: '#475569',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 18,
  },
});
