import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TouchableOpacity, 
  StyleSheet, 
  Modal,
  ActivityIndicator, 
  Alert,
  Linking
} from 'react-native';
import { ActionModal } from './ActionModal';
import * as ImagePicker from 'expo-image-picker';
import { storage, db } from '../../utils/firebase';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Colors } from '../../constants/theme';

const StoryUpload = ({ isVisible, onClose, userId, onUploadComplete }) => {
  const { t } = useTranslation();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [permissionInfo, setPermissionInfo] = useState(null);

  const startLiveRecording = async () => {
    try {
      // 1. Check permissions WITHOUT triggering the system prompt first
      const info = await ImagePicker.getCameraPermissionsAsync();
      setPermissionInfo(info);
      
      if (info.status === 'granted') {
        launchCamera();
        return;
      }

      // If we haven't asked yet or were denied, show our custom modal
      setShowPermissionModal(true);
    } catch (error) {
      console.error('Error checking permissions:', error);
      Alert.alert(t('common.error'), t('random_chat.camera_error'));
    }
  };

  const launchCamera = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Videos,
        allowsEditing: true,
        quality: 0.8,
        videoMaxDuration: 30,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        handleUpload(result.assets[0].uri);
      }
    } catch (e) {
      console.error('Error launching camera:', e);
    }
  };

  const handlePermissionConfirm = async () => {
    setShowPermissionModal(false);
    
    // Check current status again to be fresh
    const info = await ImagePicker.getCameraPermissionsAsync();
    
    if (info.status === 'undetermined' || info.canAskAgain) {
      const { status: newStatus } = await ImagePicker.requestCameraPermissionsAsync();
      if (newStatus === 'granted') {
        launchCamera();
      }
    } else {
      // It's permanently denied, send to settings
      Linking.openSettings();
    }
  };

  const handleUpload = async (uri) => {
    if (!uri || !userId) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      
      const fileName = `story_${Date.now()}.mp4`;
      const storagePath = `stories/${userId}/${fileName}`;
      const storageRef = ref(storage, storagePath);
      
      const uploadTask = uploadBytesResumable(storageRef, blob);

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Upload failed:', error);
          setIsUploading(false);
          Alert.alert(t('common.error'), t('chat.upload_error'));
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // Expiration date (24h later)
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 24);

          // Add metadata to Firestore
          await addDoc(collection(db, 'stories'), {
            userId,
            videoUrl: downloadURL,
            createdAt: serverTimestamp(),
            expiresAt: expiresAt.toISOString(),
            views: 0,
            status: 'pending', // Moderation status
            viewedBy: [],
            likedBy: [],
            platform: 'mobile'
          });

          setIsUploading(false);
          if (onUploadComplete) onUploadComplete();
          onClose();
        }
      );
    } catch (error) {
      console.error('Error preparing upload:', error);
      setIsUploading(false);
      Alert.alert(t('common.error'), t('profile.errors.update_failed'));
    }
  };

  if (!isVisible && !isUploading) return null;

  return (
    <Modal
      transparent={true}
      visible={isVisible || isUploading}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.content}>
          {isUploading ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="large" color={Colors.dark.primary} />
              <Text style={styles.uploadTitle}>{t('common.processing')}</Text>
              <View style={styles.progressBarContainer}>
                <View style={[styles.progressBarFill, { width: `${uploadProgress}%` }]} />
              </View>
              <Text style={styles.progressText}>{Math.round(uploadProgress)}%</Text>
            </View>
          ) : (
            <View style={styles.initialContainer}>
              <View style={styles.iconCircle}>
                <Ionicons name="sparkles" size={40} color={Colors.dark.primary} />
              </View>
              <Text style={styles.title}>{t('profile.live_story')}</Text>
              <Text style={styles.description}>
                {t('profile.stories_hint')}
              </Text>

              <View style={styles.rulesContainer}>
                <View style={styles.ruleItem}>
                  <Ionicons name="videocam-outline" size={20} color={Colors.dark.primary} />
                  <Text style={styles.ruleText}>{t('profile.story_rules.duration')}</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Ionicons name="sunny-outline" size={20} color={Colors.dark.primary} />
                  <Text style={styles.ruleText}>{t('profile.story_rules.lighting')}</Text>
                </View>
                <View style={styles.ruleItem}>
                  <Ionicons name="shield-checkmark-outline" size={20} color={Colors.dark.primary} />
                  <Text style={styles.ruleText}>{t('profile.story_rules.live_only')}</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.recordButton} onPress={startLiveRecording}>
                <Ionicons name="camera" size={24} color="#000" />
                <Text 
                  style={styles.recordButtonText}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {t('profile.enable_camera')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelButton} onPress={onClose}>
                <Text style={styles.cancelButtonText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <ActionModal
        visible={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
        onConfirm={handlePermissionConfirm}
        title={t('profile.camera_permission_title')}
        message={t('profile.camera_permission_text')}
        confirmText={
          permissionInfo?.status === 'denied' && !permissionInfo?.canAskAgain 
            ? t('profile.open_settings') 
            : t('common.continue')
        }
        cancelText={t('common.cancel')}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  initialContainer: {
    alignItems: 'center',
    width: '100%', // Ensure container takes full width of modal content
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(13, 139, 209, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
  },
  description: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  rulesContainer: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    width: '100%',
  },
  ruleText: {
    color: '#fff',
    fontSize: 15,
    marginLeft: 8,
    flex: 1,
  },
  recordButton: {
    backgroundColor: Colors.dark.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 16,
    alignSelf: 'stretch', // Stretch to fill width
    marginBottom: 16,
    gap: 12,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  recordButtonText: {
    color: '#000',
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: -4,
    flexShrink: 1,
  },
  cancelButton: {
    paddingVertical: 12,
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#64748b',
    fontSize: 15,
    fontWeight: '600',
  },
  uploadingContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  uploadTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 20,
  },
  progressBarContainer: {
    width: 250,
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
  },
  progressText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default StoryUpload;
