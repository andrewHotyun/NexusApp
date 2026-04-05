import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as SplashScreen from 'expo-splash-screen';
import { auth, db } from '../utils/firebase';
import { useColorScheme } from '../hooks/use-color-scheme';
import '../i18n'; // Initialize i18n
import LoadingScreen from '../components/ui/LoadingScreen';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

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
  const [initializing, setInitializing] = useState(true);
  const [userChecked, setUserChecked] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();

  useEffect(() => {
    console.log("[Nexus] Initializing auth state...");
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      console.log("[Nexus] Auth state changed, user:", u?.uid || "null");
      setUser(u);
      if (!u) {
        setUserChecked(true);
      } else {
        setUserChecked(false); 
      }
      
      const timeout = setTimeout(() => {
        if (initializing) {
          console.log("[Nexus] 1.5s splash delay finished.");
          setInitializing(false);
        }
      }, 1500);
      return () => clearTimeout(timeout);
    });
    return unsubscribe;
  }, []);

  // Check Firestore user status after auth state resolves
  useEffect(() => {
    if (initializing || !user || userChecked) return;

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
  }, [user, initializing, userChecked]);

  // Navigation guard
  useEffect(() => {
    if (initializing || !userChecked) return;

    const rootSegment = segments[0];
    
    // CASE: Logged out
    if (!user) {
      // If we are NOT on the index page AND not in auth folder, push to landing
      if (segments.length > 0 && rootSegment !== 'auth') {
        console.log("[Nexus] Force logout redirect from:", segments.join('/'));
        router.replace('/');
      }
      return;
    }

    // CASE: Logged in
    if (user) {
      const authSubSegment = segments[1];
      // If we are on landing or auth screens, push to main app (excluding verification)
      if (!rootSegment || (rootSegment === 'auth' && authSubSegment !== 'verification')) {
        console.log("[Nexus] Login redirect to (tabs)/chats");
        router.replace('/(tabs)/chats');
      }
    }
  }, [user, initializing, userChecked, segments]);

  if (initializing) {
    return <LoadingScreen />;
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? NexusDarkTheme : NexusDefaultTheme}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#030e21' }
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
