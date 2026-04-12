import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Pressable, TouchableHighlight, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../../utils/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileMenuSheet from './ProfileMenuSheet';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';

export default function MainHeader() {
  const { t, i18n } = useTranslation();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [dailyStats, setDailyStats] = useState({ minutes: 0, earnings: 0 });
  const [isMenuVisible, setIsMenuVisible] = useState(false);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const unsubscribeProfile = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data();
        setUserProfile(data);
      }
      setLoading(false);
    }, (err) => {
      console.log('Profile sync error:', err);
      setLoading(false);
    });

    return () => unsubscribeProfile();
  }, []);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user || userProfile?.gender !== 'woman') return;

    const today = new Date().toISOString().split('T')[0];
    const earningsRef = doc(db, 'earnings', `${user.uid}_${today}`);
    
    const unsubscribeEarnings = onSnapshot(earningsRef, (doc) => {
      if (doc.exists()) {
        setDailyStats(doc.data());
      } else {
        setDailyStats({ minutes: 0, earnings: 0 });
      }
    }, (err) => console.log('Daily stats sync error:', err));

    return () => unsubscribeEarnings();
  }, [userProfile?.gender]);

  const toggleLanguage = () => {
    const langs = ['en', 'uk', 'es', 'de', 'fr'];
    // Normalize 'ua' to 'uk' if it was explicitly set before
    const currentLang = i18n.language === 'ua' ? 'uk' : i18n.language;
    let currentIdx = langs.indexOf(currentLang);
    if (currentIdx === -1) currentIdx = 0; // Fallback to 'en' if unknown
    const nextLang = langs[(currentIdx + 1) % langs.length];
    i18n.changeLanguage(nextLang);
    AsyncStorage.setItem('app_language', nextLang).catch(e => console.log('Lang cache error:', e));
  };

  const getInitials = (name) => {
    return name ? name.charAt(0).toUpperCase() : 'U';
  };

  const getAvatarColor = (uid) => {
    if (!uid) return Colors.dark.primary;
    const colors = ['#0ef0ff', '#ff00ff', '#7000ff', '#38bdf8', '#525252'];
    const index = uid.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % colors.length;
    return colors[index];
  };

  if (loading || !userProfile) {
    return (
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.container}>
          <ActivityIndicator color={Colors.dark.primary} size="small" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.container}>
          
          {/* Logo Section */}
          <View style={styles.leftSection}>
            <View style={styles.logoWrapper}>
              <Image 
                source={require('../../assets/images/logo.png')} 
                style={styles.logo} 
                resizeMode="contain" 
              />
            </View>
          </View>

          {/* Controls, Stats & Avatar */}
          <View style={styles.rightSection}>
            
            {/* Auto-Translate Toggle */}
            <TouchableOpacity 
              style={[styles.controlBadge, autoTranslate && styles.controlBadgeActive]} 
              onPress={() => setAutoTranslate(!autoTranslate)}
              activeOpacity={0.7}>
              <IconSymbol 
                name="translate" 
                size={20} 
                color={autoTranslate ? '#0ef0ff' : 'rgba(255, 255, 255, 0.4)'} 
              />
            </TouchableOpacity>

            {/* Language Switcher */}
            <TouchableOpacity style={styles.langToggle} onPress={toggleLanguage} activeOpacity={0.7}>
              <Text style={styles.langIcon}>
                {['uk', 'ua'].includes(i18n.language) ? '🇺🇦' : 
                 i18n.language === 'en' ? '🇺🇸' : 
                 i18n.language === 'es' ? '🇪🇸' : 
                 i18n.language === 'de' ? '🇩🇪' : 
                 i18n.language === 'fr' ? '🇫🇷' : '🌐'}
              </Text>
              <Text style={styles.langText}>{
                ['uk', 'ua'].includes(i18n.language) ? 'UA' : i18n.language.toUpperCase()
              }</Text>
            </TouchableOpacity>

            {/* Male Stats: Minutes Balance */}
            {userProfile.gender === 'man' && (
              <TouchableOpacity style={styles.statsBadge} activeOpacity={0.7}>
                <Text style={styles.statsIcon}>🕐</Text>
                <Text style={styles.statsValue}>{userProfile.minutesBalance || 0}</Text>
              </TouchableOpacity>
            )}

            {/* Female Stats: Daily Earnings */}
            {userProfile.gender === 'woman' && (
              <View style={styles.femaleStatsContainer}>
                <View style={[styles.statsBadge, { marginRight: 6 }]}>
                  <Text style={styles.statsIcon}>⏱️</Text>
                  <Text style={styles.statsValue}>{dailyStats.minutes}</Text>
                </View>
                <View style={styles.statsBadge}>
                  <Text style={styles.statsIcon}>💰</Text>
                  <Text style={styles.statsValue}>${dailyStats.earnings.toFixed(2)}</Text>
                </View>
              </View>
            )}

            {/* Avatar */}
            <View style={styles.avatarOuterWrapper}>
              <Pressable 
                style={({ pressed }) => [
                  styles.avatarContainer, 
                  !userProfile.avatar && { backgroundColor: getAvatarColor(userProfile.uid) },
                  { 
                    opacity: pressed ? 0.9 : 1,
                    transform: [{ scale: pressed ? 0.96 : 1 }],
                    backgroundColor: pressed ? 'rgba(14, 240, 255, 0.15)' : (userProfile.avatar ? 'transparent' : getAvatarColor(userProfile.uid))
                  }
                ]}
                onPress={() => setIsMenuVisible(true)}
                android_ripple={null}>
                {userProfile.originalAvatarUrl || userProfile.avatar ? (
                  <Image source={{ uri: userProfile.originalAvatarUrl || userProfile.avatar }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarFallback}>{getInitials(userProfile.name)}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ProfileMenuSheet 
        isVisible={isMenuVisible} 
        onClose={() => setIsMenuVisible(false)} 
        userProfile={userProfile} 
      />
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#030e21', 
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    height: Platform.OS === 'android' ? 56 : 64, 
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 42,
    height: 42,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  controlBadgeActive: {
    backgroundColor: 'rgba(14, 240, 255, 0.15)',
    borderColor: '#0ef0ff',
  },
  controlIcon: {
    fontSize: 18,
  },
  langToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    height: 36,
  },
  langIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  langText: {
    color: '#0ef0ff',
    fontSize: 13,
    fontWeight: '900',
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 240, 255, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(14, 240, 255, 0.25)',
    height: 36,
  },
  statsIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  statsValue: {
    color: '#0ef0ff',
    fontWeight: '900',
    fontSize: 14,
  },
  femaleStatsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOuterWrapper: {
    borderRadius: 20,
  },
  avatarContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#0ef0ff', 
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 17,
  },
});
