import React, { useEffect, useState } from 'react';
import { StyleSheet, LogBox, Platform } from 'react-native';

// Suppress known Firebase JS SDK bug on Android (non-fatal, doesn't affect functionality)
if (Platform.OS === 'android') {
  LogBox.ignoreLogs([
    'FIRESTORE',
    'INTERNAL ASSERTION FAILED',
    'Unexpected state',
  ]);
}
import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync().catch(() => {});

import { auth, db } from '../utils/firebase';
import { useColorScheme } from '../hooks/use-color-scheme';
import '../i18n'; // Initialize i18n
import LoadingScreen from '../components/ui/LoadingScreen';
import { trackUserOnlineStatus } from '../utils/onlineStatus';

// Custom theme defined safely to avoid "Property doesn't exist" errors
const NexusDarkTheme = {
  dark: true,
  colors: {
    primary: '#0ef0ff',
    background: '#030e21',
    card: '#030e21',
    text: '#ffffff',
    border: '#1e293b',
    notification: '#0ef0ff',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '900' },
  },
};

const NexusDefaultTheme = {
  dark: false,
  colors: {
    primary: '#0ef0ff',
    background: '#030e21',
    card: '#030e21',
    text: '#ffffff',
    border: '#1e293b',
    notification: '#0ef0ff',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '700' },
    heavy: { fontFamily: 'System', fontWeight: '900' },
  },
};

import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [user, setUser] = useState(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [userChecked, setUserChecked] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  // Keep track of when we should actually show the app vs loading
  const [appReady, setAppReady] = useState(false);

  // Hide the static OS splash screen right away so our animated LoadingScreen is visible
  useEffect(() => {
    SplashScreen.hideAsync().catch((err) => {
      console.warn("[Nexus] Splash hide failed (safe to ignore in some envs):", err.message);
    });
  }, []);

  useEffect(() => {
    console.log("[Nexus] Initializing auth state...");
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("[Nexus] Auth state changed, user:", u?.uid || "null");
      setUser(u);
      setAuthResolved(true);
      if (!u) {
        setUserChecked(true);
      } else {
        setUserChecked(false); 
      }
    });
    
    // Also load preferred language
    AsyncStorage.getItem('app_language').then(lang => {
      if (lang) {
        import('../i18n').then(({ default: i18n }) => {
          i18n.changeLanguage(lang);
        });
      }
    });

    return unsubscribe;
  }, []);

  // Track online status when user is authenticated
  useEffect(() => {
    if (!user) return;
    const cleanupOnlineStatus = trackUserOnlineStatus(user.uid);
    return () => {
      if (cleanupOnlineStatus && typeof cleanupOnlineStatus === 'function') {
        cleanupOnlineStatus();
      }
    };
  }, [user?.uid]);

  // Check Firestore user status after auth state resolves
  useEffect(() => {
    if (!authResolved || !user || userChecked) return;

    const checkUserStatus = async () => {
      console.log("[Nexus] Checking user status in Firestore for UID:", user.uid);
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log("[Nexus] User status:", userData.status);

          if (userData.status === 'blocked' || userData.status === 'deleted' || userData.deletionInfo?.status === 'pending_deletion') {
            console.warn("[Nexus] Access denied (status/deletion). Signing out.");
            await auth.signOut();
            setUserChecked(true);
            return;
          }

          if (userData.gender === 'woman' && userData.verificationSubmitted === false) {
            const rootSegment = segments[0];
            if (rootSegment !== 'auth') {
              console.log("[Nexus] Verification required. Redirecting.");
              router.replace({
                pathname: '/auth/verification',
                params: { userId: user.uid }
              });
              setUserChecked(true);
              return;
            }
          }
        }
        setUserChecked(true);
      } catch (error) {
        console.error("[Nexus] Profile check error:", error);
        setUserChecked(true);
      }
    };

    checkUserStatus();
  }, [user, authResolved, userChecked, segments]);

  // Navigation guard
  useEffect(() => {
    if (!authResolved || !userChecked) return;

    const rootSegment = segments[0];
    
    // CASE: Logged out
    if (!user) {
      if (segments.length > 0 && rootSegment !== 'auth') {
        console.log("[Nexus] Force logout redirect from:", segments.join('/'));
        router.replace('/');
      }
      return;
    }

    // CASE: Logged in
    if (user) {
      const authSubSegment = segments[1];
      if (!rootSegment || (rootSegment === 'auth' && authSubSegment !== 'verification')) {
        console.log("[Nexus] Login redirect to (tabs)/chats");
        router.replace('/(tabs)/chats');
      }
    }
  }, [user, authResolved, userChecked, segments]);

  // Determine if the app is ready to transition out of the loading screen
  useEffect(() => {
    if (!authResolved || !userChecked) return;

    const rootSegment = segments[0];
    
    // Wait until router.replace logic applies to route segments to prevent UI flash
    if (user) {
      const authSubSegment = segments[1];
      if (!rootSegment || (rootSegment === 'auth' && authSubSegment !== 'verification')) {
        // Needs redirect
        return;
      }
    } else {
      if (segments.length > 0 && rootSegment !== 'auth') {
        // Needs redirect
        return;
      }
    }
    
    setAppReady(true);
  }, [user, authResolved, userChecked, segments]);


  if (!appReady) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? NexusDarkTheme : NexusDefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#030e21' }
          }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="auth/login" options={{ headerShown: false }} />
          <Stack.Screen name="auth/register" options={{ headerShown: false }} />
          <Stack.Screen name="auth/verification" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
