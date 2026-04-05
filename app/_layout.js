import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as SplashScreen from 'expo-splash-screen';
import { auth, db } from '../utils/firebase';
import { useColorScheme } from '@/hooks/use-color-scheme';
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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [user, setUser] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [userChecked, setUserChecked] = useState(false);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    console.log("[Nexus] Initializing application...");
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setUserChecked(false); // Reset check when auth state changes
      
      // Explicit delay of 1.5s to show the beautiful branded pulse
      setTimeout(() => {
        if (initializing) {
          console.log("[Nexus] 1.5s delay over, entering app.");
          setInitializing(false);
        }
      }, 1500);
    });
    return unsubscribe;
  }, []);

  // Check Firestore user status after auth state resolves
  useEffect(() => {
    if (initializing || !user || userChecked) return;

    const checkUserStatus = async () => {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
          const userData = userDoc.data();

          // Check for blocked account
          if (userData.status === 'blocked') {
            console.log("[Nexus] User account is blocked. Signing out.");
            await auth.signOut();
            setUserChecked(true);
            return;
          }

          // Check for deleted account
          if (userData.status === 'deleted') {
            console.log("[Nexus] User account is deleted. Signing out.");
            await auth.signOut();
            setUserChecked(true);
            return;
          }

          // Check for pending deletion
          if (userData.deletionInfo?.status === 'pending_deletion') {
            console.log("[Nexus] User account is pending deletion. Signing out.");
            await auth.signOut();
            setUserChecked(true);
            return;
          }

          // Check if woman user hasn't submitted verification yet
          if (userData.gender === 'woman' && userData.verificationSubmitted === false) {
            const rootSegment = segments[0];
            // Only redirect if not already on verification screen
            if (rootSegment !== 'auth') {
              console.log("[Nexus] Unverified woman user, redirecting to verification.");
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
        console.error("[Nexus] Error checking user status:", error);
        setUserChecked(true);
      }
    };

    checkUserStatus();
  }, [user, initializing, userChecked]);

  // Navigation guard
  useEffect(() => {
    if (initializing || !userChecked) return;

    const rootSegment = segments[0];

    if (user) {
      // If we are on index or auth (and not verification), redirect to main app
      if (!rootSegment || (rootSegment === 'auth' && segments[1] !== 'verification')) {
        router.replace('/(tabs)');
      }
    }
  }, [user, initializing, userChecked, segments]);

  if (initializing) {
    return <LoadingScreen />;
  }

  return (
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
  );
}
