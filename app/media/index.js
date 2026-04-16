import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes, uploadBytesResumable } from 'firebase/storage';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import * as Haptics from 'expo-haptics';
import { ActionModal } from '../../components/ui/ActionModal';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { Colors } from '../../constants/theme';
import { earningsManager } from '../../utils/earningsManager';
import { auth, db, storage } from '../../utils/firebase';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_MARGIN = 2;
const ITEM_SIZE = (width - (ITEM_MARGIN * (COLUMN_COUNT + 1))) / COLUMN_COUNT;

export default function MediaGalleryScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = auth.currentUser;

  // Financial-grade like tracking (matching web statistics)
  const [allPaidLikes, setAllPaidLikes] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;

    // Listen for all earnings for this user (robust index-free query)
    const q = query(
      collection(db, 'earnings'),
      where('userId', '==', user.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Filter for likes in-memory to avoid missing indices
      const allEarnings = snapshot.docs.map(doc => doc.data());
      const likesOnly = allEarnings.filter(e => e.type === 'like');
      setAllPaidLikes(likesOnly);
    }, (err) => console.warn('Gallery earnings sync error:', err));

    return () => unsubscribe();
  }, [user?.uid]);

  const [loading, setLoading] = useState(true);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [actionModal, setActionModal] = useState({
    visible: false, title: '', message: '', confirmText: '', onConfirm: () => { }, isDestructive: false
  });
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [settingAvatar, setSettingAvatar] = useState(false);
  const [likedItems, setLikedItems] = useState(new Set());
  const [isLiking, setIsLiking] = useState(false);
  const likeScale = React.useRef(new Animated.Value(1)).current;
  const [likersModalVisible, setLikersModalVisible] = useState(false);
  const [likersData, setLikersData] = useState([]);
  const [likersLoading, setLikersLoading] = useState(false);

  const showLikers = async (item, index) => {
    if (!item) return;

    setLikersModalVisible(true);
    setLikersLoading(true);
    setLikersData([]);

    try {
      // Find financial likes for THIS item using Super-Sync matching
      const normalizedItemUrl = normalizeUrl(item.url);
      const getFileName = (path) => {
        if (!path) return '';
        const parts = path.split('/');
        const lastPart = parts.pop() || '';
        return lastPart.split('?')[0].split('#')[0].toLowerCase();
      };
      const itemFileName = getFileName(item.url);

      const financialLikes = allPaidLikes.filter(l => {
        const cId = (l.contentId || '').toLowerCase();
        const normalizedCId = normalizeUrl(cId);

        // 1. Web-style ID match
        if (currentFolder && cId === `${currentFolder.id}_${index}`.toLowerCase()) return true;

        // 2. Strict URL match
        if (cId === item.url.toLowerCase() || normalizedCId === normalizedItemUrl) return true;

        // 3. Filename match
        const cFileName = getFileName(cId);
        if (cFileName && itemFileName && cFileName === itemFileName) return true;

        return false;
      });

      const uids = [...new Set(financialLikes.map(l => l.callPartnerId))];
      if (uids.length === 0) {
        setLikersData([]);
        return;
      }

      const profiles = await Promise.all(
        uids.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            if (snap.exists()) {
              return { uid, ...snap.data() };
            }
            return { uid, name: 'Unknown' };
          } catch {
            return { uid, name: 'Unknown' };
          }
        })
      );
      setLikersData(profiles);
    } catch (e) {
      console.error('Error fetching likers:', e);
    } finally {
      setLikersLoading(false);
    }
  };

  // Real-time folders listener
  useEffect(() => {
    if (!user) return;

    const q = query(collection(db, 'galleries'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFolders(data);

      // Keep current folder in sync if viewing one
      if (currentFolder) {
        const updated = data.find(f => f.id === currentFolder.id);
        if (updated) setCurrentFolder(updated);
      }

      setLoading(false);
    }, (error) => {
      console.error("Gallery listener error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, currentFolder?.id]);

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    try {
      await addDoc(collection(db, 'galleries'), {
        userId: user.uid,
        folderName: newFolderName.trim(),
        createdAt: serverTimestamp(),
        items: []
      });
      setNewFolderName('');
      setIsCreatingFolder(false);
    } catch (error) {
      console.error("Create folder error:", error);
      setActionModal({
        visible: true,
        title: t('common.error'),
        message: t('profile.error_creating_folder'),
        showCancel: false
      });
    }
  };

  const handleDeleteFolder = (folderId) => {
    setActionModal({
      visible: true,
      title: t('profile.delete_folder_title'),
      message: t('profile.delete_folder_confirm'),
      confirmText: t('common.delete'),
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'galleries', folderId));
          if (currentFolder?.id === folderId) setCurrentFolder(null);
        } catch (error) {
          console.error("Delete folder error:", error);
        } finally {
          setActionModal(prev => ({ ...prev, visible: false }));
        }
      }
    });
  };

  const handlePickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setActionModal({
        visible: true,
        title: t('common.error'),
        message: t('auth.permissionDenied'),
        showCancel: false
      });
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled) {
      uploadMedia(result.assets[0]);
    }
  };

  const uploadMedia = async (asset) => {
    if (!currentFolder) return;

    setUploading(true);
    try {
      const type = asset.type === 'video' ? 'video' : 'image';
      const filename = `${Date.now()}_media`;
      const storagePath = `galleries/${user.uid}/${currentFolder.id}/${filename}`;
      const storageRef = ref(storage, storagePath);

      const response = await fetch(asset.uri);
      const blob = await response.blob();

      const uploadTask = uploadBytesResumable(storageRef, blob);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error("Upload error:", error);
          setUploading(false);
          setActionModal({
            visible: true,
            title: t('common.error'),
            message: t('profile.error_upload_failed'),
            showCancel: false
          });
        },
        async () => {
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          const newItem = {
            url: downloadURL,
            type,
            createdAt: new Date().toISOString(),
            isPremium: false,
            price: 0
          };

          const updatedItems = [...(currentFolder.items || []), newItem];
          await updateDoc(doc(db, 'galleries', currentFolder.id), {
            items: updatedItems
          });

          setUploading(false);
          setUploadProgress(0);
        }
      );
    } catch (error) {
      console.error("Media upload setup error:", error);
      setUploading(false);
    }
  };

  const handleDeleteMedia = (index) => {
    setActionModal({
      visible: true,
      title: t('profile.delete_media_title'),
      message: t('profile.delete_media_confirm'),
      confirmText: t('common.delete'),
      isDestructive: true,
      onConfirm: async () => {
        try {
          const updatedItems = currentFolder.items.filter((_, i) => i !== index);
          await updateDoc(doc(db, 'galleries', currentFolder.id), {
            items: updatedItems
          });
        } catch (error) {
          console.error("Delete media error:", error);
        } finally {
          setActionModal(prev => ({ ...prev, visible: false }));
        }
      }
    });
  };

  const animateLike = () => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.3, useNativeDriver: true, friction: 3 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, friction: 3 }),
    ]).start();
  };

  const isPaidLikedByMe = (item, index, earningsList) => {
    if (!item) return false;
    if (likedItems.has(item.url)) return true;

    // Check if current user has an earnings record for this content
    const normalizedItemUrl = normalizeUrl(item.url);
    const getFileName = (path) => {
      if (!path) return '';
      const parts = path.split('/');
      const lastPart = parts.pop() || '';
      return lastPart.split('?')[0].split('#')[0].toLowerCase();
    };
    const itemFileName = getFileName(item.url);

    return earningsList?.some(l => {
      if (l.callPartnerId !== user?.uid) return false;
      const cId = (l.contentId || '').toLowerCase();
      const normalizedCId = normalizeUrl(cId);

      // 1. Web-style ID match
      if (currentFolder && cId === `${currentFolder.id}_${index}`.toLowerCase()) return true;

      // 2. Strict URL match
      if (cId === item.url.toLowerCase() || normalizedCId === normalizedItemUrl) return true;

      // 3. Filename match
      const cFileName = getFileName(cId);
      if (cFileName && itemFileName && cFileName === itemFileName) return true;

      return false;
    });
  };

  const handleLikePhoto = async (item, index) => {
    if (!user || !item || isLiking || !currentFolder) return;
    setIsLiking(true);

    const alreadyLiked = isLiked(item);

    // Optimistic UI update
    setLikedItems(prev => {
      const next = new Set(prev);
      if (alreadyLiked) {
        next.delete(item.url);
      } else {
        next.add(item.url);
      }
      return next;
    });

    animateLike();

    try {
      const folderRef = doc(db, 'galleries', currentFolder.id);
      const updatedItems = (currentFolder.items || []).map((i, idx) => {
        if (idx === index) {
          const currentLikedBy = i.likedBy || [];
          return {
            ...i,
            likedBy: alreadyLiked
              ? currentLikedBy.filter(uid => uid !== user.uid)
              : [...currentLikedBy, user.uid]
          };
        }
        return i;
      });

      await updateDoc(folderRef, { items: updatedItems });

      // Check if this item is also the current user's avatar to keep sync
      if (normalizeUrl(item.url) === normalizeUrl(user?.photoURL) ||
        (userProfile && (normalizeUrl(item.url) === normalizeUrl(userProfile.avatar) ||
          normalizeUrl(item.url) === normalizeUrl(userProfile.originalAvatarUrl)))) {
        const userRef = doc(db, 'users', user.uid);
        const currentLikedBy = userProfile?.likedBy || [];
        const newLikedBy = alreadyLiked
          ? currentLikedBy.filter(uid => uid !== user.uid)
          : [...currentLikedBy, user.uid];
        await updateDoc(userRef, { likedBy: newLikedBy });
      }

      if (!alreadyLiked) {
        // Record like for notifications (new likes only, like on web)
        await addDoc(collection(db, 'likes'), {
          senderId: user.uid,
          targetUserId: user.uid, // When liking your own photo
          contentUrl: item.url,
          contentType: item.type || 'image',
          createdAt: serverTimestamp(),
          read: true
        });

        // Add earnings sync
        await earningsManager.addLikeEarnings(
          user.uid,
          user.uid,
          'gallery',
          item.url
        );
      }

      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (error) {
      console.error('Error toggling like:', error);
    } finally {
      setIsLiking(false);
    }
  };

  // Helper to remove tokens/params from URL for consistent comparison
  const normalizeUrl = (url) => {
    if (!url) return '';
    try {
      // Deep decode to handle double-encoded characters and remove all params/hashes
      // Also remove trailing slashes for consistency
      const decoded = decodeURIComponent(decodeURIComponent(url));
      return decoded.split('?')[0].split('#')[0].replace(/\/$/, '');
    } catch {
      return url.split('?')[0].split('#')[0].replace(/\/$/, '');
    }
  };

  const handleSetAsAvatar = async (imageUrl) => {
    setSettingAvatar(true);
    try {
      // 0. Find the source item in folders to get its likedBy data (using normalized URL)
      const normalizedImageUrl = normalizeUrl(imageUrl);
      let sourceLikedBy = [];
      for (const folder of folders) {
        const item = folder.items?.find(i => normalizeUrl(i.url) === normalizedImageUrl);
        if (item) {
          sourceLikedBy = item.likedBy || [];
          break;
        }
      }

      // 1. Download the original image
      const response = await fetch(imageUrl);
      const blob = await response.blob();

      // 2. Upload to Storage as the avatar original
      const avatarRef = ref(storage, `avatars/${user.uid}/original.jpg`);
      await uploadBytes(avatarRef, blob);
      const downloadURL = await getDownloadURL(avatarRef);

      // 3. Create compressed 200×200 thumbnail for Firestore base64
      const thumbnail = await ImageManipulator.manipulateAsync(
        imageUrl,
        [{ resize: { width: 300 } }],
        { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );
      const compressedBase64 = thumbnail.base64
        ? `data:image/jpeg;base64,${thumbnail.base64}`
        : '';

      // 4. Update user document AND its likedBy array for denormalized sync
      await updateDoc(doc(db, 'users', user.uid), {
        avatar: compressedBase64,
        originalAvatarUrl: downloadURL,
        likedBy: sourceLikedBy, // Copy likes from gallery source
        updatedAt: serverTimestamp()
      });

      // 5. Clone 'likes' collection records for the new URL (for source-of-truth accuracy)
      if (sourceLikedBy.length > 0) {
        const likesBatch = sourceLikedBy.map(likerUid => {
          return addDoc(collection(db, 'likes'), {
            senderId: likerUid,
            targetUserId: user.uid,
            contentUrl: downloadURL, // Point to the new avatar URL
            contentType: 'image',
            createdAt: serverTimestamp(),
            read: true // Consider these migrated likes as read
          });
        });
        await Promise.all(likesBatch);
      }

      setIsImageViewerVisible(false);
      setActionModal({
        visible: true,
        title: t('common.success'),
        message: t('profile.successAvatar'),
        showCancel: false
      });
    } catch (error) {
      console.error('Set as avatar error:', error);
      setActionModal({
        visible: true,
        title: t('common.error'),
        message: t('profile.errorAvatar'),
        showCancel: false
      });
    } finally {
      setSettingAvatar(false);
    }
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
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => currentFolder ? setCurrentFolder(null) : router.back()}
          style={styles.headerBtn}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {currentFolder ? currentFolder.folderName : t('profile.my_gallery')}
        </Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => currentFolder ? handlePickMedia() : setIsCreatingFolder(true)}
          disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color={Colors.dark.primary} />
          ) : (
            <IconSymbol name="plus" size={24} color={Colors.dark.primary} />
          )}
        </TouchableOpacity>
      </View>

      {uploading && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${uploadProgress}%` }]} />
        </View>
      )}

      {!currentFolder ? (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {isCreatingFolder && (
            <View style={styles.createFolderForm}>
              <TextInput
                style={styles.folderInput}
                placeholder={t('profile.new_folder_placeholder')}
                placeholderTextColor="#7f8c8d"
                value={newFolderName}
                onChangeText={setNewFolderName}
                autoFocus
              />
              <View style={styles.formActions}>
                <TouchableOpacity onPress={handleCreateFolder} style={styles.saveBtn}>
                  <Text style={styles.saveBtnText}>{t('common.save')}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsCreatingFolder(false)} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>{t('common.cancel')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.foldersGrid}>
            {folders.map(folder => (
              <TouchableOpacity
                key={folder.id}
                style={styles.folderItem}
                onPress={() => setCurrentFolder(folder)}
                onLongPress={() => handleDeleteFolder(folder.id)}>
                <View style={styles.folderIconWrapper}>
                  <IconSymbol name="folder.fill" size={48} color={Colors.dark.primary} />
                  <View style={styles.itemBadge}>
                    <Text style={styles.itemBadgeText}>{folder.items?.length || 0}</Text>
                  </View>
                </View>
                <Text style={styles.folderName} numberOfLines={1}>{folder.folderName}</Text>
              </TouchableOpacity>
            ))}

            {folders.length === 0 && !isCreatingFolder && (
              <View style={styles.emptyState}>
                <IconSymbol name="photo.on.rectangle.angled" size={64} color="rgba(255,255,255,0.1)" />
                <Text style={styles.emptyText}>{t('profile.no_folders')}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={currentFolder.items || []}
          keyExtractor={(_, index) => index.toString()}
          numColumns={COLUMN_COUNT}
          renderItem={({ item, index }) => {
            const normalizedItemUrl = normalizeUrl(item.url);

            // Calculate financial likes from the earnings collection
            const financialLikes = allPaidLikes.filter(l => {
              const cId = (l.contentId || '').toLowerCase();
              const normalizedCId = normalizeUrl(cId);

              const getFileName = (path) => {
                if (!path) return '';
                const parts = path.split('/');
                const lastPart = parts.pop() || '';
                return lastPart.split('?')[0].split('#')[0].toLowerCase();
              };

              const cFileName = getFileName(cId);
              const itemFileName = getFileName(item.url);

              // 1. Filename match (Priority)
              if (cFileName && itemFileName && cFileName === itemFileName) return true;

              // 2. Web-style ID match
              if (cId === `${currentFolder.id}_${index}`.toLowerCase()) return true;

              // 3. Strict URL match
              if (cId === item.url.toLowerCase() || normalizedCId === normalizedItemUrl) return true;

              // 4. Partial match
              if (cId.length > 10 && item.url.toLowerCase().includes(cId)) return true;

              return false;
            });

            const financialLikesCount = financialLikes.length;
            const isWoman = userProfile?.gender === 'woman';

            // For women, use financial likes. For men, fallback to social likes.
            const displayCount = isWoman ? financialLikesCount : (item.likedBy?.length || 0);
            const liked = isWoman ? isPaidLikedByMe(item, index, financialLikes) : (item.likedBy?.includes(user?.uid));

            // Adjust count for optimistic UI
            const isSessionLiked = likedItems.has(item.url);
            const isAlreadyLikedByMe = isWoman
              ? financialLikes.some(l => l.callPartnerId === user?.uid)
              : item.likedBy?.includes(user?.uid);

            let finalDisplayCount = displayCount;
            if (isSessionLiked && !isAlreadyLikedByMe) finalDisplayCount = displayCount + 1;
            if (!isSessionLiked && isAlreadyLikedByMe) finalDisplayCount = Math.max(0, displayCount - 1);


            return (
              <TouchableOpacity
                style={styles.mediaItem}
                onLongPress={() => handleDeleteMedia(index)}
                onPress={() => {
                  if (item.type === 'image') {
                    setSelectedImage(item.url);
                    setSelectedImageIndex(index);
                    setIsImageViewerVisible(true);
                  } else {
                    setActionModal({
                      visible: true,
                      title: t('common.info'),
                      message: t('common.comingSoon'),
                      showCancel: false
                    });
                  }
                }}>
                {item.type === 'image' ? (
                  <Image source={{ uri: item.url }} style={styles.mediaImage} />
                ) : (
                  <View style={styles.videoPlaceholder}>
                    <IconSymbol name="play.fill" size={24} color="#fff" />
                  </View>
                )}
                {/* Like button - bottom left */}
                <TouchableOpacity
                  style={[styles.mediaLikeBtn, liked && styles.mediaLikeBtnActive]}
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleLikePhoto(item, index);
                  }}
                  activeOpacity={0.7}
                >
                  <IconSymbol
                    name={liked ? "heart.fill" : "heart"}
                    size={14}
                    color="#fff"
                  />
                  {displayCount > 0 && (
                    <Text style={styles.mediaLikeCount}>{displayCount}</Text>
                  )}
                </TouchableOpacity>
                {/* Eye button - bottom right */}
                {displayCount > 0 && (
                  <TouchableOpacity
                    style={styles.mediaEyeBtn}
                    onPress={(e) => {
                      e.stopPropagation?.();
                      showLikers(item);
                    }}
                    activeOpacity={0.7}
                  >
                    <IconSymbol name="eye.fill" size={13} color="#fff" />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={(
            <View style={styles.emptyState}>
              <IconSymbol name="photo" size={64} color="rgba(255,255,255,0.1)" />
              <Text style={styles.emptyText}>{t('profile.empty_folder')}</Text>
            </View>
          )}
        />
      )}
      <ActionModal
        visible={actionModal.visible}
        title={actionModal.title}
        message={actionModal.message}
        confirmText={actionModal.confirmText}
        cancelText={t('common.cancel')}
        isDestructive={actionModal.isDestructive}
        onConfirm={actionModal.onConfirm}
        onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
      />

      <Modal
        visible={isImageViewerVisible}
        transparent={false}
        animationType="fade"
        statusBarTranslucent={true}
        onRequestClose={() => setIsImageViewerVisible(false)}>
        <View style={styles.fullScreenContainer}>
          <TouchableOpacity
            style={styles.closeButtonAbsolute}
            onPress={() => setIsImageViewerVisible(false)}>
            <IconSymbol name="xmark" size={24} color="#fff" />
          </TouchableOpacity>

          <View style={styles.imageWrapper}>
            <Image
              source={{ uri: selectedImage }}
              style={styles.fullScreenImage}
              resizeMode="contain"
            />
          </View>

          {/* Viewer Bottom Bar - Aggressive Financial Sync */}
          {(() => {
            const currentItem = (currentFolder?.items || [])[selectedImageIndex];
            if (!currentItem) return null;

            const normalizedItemUrl = normalizeUrl(currentItem.url);
            const getFileName = (path) => {
              if (!path) return '';
              const parts = path.split('/');
              const lastPart = parts.pop() || '';
              return lastPart.split('?')[0].split('#')[0].toLowerCase();
            };
            const itemFileName = getFileName(currentItem.url);

            const financialLikes = allPaidLikes.filter(l => {
              const cId = (l.contentId || '').toLowerCase();
              const normalizedCId = normalizeUrl(cId);

              if (currentFolder && cId === `${currentFolder.id}_${selectedImageIndex}`.toLowerCase()) return true;
              if (cId === currentItem.url.toLowerCase() || normalizedCId === normalizedItemUrl) return true;
              const cFileName = getFileName(cId);
              if (cFileName && itemFileName && cFileName === itemFileName) return true;
              return false;
            });

            const isWoman = userProfile?.gender === 'woman';
            const finalLikesCount = isWoman ? financialLikes.length : (currentItem.likedBy?.length || 0);
            const liked = isWoman ? isPaidLikedByMe(currentItem, selectedImageIndex, financialLikes) : (currentItem.likedBy?.includes(user?.uid));

            // Dynamic sync debug info
            const debugStr = `Gender: ${userProfile?.gender} | Financial: ${financialLikes.length} | Social: ${currentItem.likedBy?.length || 0}`;

            return (
              <View style={styles.viewerBottomBar}>
                <TouchableOpacity
                  style={styles.viewerAction}
                  onPress={() => handleLikePhoto(currentItem, selectedImageIndex)}
                >
                  <IconSymbol
                    name={liked ? "heart.fill" : "heart"}
                    size={28}
                    color={liked ? "#e74c3c" : "#fff"}
                  />
                  <Text style={styles.viewerActionText}>
                    {finalLikesCount > 0 ? finalLikesCount : ''}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.viewerAction}
                  onPress={() => showLikers(currentItem, selectedImageIndex)}
                >
                  <IconSymbol name="person.2.fill" size={24} color="#fff" />
                  <Text style={styles.viewerActionText}>{t('profile.likers')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.viewerAction}
                  onPress={() => handleSetAsAvatar(currentItem.url)}
                  disabled={settingAvatar}
                >
                  <IconSymbol name="person.crop.circle.badge.checkmark" size={24} color="#fff" />
                  <Text style={styles.viewerActionText}>
                    {settingAvatar ? t('common.loading') : t('profile.set_as_avatar')}
                  </Text>
                </TouchableOpacity>

                <Text style={{ position: 'absolute', bottom: -15, left: 10, color: 'rgba(255,255,255,0.2)', fontSize: 9 }}>
                  {debugStr}
                </Text>
              </View>
            );
          })()}
        </View>
      </Modal>

      {/* Who Liked Modal */}
      <Modal
        visible={likersModalVisible}
        transparent={true}
        animationType="slide"
        statusBarTranslucent={true}
        onRequestClose={() => setLikersModalVisible(false)}
      >
        <View style={styles.likersOverlay}>
          <TouchableOpacity style={styles.likersOverlayBg} activeOpacity={1} onPress={() => setLikersModalVisible(false)} />
          <View style={styles.likersSheet}>
            <View style={styles.likersHandle} />
            <Text style={styles.likersTitle}>
              {t('profile.who_liked', 'Liked by')} ({likersData.length})
            </Text>

            {likersLoading ? (
              <ActivityIndicator size="large" color={Colors.dark.primary} style={{ marginTop: 30 }} />
            ) : (
              <FlatList
                data={likersData}
                keyExtractor={(item) => item.uid}
                renderItem={({ item: liker }) => (
                  <View style={styles.likerRow}>
                    {liker.avatar ? (
                      <Image source={{ uri: liker.avatar }} style={styles.likerAvatar} />
                    ) : (
                      <View style={[styles.likerAvatarPlaceholder, { backgroundColor: '#34495e' }]}>
                        <Text style={styles.likerAvatarLetter}>{liker.name?.charAt(0)?.toUpperCase() || 'U'}</Text>
                      </View>
                    )}
                    <View style={styles.likerInfo}>
                      <Text style={styles.likerName}>{liker.name || 'User'}{liker.age ? `, ${liker.age}` : ''}</Text>
                      {liker.city && liker.country && (
                        <Text style={styles.likerLocation}>{liker.city}, {liker.country}</Text>
                      )}
                    </View>
                  </View>
                )}
                contentContainerStyle={{ paddingBottom: 40 }}
                ListEmptyComponent={
                  <Text style={styles.likersEmpty}>{t('profile.no_likes', 'No likes yet')}</Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
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
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  progressContainer: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    width: '100%',
  },
  progressBar: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
  },
  scrollContent: {
    padding: 16,
  },
  createFolderForm: {
    backgroundColor: 'rgba(52, 73, 94, 0.4)',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  folderInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 8,
    height: 48,
    color: '#fff',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  formActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginTop: 8,
  },
  saveBtn: {
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 100,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#bdc3c7',
    fontSize: 16,
    fontWeight: '600',
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  folderItem: {
    width: (width - 32 - 24) / 3, // 3 columns with 12 gap (2 gaps = 24) and 32 total padding
    alignItems: 'center',
    marginBottom: 20,
  },
  folderIconWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  itemBadge: {
    position: 'absolute',
    top: 0,
    right: -5,
    backgroundColor: '#e5566f',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: Colors.dark.background,
  },
  itemBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  folderName: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  mediaItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    margin: ITEM_MARGIN,
    backgroundColor: '#1a1a1a',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2c3e50',
  },
  listContent: {
    padding: ITEM_MARGIN,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyText: {
    color: '#7f8c8d',
    fontSize: 16,
    marginTop: 16,
  },
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  closeButtonAbsolute: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 80 : 60,
    right: 0, // Pushed to the absolute horizontal limit as requested
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: '100%',
    height: '100%',
  },
  viewerFooter: {
    height: Platform.OS === 'ios' ? 100 : 80,
  },
  viewerBottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  viewerAction: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
    gap: 4,
  },
  viewerActionText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  mediaLikeBtn: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    height: 28,
    minWidth: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    paddingHorizontal: 8,
    borderRadius: 14,
    gap: 4,
  },
  mediaLikeBtnActive: {
    backgroundColor: '#ff4757',
    borderWidth: 0,
    shadowColor: '#ff4757',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  mediaLikeCount: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  mediaEyeBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerLikeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 25,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    minWidth: 100,
  },
  viewerLikeText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  likersOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  likersOverlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  likersSheet: {
    backgroundColor: '#0d1b2a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '60%',
    paddingTop: 12,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 0,
  },
  likersHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  likersTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
  },
  likerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  likerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  likerAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  likerAvatarLetter: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  likerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  likerName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  likerLocation: {
    color: '#7f8c8d',
    fontSize: 12,
    marginTop: 2,
  },
  likersEmpty: {
    color: '#7f8c8d',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 30,
  },
});
