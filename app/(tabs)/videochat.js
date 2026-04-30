import { Ionicons } from '@expo/vector-icons';
import { City, Country } from 'country-state-city';
import { LinearGradient } from 'expo-linear-gradient';
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { mediaDevices, RTCView } from 'react-native-webrtc';
import { ActionModal } from '../../components/ui/ActionModal';
import ReportUserModal from '../../components/ui/ReportUserModal';
import { SearchablePicker } from '../../components/ui/SearchablePicker';
import { deduplicateCities } from '../../utils/locationUtils';
import { IconSymbol } from '../../components/ui/icon-symbol';
import VideoCallModal from '../../components/chat/VideoCallModal';
import { useAppData } from '../../utils/AppDataProvider';
import { getAvatarColor } from '../../utils/avatarUtils';
import { auth, db } from '../../utils/firebase';
import { randomChatManager } from '../../utils/randomChatManager';

const { width, height } = Dimensions.get('window');

export default function VideoChatTab() {
  const { t } = useTranslation();
  const {
    incomingRequests,
    sentRequests,
    friendIds,
    userProfile,
    isVideoCallVisible
  } = useAppData();

  const currentUserId = auth.currentUser?.uid;
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  // Keyboard listener for Android modal fix
  useEffect(() => {
    if (Platform.OS === 'android') {
      const showSub = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
      const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }
  }, []);

  // Stop searching if a global call is initiated elsewhere (e.g. AppDataProvider)
  useEffect(() => {
    if (isVideoCallVisible && isSearching) {
      stopSearch();
    }
  }, [isVideoCallVisible, isSearching]);

  const [isSearching, setIsSearching] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [match, setMatch] = useState(null);
  const [recentCalls, setRecentCalls] = useState([]);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [activeActionUserId, setActiveActionUserId] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportingUser, setReportingUser] = useState(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successModalTitle, setSuccessModalTitle] = useState('');
  const [successModalMessage, setSuccessModalMessage] = useState('');
  const [recentProfiles, setRecentProfiles] = useState({});

  // Filters
  const [filters, setFilters] = useState({ country: '', city: '', countryIso: '' });
  const [tempFilters, setTempFilters] = useState({ country: '', city: '', countryIso: '' });
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const allCountries = useMemo(() => {
    return Country.getAllCountries().map(c => ({
      label: `${c.flag} ${c.name}`,
      value: c.name,
      isoCode: c.isoCode
    }));
  }, []);

  const allCities = useMemo(() => {
    if (!tempFilters.countryIso) return [];
    const cities = City.getCitiesOfCountry(tempFilters.countryIso);
    return deduplicateCities(cities).map(c => ({
      label: c.name,
      value: c.name
    }));
  }, [tempFilters.countryIso]);

  const searchIntervalRef = useRef(null);

  // Load recent calls
  useEffect(() => {
    if (!currentUserId) return;

    const q = query(
      collection(db, 'recentCalls'),
      where('userId', '==', currentUserId),
      limit(50) // Fetch more to sort client-side
    );

    const unsub = onSnapshot(q, (snap) => {
      const calls = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      // Group by partnerId and keep only the latest call for each
      const uniqueCallsMap = new Map();
      calls.forEach(call => {
        if (!call.partnerId) return;
        const existing = uniqueCallsMap.get(call.partnerId);
        const currentTime = call.timestamp?.seconds || 0;
        const existingTime = existing?.timestamp?.seconds || 0;

        if (!existing || currentTime > existingTime) {
          uniqueCallsMap.set(call.partnerId, call);
        }
      });

      const uniqueCalls = Array.from(uniqueCallsMap.values());

      // Sort by timestamp descending
      uniqueCalls.sort((a, b) => {
        const timeA = a.timestamp?.seconds || 0;
        const timeB = b.timestamp?.seconds || 0;
        return timeB - timeA;
      });

      setRecentCalls(uniqueCalls.slice(0, 15));
    });

    return () => unsub();
  }, [currentUserId]);

  // Sync profile data for recent calls (fallback for missing age/avatar)
  useEffect(() => {
    if (recentCalls.length === 0) return;

    const fetchMissingProfiles = async () => {
      const uidsToFetch = recentCalls
        .map(c => c.partnerId)
        .filter(uid => uid && !recentProfiles[uid]);

      if (uidsToFetch.length === 0) return;

      const newProfiles = { ...recentProfiles };
      let updated = false;

      await Promise.all(uidsToFetch.map(async (uid) => {
        try {
          const userDoc = await getDoc(doc(db, 'users', uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            newProfiles[uid] = {
              name: data.name,
              avatar: data.avatar,
              age: data.age,
            };
            updated = true;
          }
        } catch (e) {
          console.error('Error fetching recent profile:', e);
        }
      }));

      if (updated) {
        setRecentProfiles(newProfiles);
      }
    };

    fetchMissingProfiles();
  }, [recentCalls]);

  const handleDeleteRecent = async (id) => {
    try {
      await deleteDoc(doc(db, 'recentCalls', id));
      setActiveActionUserId(null);
    } catch (e) {
      console.error('Error deleting recent call:', e);
    }
  };

  const handleAddFriend = async (targetUserId, targetUserName, targetUserAvatar) => {
    if (!currentUserId || !targetUserId) return;

    // Check if we already have an incoming request from this user
    const incoming = incomingRequests.find(r => r.fromUserId === targetUserId);
    if (incoming) {
      // Accept it
      try {
        const batch = writeBatch(db);
        const currentUserDoc = await getDoc(doc(db, 'users', currentUserId));
        const currentUserData = currentUserDoc.data() || {};

        const partnerSnap = await getDoc(doc(db, 'users', targetUserId));
        const partnerData = partnerSnap.exists() ? partnerSnap.data() : {};

        const friendRef1 = doc(collection(db, 'friends'));
        batch.set(friendRef1, {
          userId: currentUserId,
          friendId: targetUserId,
          friendName: targetUserName || 'Unknown',
          friendAvatar: targetUserAvatar || '',
          friendCity: partnerData.city || '',
          friendCountry: partnerData.country || '',
          addedAt: serverTimestamp()
        });

        const friendRef2 = doc(collection(db, 'friends'));
        batch.set(friendRef2, {
          userId: targetUserId,
          friendId: currentUserId,
          friendName: currentUserData.name || 'Unknown',
          friendAvatar: currentUserData.avatar || '',
          friendCity: currentUserData.city || '',
          friendCountry: currentUserData.country || '',
          addedAt: serverTimestamp()
        });

        batch.delete(doc(db, 'friendRequests', incoming.id));
        await batch.commit();

        setSuccessModalTitle(t('common.success'));
        setSuccessModalMessage(t('friends.friend_added', { name: targetUserName || t('common.user') }));
        setShowSuccessModal(true);
      } catch (err) {
        console.error("Error accepting request:", err);
      }
      return;
    }

    // Otherwise, send a new request
    try {
      const q = query(
        collection(db, 'friendRequests'),
        where('fromUserId', '==', currentUserId),
        where('toUserId', '==', targetUserId)
      );
      const existing = await getDocs(q);
      if (!existing.empty) {
        Alert.alert(t('common.info'), t('friends.request_already_sent', 'Request already sent'));
        return;
      }

      const partnerSnap = await getDoc(doc(db, 'users', targetUserId));
      const partnerData = partnerSnap.exists() ? partnerSnap.data() : {};

      const senderSnap = await getDoc(doc(db, 'users', currentUserId));
      const senderData = senderSnap.exists() ? senderSnap.data() : {};

      await addDoc(collection(db, 'friendRequests'), {
        fromUserId: currentUserId,
        fromUserName: senderData.name || t('common.me'),
        fromUserAvatar: senderData.avatar || '',
        fromUserCity: senderData.city || '',
        fromUserCountry: senderData.country || '',
        toUserId: targetUserId,
        toUserName: targetUserName || 'Unknown',
        toUserAvatar: targetUserAvatar || '',
        toUserCity: partnerData.city || '',
        toUserCountry: partnerData.country || '',
        status: 'pending',
        createdAt: serverTimestamp()
      });

      setSuccessModalTitle(t('common.success'));
      setSuccessModalMessage(t('friends.request_sent', { name: targetUserName || t('common.user') }));
      setShowSuccessModal(true);
    } catch (err) {
      console.error("Error sending request:", err);
    }
  };

  const handleOpenReport = (item) => {
    setReportingUser({ uid: item.partnerId, name: item.partnerName });
    setShowReportModal(true);
    setActiveActionUserId(null);
  };

  const startSearch = async () => {
    if (!userProfile) return;

    try {
      const stream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
          frameRate: 30
        }
      });
      setLocalStream(stream);
      setIsSearching(true);

      await randomChatManager.enterQueue(userProfile, filters, (foundMatch) => {
        setMatch(foundMatch);
        setIsSearching(false);
        if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
      });

      searchIntervalRef.current = setInterval(async () => {
        const foundMatch = await randomChatManager.findMatch(userProfile, filters);
        if (foundMatch) {
          setMatch(foundMatch);
          setIsSearching(false);
          clearInterval(searchIntervalRef.current);
        }
      }, 5000);

    } catch (err) {
      console.error("Error starting search:", err);
      Alert.alert(t('common.error'), t('chat.camera_error'));
    }
  };

  const stopSearch = async () => {
    setIsSearching(false);
    if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }
    await randomChatManager.exitQueue();
  };

  const handleEndCall = () => {
    setMatch(null);
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }
  };

  const handleNext = async () => {
    const oldMatch = match;
    // Notify the other side (web) that the match was skipped
    if (oldMatch?.id) {
      updateDoc(doc(db, 'randomChatMatches', oldMatch.id), { skippedBy: auth.currentUser?.uid }).catch(() => { });
    }

    // 1. Clear old match to force VideoCallModal to unmount
    setMatch(null);
    setIsSearching(true);

    // 2. Destroy the old camera stream to release hardware
    if (localStream) {
      localStream.getTracks().forEach(t => t.stop());
      setLocalStream(null);
    }

    // 3. Wait for full React unmount and hardware release
    await new Promise(resolve => setTimeout(resolve, 800));

    // 4. Get a fresh camera stream for the new WebRTC connection
    try {
      const newStream = await mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: 'user',
          width: { ideal: 720 },
          height: { ideal: 1280 },
          frameRate: 30
        }
      });
      setLocalStream(newStream);
    } catch (err) {
      console.error("Error starting camera on next:", err);
    }

    // 5. Start a new search with a clean state
    const foundMatch = await randomChatManager.findMatch(userProfile, filters);
    if (foundMatch) {
      setMatch(foundMatch);
      setIsSearching(false);
    } else {
      // Re-enter queue if no immediate match
      await randomChatManager.enterQueue(userProfile, filters, (newMatch) => {
        setMatch(newMatch);
        setIsSearching(false);
        if (searchIntervalRef.current) clearInterval(searchIntervalRef.current);
      });
    }
  };

  const renderRecentCall = ({ item }) => {
    const profile = recentProfiles[item.partnerId] || {};
    const displayName = profile.name || item.partnerName;
    const displayAvatar = profile.avatar || item.partnerAvatar;
    const displayAge = profile.age || item.partnerAge;

    const isFriend = friendIds?.includes(item.partnerId);
    const hasOutgoingRequest = sentRequests?.some(r => r.toUserId === item.partnerId);
    const hasIncomingRequest = incomingRequests?.some(r => r.fromUserId === item.partnerId);
    const showAddBtn = !isFriend && !hasOutgoingRequest && !hasIncomingRequest;

    return (
      <View style={styles.recentItem}>
        <View style={styles.recentItemLeft}>
          <View style={styles.avatarContainer}>
            {displayAvatar ? (
              <Image source={{ uri: displayAvatar }} style={styles.recentAvatar} />
            ) : (
              <View style={[styles.recentAvatar, { backgroundColor: getAvatarColor(item.partnerId), justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>
                  {(displayName || t('common.user')).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.recentName} numberOfLines={1}>
            {displayName}{displayAge ? `, ${displayAge}` : ''}
          </Text>
        </View>

        <View style={styles.historyItemActions}>
          <TouchableOpacity
            style={[
              styles.historyActionBtn, 
              isFriend ? styles.friendBtn : (hasOutgoingRequest || hasIncomingRequest ? styles.pendingBtn : styles.addBtn),
              (isFriend || hasOutgoingRequest) && styles.disabledBtn
            ]}
            onPress={() => !isFriend && !hasOutgoingRequest && handleAddFriend(item.partnerId, displayName, displayAvatar)}
            disabled={isFriend || hasOutgoingRequest}
          >
            {isFriend ? (
              <IconSymbol name="person.badge.checkmark" size={16} color="#fff" />
            ) : (hasOutgoingRequest || hasIncomingRequest) ? (
              <IconSymbol name="timer" size={16} color="#fff" />
            ) : (
              <IconSymbol name="person.badge.plus" size={16} color="#fff" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.historyActionBtn, styles.reportBtn]}
            onPress={() => handleOpenReport({ partnerId: item.partnerId, partnerName: displayName })}
          >
            <IconSymbol name="exclamationmark.circle.fill" size={16} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.historyActionBtn, styles.deleteBtn]}
            onPress={() => handleDeleteRecent(item.id)}
          >
            <IconSymbol name="trash.fill" size={16} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {!isSearching && !match ? (
        <ScrollView contentContainerStyle={styles.lobbyScroll}>
          <View style={styles.lobbyHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 12 }}>
              <Ionicons name="videocam" size={32} color="#0ef0ff" />
              <Text style={[styles.lobbyTitle, { marginBottom: 0 }]}>{t('random_chat.title', 'Random Video Chat')}</Text>
            </View>
            <Text style={styles.lobbySubtitle}>{t('random_chat.subtitle', 'Connect with people all over the world')}</Text>
          </View>

          <View style={styles.featuresContainer}>
            <View style={styles.featureItem}>
              <View style={styles.featureIconContainer}>
                <Ionicons name="earth-outline" size={24} color="#0ef0ff" />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>{t('random_chat.feature_world', 'Meet people worldwide')}</Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.featureIconContainer}>
                <Ionicons name="lock-closed-outline" size={24} color="#0ef0ff" />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>{t('random_chat.feature_secure', 'Anonymous and secure')}</Text>
              </View>
            </View>

            <View style={styles.featureItem}>
              <View style={styles.featureIconContainer}>
                <Ionicons name="flash-outline" size={24} color="#0ef0ff" />
              </View>
              <View style={styles.featureTextContainer}>
                <Text style={styles.featureTitle}>{t('random_chat.feature_instant', 'Instant connections')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.lobbyActions}>
            <TouchableOpacity
              style={styles.lobbyStartBtn}
              onPress={startSearch}
            >
              <LinearGradient
                colors={['#0ef0ff', '#007adf']}
                style={styles.lobbyStartBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Ionicons name="videocam" size={20} color="#000" />
                <Text style={styles.lobbyStartBtnText}>{t('random_chat.start_btn', 'Start Random Video Chat')}</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.lobbyFilterBtn}
              onPress={() => setShowFilterModal(true)}
            >
              <Ionicons name="options-outline" size={20} color="#94a3b8" />
              <Text style={styles.lobbyFilterBtnText}>
                {filters.country || filters.city ? `${filters.country}${filters.city ? ', ' + filters.city : ''}` : t('random_chat.filter_btn', 'Filter')}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <View style={[styles.searchContainer, isSearching && styles.searchingBackground]}>
          <View style={styles.previewContainer}>
            {localStream && !isSearching && !match && (
              <RTCView
                streamURL={localStream.toURL()}
                style={styles.localPreview}
                objectFit="cover"
                mirror={true}
              />
            )}

            {!localStream && !isSearching && !match && (
              <View style={styles.previewPlaceholder}>
                <ActivityIndicator size="large" color="#0ef0ff" />
                <Text style={styles.placeholderText}>{t('videochat.starting_camera', 'Starting camera...')}</Text>
              </View>
            )}

            {(isSearching || !!match) && (
              <View style={styles.searchingOverlay}>
                <LinearGradient
                  colors={['#0c1427', '#1a2a44', '#2a446a']}
                  style={StyleSheet.absoluteFill}
                />

                <View style={styles.searchingLocalPreviewOuter}>
                  <LinearGradient
                    colors={['#0ef0ff', '#007adf']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.searchingLocalPreviewGradient}
                  >
                    <View style={styles.searchingLocalPreviewInner}>
                      {localStream ? (
                        <RTCView
                          streamURL={localStream.toURL()}
                          style={styles.searchingLocalPreview}
                          objectFit="cover"
                          mirror={true}
                        />
                      ) : (
                        <View style={styles.searchingLocalPlaceholder}>
                          <ActivityIndicator size="small" color="#0ef0ff" />
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </View>

                <View style={styles.searchingContent}>
                  <ActivityIndicator size="large" color="#0ef0ff" style={styles.searchingSpinner} />
                  <View style={styles.searchingTextWrapper}>
                    <Text style={styles.searchingText}>
                      {match
                        ? t('random_chat.connecting', 'Partner found!')
                        : t('random_chat.searching', 'Searching...')}
                    </Text>
                    <Text style={styles.searchingSubtext}>
                      {match
                        ? t('random_chat.connecting_hint', 'Establishing a secure connection...')
                        : t('random_chat.searching_hint', 'Looking for someone special...')}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.cancelSearchBtn}
                    onPress={stopSearch}
                  >
                    <Text style={styles.cancelSearchBtnText}>{t('common.cancel', 'Cancel')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {!isSearching && (
              <LinearGradient
                colors={['transparent', 'rgba(11, 18, 32, 0.9)']}
                style={styles.previewGradient}
              />
            )}
          </View>
        </View>
      )}

      {!isSearching && !match && (
        <View style={[styles.historyTray, showRecent && styles.historyTrayExpanded]}>
          <View style={styles.trayHeader}>
            <View style={styles.trayHeaderContent}>
              <Ionicons name="call-outline" size={20} color="#0ef0ff" />
              <Text style={styles.trayTitle}>{t('random_chat.recent_calls', 'Recent Calls')}</Text>
              <TouchableOpacity
                onPress={() => setShowRecent(!showRecent)}
                style={styles.trayToggleBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name={showRecent ? "chevron-down" : "chevron-up"} size={22} color="#0ef0ff" />
              </TouchableOpacity>
            </View>
          </View>

          {showRecent && (
            <FlatList
              data={recentCalls}
              renderItem={renderRecentCall}
              keyExtractor={item => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.trayList}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>{t('random_chat.no_recent_calls', 'No recent calls yet')}</Text>
                </View>
              }
            />
          )}
        </View>
      )}

      {match && (
        <VideoCallModal
          key={match.id}
          visible={!!match}
          callId={match.id}
          isCaller={match.role === 'caller'}
          remoteUserId={match.otherUserId}
          remoteUserName={match.otherUserName}
          remoteUserAvatar={match.otherUserAvatar}
          onEndCall={handleEndCall}
          isRandomChat={true}
          onNext={handleNext}
          currentUserGender={userProfile?.gender || userProfile?.sex}
          currentUserProfile={userProfile}
          initialLocalStream={localStream}
        />
      )}

      <ActionModal
        visible={showSuccessModal}
        title={successModalTitle}
        message={successModalMessage}
        onClose={() => setShowSuccessModal(false)}
        onConfirm={() => setShowSuccessModal(false)}
        showCancel={false}
        confirmText={t('common.ok')}
      />

      <Modal
        visible={showFilterModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowFilterModal(false)}
      >
        <View style={[styles.modalOverlay, { paddingBottom: Platform.OS === 'android' ? keyboardHeight : 0 }]}>
          <TouchableWithoutFeedback onPress={() => setShowFilterModal(false)}>
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          <KeyboardAvoidingView
            behavior="padding"
            enabled={Platform.OS === 'ios'}
            style={{ width: '100%' }}
          >
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{t('videochat.filters', 'Search Filters')}</Text>
                <TouchableOpacity onPress={() => setShowFilterModal(false)}>
                  <Ionicons name="close" size={24} color="#fff" />
                </TouchableOpacity>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>{t('profile.country', 'Country')}</Text>
                <TouchableOpacity
                  style={styles.filterInputContainer}
                  onPress={() => setShowCountryPicker(true)}
                >
                  <Text style={[styles.filterInputText, !tempFilters.country && { color: '#64748b' }]}>
                    {tempFilters.country || t('filters.country_placeholder', 'Select Country...')}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <View style={styles.filterSection}>
                <Text style={styles.filterLabel}>{t('profile.city', 'City')}</Text>
                <TouchableOpacity
                  style={[styles.filterInputContainer, !tempFilters.country && { opacity: 0.5 }]}
                  onPress={() => tempFilters.country && setShowCityPicker(true)}
                >
                  <Text style={[styles.filterInputText, !tempFilters.city && { color: '#64748b' }]}>
                    {tempFilters.city || t('filters.city_placeholder', 'Select City...')}
                  </Text>
                  <Ionicons name="chevron-forward" size={18} color="#64748b" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.applyBtn}
                onPress={() => {
                  setFilters(tempFilters);
                  setShowFilterModal(false);
                }}
              >
                <Text style={styles.applyBtnText}>{t('common.apply', 'Apply')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.clearBtn}
                onPress={() => {
                  const empty = { country: '', city: '', countryIso: '' };
                  setTempFilters(empty);
                  setFilters(empty);
                }}
              >
                <Text style={styles.clearBtnText}>{t('common.clear', 'Clear')}</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>

        <SearchablePicker
          visible={showCountryPicker}
          title={t('profile.country', 'Country')}
          data={allCountries}
          selectedValue={tempFilters.country}
          onSelect={(item) => {
            setTempFilters(prev => ({
              ...prev,
              country: item.value,
              countryIso: item.isoCode,
              city: '' // reset city when country changes
            }));
          }}
          placeholder={t('common.search')}
          noResultsText={t('common.no_results')}
          onClose={() => setShowCountryPicker(false)}
        />

        <SearchablePicker
          visible={showCityPicker}
          title={t('profile.city', 'City')}
          data={allCities}
          selectedValue={tempFilters.city}
          onSelect={(item) => {
            setTempFilters(prev => ({ ...prev, city: item.value }));
          }}
          placeholder={t('common.search')}
          noResultsText={t('common.no_results')}
          onClose={() => setShowCityPicker(false)}
        />
      </Modal>

      <ReportUserModal
        isVisible={showReportModal}
        onClose={() => {
          setShowReportModal(false);
          setReportingUser(null);
        }}
        reportedUser={reportingUser}
        currentUser={auth.currentUser}
        onSuccess={() => Alert.alert(t('common.success'), t('chat.report_sent'))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#030e21',
  },
  lobbyScroll: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 110,
    justifyContent: 'flex-start',
  },
  lobbyHeader: {
    alignItems: 'center',
    marginBottom: 75,
  },
  lobbyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 8,
  },
  lobbySubtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
    paddingHorizontal: 15,
    lineHeight: 20,
  },
  featuresContainer: {
    marginBottom: 20,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 12,
    borderRadius: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  featureIconContainer: {
    width: 36, // Reduced size
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15, // Increased from 14
    fontWeight: '600',
    color: '#e2e8f0',
  },
  lobbyActions: {
    gap: 12,
  },
  lobbyStartBtn: {
    height: 55,
    borderRadius: 28,
    overflow: 'hidden',
  },
  lobbyStartBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  lobbyStartBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
  },
  lobbyFilterBtn: {
    height: 50, // Slightly shorter
    borderRadius: 25,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  lobbyFilterBtnText: {
    fontSize: 15,
    color: '#94a3b8',
    fontWeight: '500',
  },
  searchContainer: {
    flex: 1,
  },
  previewContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  localPreview: {
    flex: 1,
  },
  previewPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 15,
  },
  placeholderText: {
    color: '#94a3b8',
    fontSize: 16,
  },
  previewGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  searchingBackground: {
    backgroundColor: '#0c1427',
  },
  searchingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  searchingLocalPreviewOuter: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 40 : 20,
    right: 20,
    width: 124,
    height: 164,
    borderRadius: 22,
    zIndex: 100,
  },
  searchingLocalPreviewGradient: {
    flex: 1,
    borderRadius: 22,
    padding: 1.5, // Slightly thinner, cleaner border
  },
  searchingLocalPreviewInner: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#1e293b',
  },
  searchingLocalPreview: {
    width: '100%',
    height: '100%',
  },
  searchingLocalPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 30,
    marginTop: 40, // Offset for the top preview
  },
  searchingSpinner: {
    marginBottom: 25,
    transform: [{ scale: 1.3 }],
  },
  searchingTextWrapper: {
    alignItems: 'center',
    marginBottom: 40,
  },
  searchingText: {
    color: '#fff',
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    textShadowColor: 'rgba(14, 240, 255, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  searchingSubtext: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 16,
    textAlign: 'center',
  },
  cancelSearchBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 15,
    paddingHorizontal: 45,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    minWidth: 180,
    alignItems: 'center',
  },
  cancelSearchBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  historyTray: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 75 : 65,
    left: 0,
    right: 0,
    backgroundColor: '#162033',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    overflow: 'hidden',
    height: 60,
  },
  historyTrayExpanded: {
    height: 350, // More height for vertical list
  },
  trayHeader: {
    height: 60, // Matches tray height for perfect centering
    justifyContent: 'center',
    paddingHorizontal: 25,
  },
  trayHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center', // Vertical centering for all items
    width: '100%',
    justifyContent: 'space-between',
  },
  trayTitle: {
    color: '#fff',
    fontSize: 20, // Increased from 16
    fontWeight: '800', // More bold
    flex: 1,
    marginLeft: 15,
  },
  trayToggleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trayList: {
    flexGrow: 1,
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 40, // Increased from 25 to clear navigation buttons
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.02)', // Even more subtle
    borderRadius: 18,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.04)',
  },
  recentItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 15,
  },
  onlineDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#39ff14', // Electric Green
    borderWidth: 2,
    borderColor: '#162033',
    zIndex: 2,
  },
  recentAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: 'rgba(14, 240, 255, 0.2)',
  },
  randomBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#0ef0ff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#162033',
  },
  recentName: {
    color: '#fff',
    fontSize: 16, // Slightly larger
    fontWeight: 'bold',
    flex: 1,
  },
  historyItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  addBtn: {
    backgroundColor: 'rgba(52, 152, 219, 0.2)',
  },
  friendBtn: {
    backgroundColor: 'rgba(46, 204, 113, 0.3)',
  },
  pendingBtn: {
    backgroundColor: 'rgba(241, 196, 15, 0.2)',
  },
  reportBtn: {
    backgroundColor: 'rgba(243, 156, 18, 0.2)',
  },
  deleteBtn: {
    backgroundColor: 'rgba(231, 76, 60, 0.2)',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: width - 50,
    paddingVertical: 40,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 25,
    paddingBottom: Platform.OS === 'ios' ? 40 : 25,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  filterSection: {
    marginBottom: 20,
  },
  filterLabel: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 8,
    marginLeft: 4,
  },
  filterInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  filterInputText: {
    color: '#fff',
    fontSize: 16,
  },
  applyBtn: {
    backgroundColor: '#0ef0ff',
    height: 55,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  applyBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: 'bold',
  },
  clearBtn: {
    height: 50,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  clearBtnText: {
    color: '#64748b',
    fontSize: 14,
  }
});
