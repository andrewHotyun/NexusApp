import { Tabs } from 'expo-router';
import React from 'react';
import { View, Text, Platform } from 'react-native';
import { useTranslation } from 'react-i18next';

import { HapticTab } from '../../components/haptic-tab';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { Colors } from '../../constants/theme';
import MainHeader from '../../components/ui/MainHeader';

export default function TabLayout() {
  const { t } = useTranslation();

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
              allowFontScaling={false}
            >
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
