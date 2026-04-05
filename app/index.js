import { IconSymbol } from '../components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Animated,
  Dimensions,
  Easing,
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
import { Colors } from '../constants/theme';

const { width } = Dimensions.get('window');

const ORIGINAL_USERS = [
  { avatar: 'https://randomuser.me/api/portraits/men/75.jpg', name: 'Alex', city: 'Warsaw, PL' },
  { avatar: 'https://randomuser.me/api/portraits/women/68.jpg', name: 'Iryna', city: 'Lviv, UA' },
  { avatar: 'https://randomuser.me/api/portraits/women/32.jpg', name: 'Mia', city: 'Prague, CZ' },
  { avatar: 'https://randomuser.me/api/portraits/men/27.jpg', name: 'Liam', city: 'Vilnius, LT' },
  { avatar: 'https://randomuser.me/api/portraits/men/55.jpg', name: 'Noah', city: 'Berlin, DE' },
  { avatar: 'https://randomuser.me/api/portraits/women/65.jpg', name: 'Olivia', city: 'Kyiv, UA' },
  { avatar: 'https://randomuser.me/api/portraits/men/12.jpg', name: 'Diego', city: 'Madrid, ES' },
  { avatar: 'https://randomuser.me/api/portraits/women/21.jpg', name: 'Sofia', city: 'Lisbon, PT' },
  { avatar: 'https://randomuser.me/api/portraits/men/6.jpg', name: 'Ethan', city: 'New York, US' },
  { avatar: 'https://randomuser.me/api/portraits/women/11.jpg', name: 'Nadia', city: 'Toronto, CA' },
  { avatar: 'https://randomuser.me/api/portraits/men/30.jpg', name: 'Ravi', city: 'Delhi, IN' },
  { avatar: 'https://randomuser.me/api/portraits/women/52.jpg', name: 'Aiko', city: 'Tokyo, JP' }
];

const ORIGINAL_MESSAGES = [
  'Hi', "Let's connect", 'How are you?', 'Nice to meet you', 'From Ukraine with ❤️', 'Coffee or tea?', 
  'Books or games?', 'What music do you like?', 'Any travel plans?', 'Favorite movie?', 'Do you play sports?', 
  'Cats or dogs?', 'Morning person?', 'Beach or mountains?', 'Call me maybe?', 'What time is it there?', 
  'Do you like art?', 'Tell me a fun fact', 'Pizza or sushi?', 'Tea with lemon?', 'Gaming tonight?', 
  "Let's be friends!", 'Where are you from?', 'How was your day?', 'Any book to recommend?', 'Share your playlist?'
];

import Reanimated, { 
  useSharedValue, 
  useAnimatedStyle, 
  useDerivedValue, 
  withTiming, 
  Easing as REasing,
  runOnJS 
} from 'react-native-reanimated';

// Message flight — runs 100% on the UI thread via Reanimated.
// Zero JS thread involvement = zero lag on Android physical devices.
// Zero old Animated API = zero iOS "moved to native" bugs.
const ReanimFlight = React.memo(({ msg, onComplete }) => {
  const progress = useSharedValue(0);
  const arcMaxHeight = 55;

  const fromX = msg.from.x + 28;
  const fromY = msg.from.y + 22;
  const toX = msg.to.x + 28;
  const toY = msg.to.y + 22;
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx);
  const perpAngle = angle - Math.PI / 2;
  const cosPerp = Math.cos(perpAngle);
  const sinPerp = Math.sin(perpAngle);

  const handleComplete = useCallback(() => {
    if (onComplete) onComplete(msg.id);
  }, [msg.id, onComplete]);

  useEffect(() => {
    progress.value = withTiming(1, { 
      duration: 2500, 
      easing: REasing.linear 
    }, (finished) => {
      if (finished) {
        runOnJS(handleComplete)();
      }
    });
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const t = progress.value;
    const arc = arcMaxHeight * Math.sin(Math.PI * t);
    const x = fromX + t * dx + cosPerp * arc;
    const y = fromY + t * dy + sinPerp * arc;

    // Opacity
    let op = 1;
    if (t < 0.1) op = t / 0.1;
    else if (t > 0.9) op = (1 - t) / 0.1;

    // Scale
    let sc = 1;
    if (t < 0.1) sc = 0.5 + 0.5 * (t / 0.1);
    else if (t > 0.9) sc = 0.5 + 0.5 * ((1 - t) / 0.1);

    return {
      left: x - 70,
      top: y - 20,
      opacity: op,
      transform: [{ scale: sc }],
    };
  });

  // Path Dots — static, rendered once
  const numDots = Math.max(6, Math.floor(distance / 16));
  const pathDots = Array.from({ length: numDots }).map((_, i) => {
    const t = (i + 1) / (numDots + 1);
    const dotArc = arcMaxHeight * Math.sin(Math.PI * t);
    const lx = fromX + t * dx + cosPerp * dotArc;
    const ly = fromY + t * dy + sinPerp * dotArc;
    return (
      <View key={i} style={{
        position: 'absolute',
        left: lx - 2,
        top: ly - 2,
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#0ef0ff',
      }} />
    );
  });

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      {pathDots}
      <Reanimated.View style={[{ position: 'absolute' }, animatedStyle]}>
        <View style={styles.flyingMessage}>
          <IconSymbol name="bubble.left.fill" size={14} color="#e5566f" />
          <Text style={styles.flyingText} numberOfLines={1}>{msg.text}</Text>
        </View>
      </Reanimated.View>
    </View>
  );
});

export default function LandingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  const [activeUsers, setActiveUsers] = useState([]);
  const [activeMessages, setActiveMessages] = useState([]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 20, friction: 7, useNativeDriver: true }),
    ]).start();

    const shuffledRaw = [...ORIGINAL_USERS].sort(() => 0.5 - Math.random());
    const picked = shuffledRaw.slice(0, 4);

    const zones = [
      { minX: -10, maxX: 60, minY: 20, maxY: 90 },
      { minX: 190, maxX: 260, minY: 20, maxY: 90 },
      { minX: -10, maxX: 60, minY: 200, maxY: 250 },
      { minX: 190, maxX: 260, minY: 200, maxY: 250 }
    ];

    const mountedUsers = picked.map((u, i) => {
      const z = zones[i];
      const rx = z.minX + Math.random() * (z.maxX - z.minX);
      const ry = z.minY + Math.random() * (z.maxY - z.minY);
      return { ...u, id: `${u.name}-${i}`, x: rx, y: ry };
    });

    setActiveUsers(mountedUsers);
  }, []);

  useEffect(() => {
    if (activeUsers.length < 2) return;

    let msgIdCounter = 0;
    const interval = setInterval(() => {
      msgIdCounter++;
      const senderIdx = Math.floor(Math.random() * activeUsers.length);
      let receiverIdx = Math.floor(Math.random() * activeUsers.length);
      while(receiverIdx === senderIdx) receiverIdx = Math.floor(Math.random() * activeUsers.length);
      
      const newMsg = {
        id: `msg_${Date.now()}_${msgIdCounter}`,
        from: activeUsers[senderIdx],
        to: activeUsers[receiverIdx],
        text: ORIGINAL_MESSAGES[Math.floor(Math.random() * ORIGINAL_MESSAGES.length)]
      };
      
      setActiveMessages(prev => [...prev.slice(-1), newMsg]);
    }, 3000);
    
    return () => clearInterval(interval);
  }, [activeUsers]);

  const handleMessageComplete = useCallback((id) => {
    setActiveMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const features = [
    { icon: 'globe.americas.fill', title: 'Global Network', desc: 'Communicate with users worldwide' },
    { icon: 'lock.fill', title: 'Private & Secure', desc: 'End-to-end encrypted messaging' },
    { icon: 'bubble.left.and.bubble.right.fill', title: 'Real Connections', desc: 'Find real people, real moments, and real friendships.' },
  ];

  const renderPlanetSimulator = () => {
    return (
      <View style={styles.megaPlanetContainer}>
        <View style={styles.megaPlanetBase}>
           
           <View style={styles.sphereClipping}>
              <Image source={require('../assets/images/3d_neon_globe.png')} style={styles.megaGlobeImage} resizeMode="cover" />
              <LinearGradient colors={['rgba(3, 14, 33, 0.1)', 'rgba(3, 14, 33, 0.8)']} style={styles.planetGradient} />
           </View>
           
           {activeUsers.map(u => (
              <View key={u.id} style={[styles.userCard, { left: u.x, top: u.y }]}>
                <Image source={{ uri: u.avatar }} style={styles.userAvatar} />
                <View>
                  <Text style={styles.userName}>{u.name}</Text>
                  <Text style={styles.userCity}>{u.city}</Text>
                </View>
              </View>
           ))}

           {activeMessages.map(msg => (
             <ReanimFlight key={msg.id} msg={msg} onComplete={handleMessageComplete} />
           ))}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Animated.View style={[styles.header, { opacity: fadeAnim }]}>
          <Image source={require('../assets/images/logo.png')} style={styles.logo} resizeMode="contain" />
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim }}>
          {renderPlanetSimulator()}
        </Animated.View>

        <Animated.View style={[styles.textSection, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <Text style={styles.title}>Step into the <Text style={styles.brandText}>NEXUS</Text></Text>
          <Text style={styles.subtitle}>{t('landing.tagline', 'Connect with people around the world')}</Text>
        </Animated.View>

        <View style={styles.featuresContainer}>
          {features.map((feature, index) => (
            <Animated.View key={index} style={[styles.featureItem, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
              <View style={styles.featureIconBg}>
                <IconSymbol name={feature.icon} size={24} color="#0ef0ff" />
              </View>
              <View style={styles.featureText}>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDesc}>{feature.desc}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/auth/register')} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>{t('landing.getStarted', 'Get Started')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/auth/login')}>
            <Text style={styles.secondaryButtonText}>
              {t('landing.haveAccount', 'Already have an account?')} <Text style={styles.loginLink}>{t('auth.signIn', 'Sign In')}</Text>
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#030e21' },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 40 },
  header: { alignItems: 'center', marginTop: Platform.OS === 'android' ? 60 : 40 },
  logo: { width: 280, height: 84 },
  
  // Planet Simulator Styles
  megaPlanetContainer: {
    height: 420,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -20,
    marginBottom: 10,
    overflow: 'visible',
  },
  megaPlanetBase: {
    width: 320,
    height: 320,
    borderRadius: 160,
    // Add subtle ambient rim glow
    shadowColor: '#0ef0ff',
    shadowOpacity: 0.15,
    shadowRadius: 40,
    elevation: 8,
  },
  sphereClipping: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: 160,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#030e21',
  },
  megaGlobeImage: {
    width: 360, // slightly zoomed to crop out background edges
    height: 360,
    opacity: 0.85,
  },
  planetGradient: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 160,
  },
  userCard: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.95)', // Solid dark slate for high contrast
    borderWidth: 1.5,
    borderColor: 'rgba(14, 240, 255, 0.4)', // cyan border
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 5,
  },
  userAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  userName: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  userCity: { color: '#0ef0ff', fontSize: 10, fontWeight: '700' },
  
  flyingMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  flyingText: { color: '#0f172a', fontSize: 12, marginLeft: 6, fontWeight: '800' },

  // Base UI Styles
  textSection: { alignItems: 'center', marginBottom: 30, marginTop: 10 },
  title: { fontSize: 30, fontWeight: '900', color: '#fff', textAlign: 'center' },
  brandText: { color: '#0ef0ff' },
  subtitle: { fontSize: 16, color: '#64748b', textAlign: 'center', marginTop: 10, paddingHorizontal: 20 },
  featuresContainer: { marginBottom: 30 },
  featureItem: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, backgroundColor: 'rgba(255, 255, 255, 0.03)', padding: 16, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.05)' },
  featureIconBg: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(14, 240, 255, 0.08)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  featureText: { flex: 1 },
  featureTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 2 },
  featureDesc: { fontSize: 13, color: '#475569', lineHeight: 18 },
  footer: { gap: 16 },
  primaryButton: { backgroundColor: '#e5566f', height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#e5566f', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 15, elevation: 8 },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  secondaryButton: { height: 44, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#64748b', fontSize: 15 },
  loginLink: { color: '#0ef0ff', fontWeight: '800' },
});
