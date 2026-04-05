import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Dimensions,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../constants/theme';

let LottieView = null;
let importMode = 'None';
try {
  const LottieModule = require('lottie-react-native');
  LottieView = LottieModule.default || LottieModule.LottieView || LottieModule;
  importMode = LottieView ? 'Success' : 'Module Empty';
} catch (e) {
  importMode = 'Error';
}

const { width } = Dimensions.get('window');

export default function LandingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const globeScale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 7, useNativeDriver: true }),
      Animated.spring(globeScale, { toValue: 1, tension: 10, friction: 5, useNativeDriver: true }),
    ]).start();
  }, []);

  const renderGlobe = () => {
    return (
      <View style={{ width: 280, height: 280, borderWidth: 10, borderColor: 'red', alignItems: 'center', justifyContent: 'center', backgroundColor: '#440000' }}>
        <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 24 }}>FILE: LANDING_JS</Text>
        <Text style={{ color: 'yellow', marginTop: 10 }}>DEBUG_RED_BOX</Text>
        <View style={{ width: 40, height: 40, backgroundColor: 'yellow', position: 'absolute', bottom: 20 }} />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <View style={styles.debugTag}><Text style={styles.debugText}>Lottie Status: {importMode}</Text></View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <Image source={require('../../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>
        <View style={styles.globeContainer}>{renderGlobe()}</View>
        <Animated.View style={[styles.textSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.title}>Step into the <Text style={styles.brandText}>NEXUS</Text></Text>
          <Text style={styles.subtitle}>{t('landing.tagline', 'Connect with people around the world')}</Text>
        </Animated.View>
        <View style={styles.featuresContainer}>
           {[1,2,3].map((_, i) => (
            <View key={i} style={styles.featureItem}><View style={styles.featureIconBg} /><View style={styles.featureText}><Text style={styles.featureTitle}>Feature {i+1}</Text></View></View>
          ))}
        </View>
        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/auth/register')}><Text style={styles.primaryButtonText}>Get Started</Text></TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030e21' },
  debugTag: { padding: 4, backgroundColor: 'rgba(255, 0, 0, 0.4)', alignItems: 'center', position: 'absolute', top: 50, left: 0, right: 0, zIndex: 1000 },
  debugText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },
  header: { alignItems: 'center', marginTop: 20 },
  logo: { width: 180, height: 50 },
  globeContainer: { height: 320, alignItems: 'center', justifyContent: 'center' },
  textSection: { alignItems: 'center', marginBottom: 20 },
  title: { fontSize: 28, fontWeight: 'bold', color: '#fff', textAlign: 'center' },
  brandText: { color: '#0ef0ff' },
  subtitle: { fontSize: 16, color: '#bdc3c7', textAlign: 'center' },
  featuresContainer: { marginBottom: 20 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, backgroundColor: 'rgba(255, 255, 255, 0.05)', padding: 15, borderRadius: 15 },
  featureIconBg: { width: 40, height: 40, borderRadius: 10, backgroundColor: 'rgba(14, 240, 255, 0.2)', marginRight: 15 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 16, color: '#fff', fontWeight: 'bold' },
  footer: { marginTop: 'auto' },
  primaryButton: { backgroundColor: '#e5566f', height: 55, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
