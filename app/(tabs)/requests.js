import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  TextInput,
  Keyboard,
  KeyboardAvoidingView
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  getDoc,
  getDocs,
  limit,
  writeBatch,
  addDoc
} from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { ActionModal } from '../../components/ui/ActionModal';
import { Toast } from '../../components/ui/Toast';
import { SearchablePicker } from '../../components/ui/SearchablePicker';
import { Country, City } from 'country-state-city';
import { deduplicateCities } from '../../utils/locationUtils';
import { useRouter } from 'expo-router';

// In-memory cache for search
let globalUsersCache = null;
let globalUsersCacheTimestamp = null;

export default function RequestsTab() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = auth.currentUser;

  const [activeTab, setActiveTab] = useState('incoming'); // 'incoming' | 'sent'
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [friendsList, setFriendsList] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  // Search States
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [searchFilters, setSearchFilters] = useState({ country: '', city: '', countryIso: '', chatType: '' });
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [userAges, setUserAges] = useState({});

  // Pickers
  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);
  const [showChatTypePicker, setShowChatTypePicker] = useState(false);
  
  const [toast, setToast] = useState({ visible: false, messageKey: '', messageParams: {}, type: 'success' });
  const [actionModal, setActionModal] = useState({
    visible: false, title: '', message: '', confirmText: 'OK', onConfirm: () => {}, isDestructive: false, showCancel: true
  });

  const allCountries = useMemo(() => {
    return Country.getAllCountries().map(c => ({
      label: `${c.flag} ${c.name}`,
      value: c.name,
      isoCode: c.isoCode
    }));
  }, []);

  const allCities = useMemo(() => {
    if (!searchFilters.countryIso) return [];
    const cities = City.getCitiesOfCountry(searchFilters.countryIso);
    return deduplicateCities(cities).map(c => ({
      label: c.name,
      value: c.name
    }));
  }, [searchFilters.countryIso]);

  const allChatTypes = useMemo(() => [
    { label: t('search.all_chat_types', 'All Chat Types'), value: '' },
    { label: t('search.chat_type_normal', 'Normal communication'), value: 'normal' },
    { label: t('search.chat_type_18', 'Communication 18+'), value: '18+' }
  ], [t]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    const incomingQuery = query(
      collection(db, 'friendRequests'),
      where('toUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubscribeIncoming = onSnapshot(incomingQuery, (snap) => {
      const sortedData = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      
      setIncomingRequests(sortedData);
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    const sentQuery = query(
      collection(db, 'friendRequests'),
      where('fromUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubscribeSent = onSnapshot(sentQuery, (snap) => {
      const sortedData = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      
      setSentRequests(sortedData);
    });

    const friendsQuery = query(
      collection(db, 'friends'),
      where('userId', '==', user.uid)
    );
    const unsubscribeFriends = onSnapshot(friendsQuery, (snap) => {
      setFriendsList(snap.docs.map(doc => doc.data().friendId));
    });

    return () => {
      unsubscribeIncoming();
      unsubscribeSent();
      unsubscribeFriends();
    };
  }, [user]);

  // Fetch missing ages for incoming and sent requests
  useEffect(() => {
    const fetchAges = async () => {
      const allReqs = [...incomingRequests, ...sentRequests];
      const uidsToFetch = [...new Set(
        allReqs.map(r => r.fromUserId === user?.uid ? r.toUserId : r.fromUserId)
      )].filter(uid => uid && typeof userAges[uid] === 'undefined');

      if (uidsToFetch.length === 0) return;

      const newAges = { ...userAges };
      let updated = false;

      await Promise.all(
        uidsToFetch.map(async (uid) => {
          try {
            const userDoc = await getDoc(doc(db, 'users', uid));
            if (userDoc.exists()) {
              const data = userDoc.data();
              newAges[uid] = data.age || null;
              updated = true;
            } else {
              newAges[uid] = null;
              updated = true;
            }
          } catch (e) {}
        })
      );

      if (updated) {
        setUserAges(newAges);
      }
    };

    if (user) {
      fetchAges();
    }
  }, [incomingRequests, sentRequests, user, userAges]);

  const searchUsers = useCallback(async () => {
    if (!user) return;
    const isSearchingActive = searchQuery.trim() !== '' || searchFilters.country || searchFilters.city || searchFilters.chatType;
    
    if (!isSearchingActive) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      let querySnapshotDocs = [];
      const CACHE_TTL = 10 * 60 * 1000;
      const now = Date.now();

      if (globalUsersCache && globalUsersCacheTimestamp && (now - globalUsersCacheTimestamp < CACHE_TTL)) {
        querySnapshotDocs = globalUsersCache;
      } else {
        const usersQuery = query(collection(db, 'users'), limit(500));
        const snap = await getDocs(usersQuery);
        const docs = snap.docs.map(d => ({ ...d.data(), id: d.id, uid: d.id }));
        globalUsersCache = docs;
        globalUsersCacheTimestamp = Date.now();
        querySnapshotDocs = docs;
      }

      const term = searchQuery.toLowerCase().trim();
      const results = querySnapshotDocs.filter(u => {
        if (!u.uid || u.uid === user.uid || u.email === 'admin@nexus.com' || u.uid === '4bM0UTvNA8XHUOqv1fyzz2lYQeO2') return false;

        const matchesName = u.name && u.name.toLowerCase().includes(term);
        const matchesUid = term.length >= 6 && u.uid && u.uid.toLowerCase().includes(term);
        const matchesText = !term || matchesName || matchesUid;

        const matchesCountry = !searchFilters.country || (u.country && u.country.toLowerCase() === searchFilters.country.toLowerCase());
        const matchesCity = !searchFilters.city || (u.city && u.city.toLowerCase() === searchFilters.city.toLowerCase());
        
        const uChatType = (u.chatType || u.communication_mode || '').toLowerCase();
        const fChatType = (searchFilters.chatType || '').toLowerCase();
        const matchesChatType = !fChatType || uChatType === fChatType;

        return matchesText && matchesCountry && matchesCity && matchesChatType;
      });

      setSearchResults(results);
    } catch (e) {
      console.error(e);
    } finally {
      setSearching(false);
    }
  }, [searchQuery, searchFilters, user]);

  useEffect(() => {
    const timer = setTimeout(() => {
      searchUsers();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, searchFilters, searchUsers]);

  const sendFriendRequest = async (targetUser) => {
    if (!user || targetUser.uid === user.uid) return;

    setProcessingId(targetUser.uid);
    try {
      const senderDoc = await getDoc(doc(db, 'users', user.uid));
      const senderData = senderDoc.data() || {};

      const existing = await getDocs(query(
        collection(db, 'friendRequests'), 
        where('fromUserId', '==', user.uid), 
        where('toUserId', '==', targetUser.uid)
      ));

      if (!existing.empty) {
        setToast({ visible: true, messageKey: 'friends.request_error', messageParams: {}, type: 'error' });
        setProcessingId(null);
        return;
      }

      const requestData = {
        fromUserId: user.uid,
        fromUserName: senderData.name || 'Unknown',
        fromUserAvatar: senderData.avatar || '',
        fromUserCity: senderData.city || '',
        fromUserCountry: senderData.country || '',
        toUserId: targetUser.uid,
        toUserName: targetUser.name || 'Unknown',
        toUserAvatar: targetUser.avatar || '',
        toUserCity: targetUser.city || '',
        toUserCountry: targetUser.country || '',
        status: 'pending',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'friendRequests'), requestData);
      setToast({ visible: true, messageKey: 'friends.request_sent', messageParams: { name: targetUser.name || 'User' }, type: 'success' });
    } catch (e) {
      console.error(e);
      setToast({ visible: true, messageKey: 'friends.request_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const acceptRequest = async (request) => {
    if (!user) return;

    setProcessingId(request.id);
    try {
      const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
      const fromUserDoc = await getDoc(doc(db, 'users', request.fromUserId));

      const currentUserData = currentUserDoc.data() || {};
      const fromUserData = fromUserDoc.data() || {};

      const batch = writeBatch(db);

      const friendRef1 = doc(collection(db, 'friends'));
      batch.set(friendRef1, {
        userId: user.uid,
        friendId: request.fromUserId,
        friendName: fromUserData.name || request.fromUserName || 'Unknown',
        friendAvatar: fromUserData.avatar || request.fromUserAvatar || '',
        friendCity: fromUserData.city || request.fromUserCity || '',
        friendCountry: fromUserData.country || request.fromUserCountry || '',
        addedAt: serverTimestamp()
      });

      const friendRef2 = doc(collection(db, 'friends'));
      batch.set(friendRef2, {
        userId: request.fromUserId,
        friendId: user.uid,
        friendName: currentUserData.name || 'Unknown',
        friendAvatar: currentUserData.avatar || '',
        friendCity: currentUserData.city || '',
        friendCountry: currentUserData.country || '',
        addedAt: serverTimestamp()
      });

      const reqRef = doc(db, 'friendRequests', request.id);
      batch.delete(reqRef);

      await batch.commit();

      setToast({ visible: true, messageKey: 'friends.friend_added', messageParams: { name: fromUserData.name || request.fromUserName || 'Unknown' }, type: 'success' });
    } catch (error) {
      console.error("Error accepting request:", error);
      setToast({ visible: true, messageKey: 'friends.accept_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const rejectRequest = async (request) => {
    setProcessingId(request.id);
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
      setToast({ visible: true, messageKey: 'friends.request_rejected', messageParams: { name: request.fromUserName || 'Unknown' }, type: 'cancel' });
    } catch (error) {
      console.error("Error rejecting request:", error);
      setToast({ visible: true, messageKey: 'friends.reject_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const cancelRequest = async (request) => {
    setProcessingId(request.id);
    try {
      await deleteDoc(doc(db, 'friendRequests', request.id));
      setToast({ visible: true, messageKey: 'friends.request_canceled', messageParams: { name: request.toUserName || 'Unknown' }, type: 'cancel' });
    } catch (error) {
      console.error("Error cancelling request:", error);
      setToast({ visible: true, messageKey: 'friends.cancel_error', messageParams: {}, type: 'error' });
    } finally {
      setProcessingId(null);
    }
  };

  const getFriendStatus = (uid) => {
    if (friendsList.includes(uid)) return 'friend';
    if (sentRequests.some(r => r.toUserId === uid)) return 'sent';
    if (incomingRequests.some(r => r.fromUserId === uid)) return 'incoming';
    return 'none';
  };

  const renderSearchItem = ({ item }) => {
    const status = getFriendStatus(item.uid);
    const isProcessing = processingId === item.uid;

    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          {item.avatar ? (
            <Image source={{ uri: item.avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{item.name ? item.name.charAt(0).toUpperCase() : 'U'}</Text>
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.userName} numberOfLines={1}>{item.name}{item.age ? `, ${item.age}` : ''}</Text>
            {(item.city || item.country) && (
              <Text style={styles.userLocation} numberOfLines={1}>{[item.city, item.country].filter(Boolean).join(', ')}</Text>
            )}
          </View>
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.chatIconBtn} 
            onPress={() => router.push(`/chat/${item.uid}`)}>
            <IconSymbol name="message.fill" size={20} color={Colors.dark.primary} />
          </TouchableOpacity>

          {status === 'friend' ? (
            <View style={styles.statusBadge}><Text style={styles.statusText}>{t('friends.status_friend', 'Friend')}</Text></View>
          ) : status === 'sent' ? (
            <View style={styles.statusBadgeWarning}><Text style={styles.statusTextWarning}>{t('friends.status_sent', 'Pending')}</Text></View>
          ) : status === 'incoming' ? (
            <TouchableOpacity 
              style={styles.actionBtnPrimary}
              onPress={() => {
                const req = incomingRequests.find(r => r.fromUserId === item.uid);
                if(req) acceptRequest(req);
              }}>
              <Text style={styles.actionBtnText}>{t('friends.status_incoming', 'Accept')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity 
              style={[styles.actionBtnPrimary, isProcessing && {opacity: 0.5}]}
              onPress={() => sendFriendRequest(item)}
              disabled={isProcessing}>
              {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionBtnText}>{t('friends.status_none', 'Add')}</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  const renderIncomingItem = ({ item }) => {
    const isProcessing = processingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          {item.fromUserAvatar ? (
            <Image source={{ uri: item.fromUserAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{item.fromUserName ? item.fromUserName.charAt(0).toUpperCase() : '?'}</Text>
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.fromUserName}
              {(item.fromUserAge || userAges[item.fromUserId]) ? `, ${item.fromUserAge || userAges[item.fromUserId]}` : ''}
            </Text>
            {(item.fromUserCity || item.fromUserCountry) && (
              <Text style={styles.userLocation} numberOfLines={1}>{[item.fromUserCity, item.fromUserCountry].filter(Boolean).join(', ')}</Text>
            )}
          </View>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.btn, styles.btnAccept, isProcessing && { opacity: 0.5 }]} onPress={() => acceptRequest(item)} disabled={isProcessing}>
            {isProcessing ? <ActivityIndicator size="small" color="#fff" /> : <IconSymbol name="checkmark" size={20} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnReject, isProcessing && { opacity: 0.5 }]} 
            onPress={() => {
              setActionModal({
                visible: true,
                title: t('friends.reject_request', 'Reject Request'),
                message: t('friends.reject_confirm_msg', 'Are you sure you want to reject this request?'),
                confirmText: t('friends.reject', 'Reject'),
                isDestructive: true,
                showCancel: true,
                onConfirm: () => rejectRequest(item)
              });
            }} disabled={isProcessing}>
            <IconSymbol name="xmark" size={20} color="#e74c3c" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSentItem = ({ item }) => {
    const isProcessing = processingId === item.id;
    return (
      <View style={styles.card}>
        <View style={styles.cardInfo}>
          {item.toUserAvatar ? (
            <Image source={{ uri: item.toUserAvatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitial}>{item.toUserName ? item.toUserName.charAt(0).toUpperCase() : '?'}</Text>
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.userName} numberOfLines={1}>
              {item.toUserName}
              {(item.toUserAge || userAges[item.toUserId]) ? `, ${item.toUserAge || userAges[item.toUserId]}` : ''}
            </Text>
            {(item.toUserCity || item.toUserCountry) && (
              <Text style={styles.userLocation} numberOfLines={1}>{[item.toUserCity, item.toUserCountry].filter(Boolean).join(', ')}</Text>
            )}
          </View>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={[styles.btnCancel, isProcessing && { opacity: 0.5 }]} 
            onPress={() => {
              setActionModal({
                visible: true,
                title: t('friends.cancel_request', 'Cancel Request'),
                message: t('friends.cancel_confirm_msg', 'Are you sure you want to cancel this sent request?'),
                confirmText: t('friends.cancel_button', 'Cancel Request'),
                isDestructive: true,
                showCancel: true,
                onConfirm: () => cancelRequest(item)
              });
            }} disabled={isProcessing}>
            {isProcessing ? <ActivityIndicator size="small" color="#e74c3c" /> : <Text style={styles.cancelText}>{t('common.cancel', 'Cancel')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const isSearchActive = searchQuery.trim().length > 0 || searchFilters.country !== '' || searchFilters.city !== '' || searchFilters.chatType !== '';

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Search Header */}
        <View style={styles.searchHeaderArea}>
          <View style={styles.searchContainer}>
            <IconSymbol name="magnifyingglass" size={18} color="#7f8c8d" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={t('friends.search_placeholder', 'Search by Name or ID')}
              placeholderTextColor="#7f8c8d"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCorrect={false}
              autoCapitalize="none"
              clearButtonMode="while-editing"
            />
            <TouchableOpacity 
              style={[styles.filterBtn, showFilters && styles.filterBtnActive]}
              onPress={() => setShowFilters(!showFilters)}>
              <IconSymbol name="line.3.horizontal.decrease.circle" size={20} color={showFilters ? Colors.dark.primary : '#95a5a6'} />
            </TouchableOpacity>
          </View>
          
          {/* Collapsible Filters */}
          {showFilters && (
            <View style={styles.filtersSection}>
              <View style={styles.filterRow}>
                <TouchableOpacity style={styles.filterInput} onPress={() => setShowCountryPicker(true)}>
                  <Text style={styles.filterText} numberOfLines={1}>{searchFilters.country || t('auth.country', 'Country')}</Text>
                  <IconSymbol name="chevron.down" size={12} color="#7f8c8d" />
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.filterInput, !searchFilters.country && {opacity: 0.5}]} 
                  onPress={() => searchFilters.country && setShowCityPicker(true)}
                  disabled={!searchFilters.country}>
                  <Text style={styles.filterText} numberOfLines={1}>{searchFilters.city || t('auth.city', 'City')}</Text>
                  <IconSymbol name="chevron.down" size={12} color="#7f8c8d" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.filterInput} onPress={() => setShowChatTypePicker(true)}>
                  <Text style={styles.filterText} numberOfLines={1}>
                    {searchFilters.chatType ? (allChatTypes.find(c => c.value === searchFilters.chatType)?.label || searchFilters.chatType) : t('search.all_chat_types', 'Communicate')}
                  </Text>
                  <IconSymbol name="chevron.down" size={12} color="#7f8c8d" />
                </TouchableOpacity>
              </View>
              <View style={styles.filterActionsRow}>
                <TouchableOpacity 
                  style={styles.clearFilterBtnFull} 
                  onPress={() => setSearchFilters({country: '', city: '', countryIso: '', chatType: ''})}>
                  <IconSymbol name="xmark.circle.fill" size={14} color="#e74c3c" />
                  <Text style={styles.clearFilterText}>{t('friends.clear_filters', 'Clear Filters')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {isSearchActive ? (
          /* SEARCH RESULTS VIEW */
          <View style={styles.searchResultsContainer}>
            <Text style={styles.sectionHeaderTitle}>{t('friends.search_results', 'Search Results')}</Text>
            {searching ? (
              <View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.dark.primary} /></View>
            ) : (
              <FlatList
                data={searchResults}
                keyExtractor={item => item.uid}
                renderItem={renderSearchItem}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <IconSymbol name="magnifyingglass" size={60} color="#34495e" />
                    <Text style={styles.emptyText}>{t('friends.no_users_found', 'No users found matching your search.')}</Text>
                  </View>
                }
              />
            )}
          </View>
        ) : (
          /* INCOMING / SENT VIEW */
          <>
            <View style={styles.segmentedControl}>
              <TouchableOpacity style={[styles.segmentBtn, activeTab === 'incoming' && styles.segmentBtnActive]} onPress={() => setActiveTab('incoming')}>
                <Text style={[styles.segmentText, activeTab === 'incoming' && styles.segmentTextActive]}>
                  {t('friends.incoming', 'Incoming')} {incomingRequests.length > 0 ? `(${incomingRequests.length})` : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.segmentBtn, activeTab === 'sent' && styles.segmentBtnActive]} onPress={() => setActiveTab('sent')}>
                <Text style={[styles.segmentText, activeTab === 'sent' && styles.segmentTextActive]}>
                  {t('friends.sent', 'Sent')} {sentRequests.length > 0 ? `(${sentRequests.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}><ActivityIndicator size="large" color={Colors.dark.primary} /></View>
            ) : (
              <FlatList
                data={activeTab === 'incoming' ? incomingRequests : sentRequests}
                keyExtractor={item => item.id}
                renderItem={activeTab === 'incoming' ? renderIncomingItem : renderSentItem}
                extraData={userAges}
                contentContainerStyle={styles.listContainer}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={styles.emptyContainer}>
                    <IconSymbol name="person.crop.circle.badge.questionmark" size={60} color="#34495e" />
                    <Text style={styles.emptyText}>{activeTab === 'incoming' ? t('friends.no_incoming_requests', 'No incoming requests.') : t('friends.no_sent_requests', 'No sent requests.')}</Text>
                  </View>
                }
              />
            )}
          </>
        )}
      </KeyboardAvoidingView>

      <SearchablePicker
        visible={showCountryPicker}
        onClose={() => setShowCountryPicker(false)}
        title={t('auth.selectCountry', 'Select Country')}
        data={allCountries}
        selectedValue={searchFilters.country}
        onSelect={(item) => setSearchFilters(prev => ({ ...prev, country: item.value, countryIso: item.isoCode, city: '' }))}
      />

      <SearchablePicker
        visible={showCityPicker}
        onClose={() => setShowCityPicker(false)}
        title={t('auth.selectCity', 'Select City')}
        data={allCities}
        selectedValue={searchFilters.city}
        onSelect={(item) => setSearchFilters(prev => ({ ...prev, city: item.value }))}
      />

      <SearchablePicker
        visible={showChatTypePicker}
        onClose={() => setShowChatTypePicker(false)}
        title={t('search.chatType', 'Communication Type')}
        data={allChatTypes.filter(c => c.value !== '')}
        selectedValue={searchFilters.chatType}
        onSelect={(item) => setSearchFilters(prev => ({ ...prev, chatType: item.value }))}
        searchable={false}
      />

      <ActionModal
        visible={actionModal.visible}
        title={actionModal.title}
        message={actionModal.message}
        confirmText={actionModal.confirmText}
        cancelText={t('common.cancel', 'Cancel')}
        isDestructive={actionModal.isDestructive}
        showCancel={actionModal.showCancel}
        onConfirm={() => {
          actionModal.onConfirm();
          setActionModal(prev => ({ ...prev, visible: false }));
        }}
        onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
      />
      
      <Toast 
        visible={toast.visible} 
        message={toast.messageKey ? t(toast.messageKey, toast.messageParams) : ''} 
        type={toast.type}
        onHide={() => setToast(prev => ({ ...prev, visible: false }))} 
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.dark.background, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  searchHeaderArea: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(52, 73, 94, 0.4)', borderRadius: 12, height: 46, paddingHorizontal: 12, borderWidth: 1, borderColor: '#34495e' },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16, height: '100%' },
  filterBtn: { padding: 6, marginLeft: 4 },
  filterBtnActive: { backgroundColor: 'rgba(14, 240, 255, 0.1)', borderRadius: 8 },
  filtersSection: { flexDirection: 'column', paddingTop: 12, paddingBottom: 4 },
  filterRow: { flexDirection: 'row', width: '100%', gap: 8, alignItems: 'center' },
  filterInput: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(52, 73, 94, 0.3)', borderRadius: 8, paddingHorizontal: 10, height: 36, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  filterText: { color: '#bdc3c7', fontSize: 13, flex: 1, paddingRight: 4 },
  filterActionsRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 10, width: '100%' },
  clearFilterBtnFull: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(231, 76, 60, 0.1)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, gap: 6, borderWidth: 1, borderColor: 'rgba(231, 76, 60, 0.2)' },
  clearFilterText: { color: '#e74c3c', fontSize: 13, fontWeight: '500' },
  segmentedControl: { flexDirection: 'row', padding: 12, gap: 10 },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12, backgroundColor: 'rgba(52, 73, 94, 0.4)', borderWidth: 1, borderColor: 'transparent' },
  segmentBtnActive: { backgroundColor: 'rgba(14, 240, 255, 0.1)', borderColor: 'rgba(14, 240, 255, 0.3)' },
  segmentText: { color: '#95a5a6', fontWeight: '600', fontSize: 14 },
  segmentTextActive: { color: Colors.dark.primary },
  searchResultsContainer: { flex: 1 },
  sectionHeaderTitle: { color: '#7f8c8d', fontSize: 13, textTransform: 'uppercase', paddingHorizontal: 16, paddingTop: 16, fontWeight: '600' },
  listContainer: { padding: 16, paddingBottom: 100 },
  card: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardInfo: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  avatarPlaceholder: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(52, 73, 94, 0.6)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.dark.primary },
  avatarInitial: { color: Colors.dark.primary, fontSize: 18, fontWeight: '700' },
  textContainer: { marginLeft: 12, flex: 1, paddingRight: 10 },
  userName: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 2 },
  userLocation: { color: '#7f8c8d', fontSize: 13 },
  actionButtons: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatIconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(14, 240, 255, 0.1)', justifyContent: 'center', alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: Colors.dark.primary, paddingHorizontal: 16, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  actionBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusBadge: { backgroundColor: 'rgba(46, 204, 113, 0.1)', paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(46, 204, 113, 0.3)' },
  statusText: { color: '#2ecc71', fontSize: 13, fontWeight: '600' },
  statusBadgeWarning: { backgroundColor: 'rgba(241, 196, 15, 0.1)', paddingHorizontal: 14, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(241, 196, 15, 0.3)' },
  statusTextWarning: { color: '#f1c40f', fontSize: 13, fontWeight: '600' },
  btn: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  btnReject: { backgroundColor: 'rgba(231, 76, 60, 0.1)', borderWidth: 1, borderColor: 'rgba(231, 76, 60, 0.3)' },
  btnAccept: { backgroundColor: Colors.dark.primary },
  btnCancel: { paddingHorizontal: 14, height: 36, borderRadius: 12, backgroundColor: 'rgba(231, 76, 60, 0.1)', borderWidth: 1, borderColor: 'rgba(231, 76, 60, 0.3)', justifyContent: 'center' },
  cancelText: { color: '#e74c3c', fontWeight: '600', fontSize: 13 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 40 },
  emptyContainer: { paddingTop: 60, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  emptyText: { color: '#7f8c8d', fontSize: 15, marginTop: 16, textAlign: 'center' },
});
