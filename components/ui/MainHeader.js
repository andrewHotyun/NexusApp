import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator, Pressable, TouchableHighlight, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { auth, db } from '../../utils/firebase';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ProfileMenuSheet from './ProfileMenuSheet';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';
import { MinutesPurchaseModal } from './MinutesPurchaseModal';
import EarningsStatsModal from './EarningsStatsModal';
import WithdrawalModal from './WithdrawalModal';
import PaymentDetailsModal from './PaymentDetailsModal';
import { ActionModal } from './ActionModal';

export default function MainHeader() {
  const { t, i18n } = useTranslation();
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoTranslate, setAutoTranslate] = useState(false);
  const [dailyStats, setDailyStats] = useState({ minutes: 0, earnings: 0 });
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [isStatsVisible, setIsStatsVisible] = useState(false);
  const [isWithdrawalVisible, setIsWithdrawalVisible] = useState(false);
  const [isPaymentDetailsVisible, setIsPaymentDetailsVisible] = useState(false);


  // Day change trigger to reset stats at midnight
  const [currentDateKey, setCurrentDateKey] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const nowMs = now.getTime();
      if (nowMs !== currentDateKey) {
        setCurrentDateKey(nowMs);
      }
    }, 60000);
    return () => clearInterval(interval);
  }, [currentDateKey]);

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
    // CRITICAL: Ensure userProfile is loaded AND gender is 'woman' before querying earnings.
    // Otherwise, it may attempt to query without permission during initial render.
    if (!user || !userProfile || userProfile.gender !== 'woman') return;

    // Exact replica of web Header.js (lines 226-255):
    // Query by userId only to avoid composite index; filter by date in memory
    const today = new Date(currentDateKey);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const qE = query(
      collection(db, 'earnings'),
      where('userId', '==', user.uid)
    );

    const unsubscribeEarnings = onSnapshot(qE, {
      next: (snap) => {
        let totalMinutes = 0;
        let totalEarnings = 0;
        snap.forEach((d) => {
          const data = d.data();
          const createdAt = data.createdAt?.toDate?.() || new Date(0);
          if (createdAt >= today && createdAt < tomorrow && data.status !== 'annulled') {
            totalMinutes += data.minutes || 0;
            totalEarnings += data.earnings || 0;
          }
        });
        setDailyStats({ minutes: totalMinutes, earnings: totalEarnings });
      },
      error: (err) => {
        // Suppress permission-denied errors if gender check somehow races
        if (err.code === 'permission-denied') {
          console.warn('[MainHeader] Earnings listener permission denied (expected for non-woman users)');
        } else {
          console.error('[MainHeader] Daily stats sync error:', err);
        }
      }
    });

    return () => unsubscribeEarnings();
  }, [userProfile?.gender, userProfile === null, currentDateKey]); // Added currentDateKey to re-run listener at midnight

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
              <TouchableOpacity
                style={styles.statsBadge}
                activeOpacity={0.7}
                onPress={() => setShowPurchaseModal(true)}>
                <IconSymbol name="timer" size={13} color="#0ef0ff" style={{ marginRight: 3 }} />
                <Text style={styles.statsValue}>{userProfile.minutesBalance || 0}</Text>
              </TouchableOpacity>
            )}

            {/* Female Stats: Daily Earnings */}
            {userProfile.gender === 'woman' && (
              <View style={styles.femaleStatsContainer}>
                <View style={[styles.statsBadge, { marginRight: 4 }]}>
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
        onOpenStats={() => {
          setIsMenuVisible(false);
          // Small delay for iOS to finish modal closing animation
          setTimeout(() => setIsStatsVisible(true), Platform.OS === 'ios' ? 400 : 0);
        }}
        onOpenWithdrawal={() => {
          setIsMenuVisible(false);
          setTimeout(() => setIsWithdrawalVisible(true), Platform.OS === 'ios' ? 400 : 0);
        }}
        onOpenPaymentDetails={() => {
          setIsMenuVisible(false);
          setTimeout(() => setIsPaymentDetailsVisible(true), Platform.OS === 'ios' ? 400 : 0);
        }}
      />

      <EarningsStatsModal 
        isVisible={isStatsVisible} 
        onClose={() => setIsStatsVisible(false)} 
        userProfile={userProfile}
        onOpenWithdrawal={() => {
          setIsStatsVisible(false);
          setTimeout(() => setIsWithdrawalVisible(true), Platform.OS === 'ios' ? 400 : 0);
        }}
        onOpenPaymentDetails={() => {
          setIsStatsVisible(false);
          setTimeout(() => setIsPaymentDetailsVisible(true), Platform.OS === 'ios' ? 400 : 0);
        }}
      />

      <WithdrawalModal
        isVisible={isWithdrawalVisible}
        onClose={() => setIsWithdrawalVisible(false)}
        userProfile={userProfile}
        onOpenPaymentDetails={() => {
          setIsWithdrawalVisible(false);
          setTimeout(() => setIsPaymentDetailsVisible(true), Platform.OS === 'ios' ? 400 : 0);
        }}
      />

      <PaymentDetailsModal
        isVisible={isPaymentDetailsVisible}
        onClose={() => setIsPaymentDetailsVisible(false)}
        currentDetails={userProfile?.paymentDetails || ''}
      />

      <MinutesPurchaseModal
        visible={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
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
    paddingHorizontal: 8,
    paddingVertical: 8,
    height: Platform.OS === 'android' ? 52 : 58,
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
    width: 40,
    height: 40,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
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
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 18,
    marginRight: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    height: 30,
  },
  langIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  langText: {
    color: '#0ef0ff',
    fontSize: 12,
    fontWeight: '900',
  },
  statsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 240, 255, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 15,
    marginRight: 4,
    borderWidth: 1,
    borderColor: 'rgba(14, 240, 255, 0.25)',
    height: 28,
  },
  statsIcon: {
    fontSize: 12,
    marginRight: 2,
  },
  statsValue: {
    color: '#0ef0ff',
    fontWeight: '900',
    fontSize: 12,
  },
  femaleStatsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarOuterWrapper: {
    borderRadius: 20,
    marginLeft: 10,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
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
