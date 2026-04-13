import { Tabs } from 'expo-router';
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { HapticTab } from '../../components/haptic-tab';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { Colors } from '../../constants/theme';
import MainHeader from '../../components/ui/MainHeader';

export default function TabLayout() {
  const { t } = useTranslation();
  const [requestsCount, setRequestsCount] = useState(0);
  const [friendsCount, setFriendsCount] = useState(0);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [likesCount, setLikesCount] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;
    const user = auth.currentUser;

    // Load cached counts for instant UI
    let currentCache = {};
    const loadCache = async () => {
      try {
        if (!user) return;
        const cached = await AsyncStorage.getItem(`badge_counts_${user.uid}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          currentCache = { ...parsed };
          if (parsed.req !== undefined) setRequestsCount(parsed.req);
          if (parsed.fri !== undefined) setFriendsCount(parsed.fri);
          if (parsed.unread !== undefined) setUnreadMessagesCount(parsed.unread);
          if (parsed.likes !== undefined) setLikesCount(parsed.likes);
        }
      } catch (e) {}
    };
    loadCache();

    let saveTimeout = null;
    const saveCount = (key, val) => {
      currentCache[key] = val;
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        if (user) {
           AsyncStorage.setItem(`badge_counts_${user.uid}`, JSON.stringify(currentCache)).catch(()=>{});
        }
      }, 1000);
    };

    // Listen to friend requests count
    const qRequests = query(
      collection(db, 'friendRequests'),
      where('toUserId', '==', user.uid),
      where('status', '==', 'pending')
    );
    const unsubRequests = onSnapshot(qRequests, (snap) => {
      const count = snap.docs.length;
      setRequestsCount(count);
      saveCount('req', count);
    });

    // Listen to friends count
    const qFriends = query(
      collection(db, 'friends'),
      where('userId', '==', user.uid)
    );
    const unsubFriends = onSnapshot(qFriends, (snap) => {
      const count = snap.docs.length;
      setFriendsCount(count);
      saveCount('fri', count);
    });

    // Listen to unread messages count
    const qUnread = query(
      collection(db, 'messages'),
      where('receiverId', '==', user.uid),
      where('read', '==', false)
    );
    const unsubUnread = onSnapshot(qUnread, (snap) => {
      const uniqueSenders = new Set(snap.docs.map(d => d.data().senderId));
      const count = uniqueSenders.size;
      setUnreadMessagesCount(count);
      saveCount('unread', count);
    });
    
    // Listen to likes count (unread)
    const qLikes = query(
      collection(db, 'likes'),
      where('targetUserId', '==', user.uid),
      where('read', '==', false)
    );
    const unsubLikes = onSnapshot(qLikes, (snap) => {
      const count = snap.docs.length;
      setLikesCount(count);
      saveCount('likes', count);
    });

    return () => {
      unsubRequests();
      unsubFriends();
      unsubUnread();
      unsubLikes();
    };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: Colors.dark.background }}>
      {/* Global Header attached to Tabs */}
      <MainHeader />
      
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarActiveTintColor: '#0ef0ff', // Nexus neon cyan
          tabBarInactiveTintColor: '#64748b', // Slate gray
          tabBarStyle: {
            position: 'absolute',
            borderTopWidth: 1,
            borderTopColor: '#1e293b',
            backgroundColor: Platform.OS === 'ios' ? 'rgba(3, 14, 33, 0.95)' : '#0a152e',
            elevation: 0,
            height: Platform.OS === 'ios' ? 75 : 65,
            paddingBottom: Platform.OS === 'ios' ? 12 : 10,
          },
          tabBarLabel: ({ color, children }) => (
            <Text 
              style={{ 
                color, 
                fontSize: 9.5, 
                fontWeight: '700', 
                textAlign: 'center',
                marginTop: 2,
                width: '110%',
                alignSelf: 'center',
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.5}
              allowFontScaling={false}>
              {children}
            </Text>
          ),
          tabBarItemStyle: {
            paddingHorizontal: 0,
            marginHorizontal: 0,
          },
        }}>
        
        {/*
          1. Chats (Home) 
        */}
        <Tabs.Screen
          name="chats"
          options={{
            title: t('nav.chats', { defaultValue: 'Chats' }),
            tabBarIcon: ({ color, focused }) => (
              <IconSymbol size={26} name={focused ? "bubble.left.fill" : "bubble.left.and.bubble.right.fill"} color={color} />
            ),
            tabBarBadge: unreadMessagesCount > 0 ? unreadMessagesCount : undefined,
            tabBarBadgeStyle: { 
              backgroundColor: '#e74c3c', 
              fontSize: 10, 
              minWidth: 16, 
              height: 16, 
              borderRadius: 8,
              lineHeight: 16,
              textAlign: 'center',
              marginTop: -2 
            }
          }}
        />

        {/*
          2. Friends 
        */}
        <Tabs.Screen
          name="friends"
          options={{
            title: t('nav.friends', { defaultValue: 'Friends' }),
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="person.2.fill" color={color} />
            ),
            tabBarBadge: friendsCount > 0 ? friendsCount : undefined,
            tabBarBadgeStyle: { 
              backgroundColor: '#e74c3c', 
              fontSize: 10, 
              minWidth: 16, 
              height: 16, 
              borderRadius: 8,
              lineHeight: 16,
              textAlign: 'center',
              marginTop: -2 
            }
          }}
        />

        {/*
          3. Requests 
        */}
        <Tabs.Screen
          name="requests"
          options={{
            title: t('nav.requests', { defaultValue: 'Requests' }),
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="person.badge.plus" color={color} />
            ),
            tabBarBadge: requestsCount > 0 ? requestsCount : undefined,
            tabBarBadgeStyle: { 
              backgroundColor: '#e74c3c', 
              fontSize: 10, 
              minWidth: 16, 
              height: 16, 
              borderRadius: 8,
              lineHeight: 16,
              textAlign: 'center',
              marginTop: -2 
            }
          }}
        />

        {/*
          4. Notifications 
        */}
        <Tabs.Screen
          name="notifications"
          options={{
            title: t('nav.notifications', { defaultValue: 'Alerts' }),
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="bell.fill" color={color} />
            ),
            tabBarBadge: (unreadMessagesCount + requestsCount + likesCount) > 0 ? (unreadMessagesCount + requestsCount + likesCount) : undefined,
            tabBarBadgeStyle: { 
              backgroundColor: '#e74c3c', 
              color: '#fff',
              fontSize: 10, 
              minWidth: 16, 
              height: 16, 
              borderRadius: 8,
              lineHeight: 16,
              textAlign: 'center',
              marginTop: -2 
            }
          }}
        />

        {/*
          5. Videochat 
        */}
        <Tabs.Screen
          name="videochat"
          options={{
            title: t('nav.videochat', { defaultValue: 'Video' }),
            tabBarIcon: ({ color }) => (
              <IconSymbol size={26} name="video.fill" color={color} />
            ),
          }}
        />
      </Tabs>
    </View>
  );
}
