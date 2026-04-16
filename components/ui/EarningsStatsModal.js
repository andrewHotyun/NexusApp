import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Dimensions,
  Animated
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../utils/firebase';
import { earningsManager } from '../../utils/earningsManager';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';
import GIFTS from '../../constants/gifts';
import { BlurView } from 'expo-blur';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function EarningsStatsModal({ isVisible, onClose, userProfile }) {
  const { t, i18n } = useTranslation();
  const [currentWeek, setCurrentWeek] = useState(0); // 0 = current week, -1 = previous, etc.
  const [stats, setStats] = useState([]);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [expandedDays, setExpandedDays] = useState({});
  const cacheRef = useRef({});

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

  const toggleDayStats = (dateString) => {
    setExpandedDays(prev => ({
      ...prev,
      [dateString]: !prev[dateString]
    }));
  };

  const getWeekDates = (weekOffset) => {
    const now = new Date();
    const currentDay = now.getDay();
    const daysToMonday = currentDay === 0 ? 6 : currentDay - 1;

    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday + (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    return { start: monday, end: sunday };
  };

  const buildWeekSkeleton = (weekOffset) => {
    const { start } = getWeekDates(weekOffset);
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push({
        date: d,
        calls: 0,
        minutes: 0,
        callMinutes: 0,
        giftMinutes: 0,
        giftsReceived: {},
        earnings: 0
      });
    }
    return { stats: days, totalEarnings: 0 };
  };

  useEffect(() => {
    if (!isVisible || !auth.currentUser) return;

    // Show skeleton/cache first
    if (!cacheRef.current[currentWeek]) {
        const skeleton = buildWeekSkeleton(currentWeek);
        cacheRef.current[currentWeek] = skeleton;
        setStats(skeleton.stats);
        setTotalEarnings(skeleton.totalEarnings);
    } else {
        const cached = cacheRef.current[currentWeek];
        setStats(cached.stats);
        setTotalEarnings(cached.totalEarnings);
    }

    const { start, end } = getWeekDates(currentWeek);
    const q = query(
      collection(db, 'earnings'),
      where('userId', '==', auth.currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const dailyStats = {};
      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dailyStats[d.toDateString()] = {
          date: d,
          calls: 0,
          minutes: 0,
          callMinutes: 0,
          giftMinutes: 0,
          giftsReceived: {},
          earnings: 0
        };
        days.push(d);
      }

      let totalE = 0;
      snapshot.forEach((doc) => {
        const data = doc.data();
        let createdAt;
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') createdAt = data.createdAt.toDate();
          else if (data.createdAt.seconds !== undefined) createdAt = new Date(data.createdAt.seconds * 1000);
          else {
            const d = new Date(data.createdAt);
            createdAt = isNaN(d.getTime()) ? null : d;
          }
        }

        if (createdAt && createdAt >= start && createdAt <= end && data.status !== 'annulled') {
          const key = createdAt.toDateString();
          const day = dailyStats[key];
          if (day) {
            const mins = Number(data.minutes) || 0;
            const earnings = Number(data.earnings) || 0;

            if (data.type === 'gift') {
              day.minutes += mins;
              day.giftMinutes += mins;
              const gid = data.giftId || '_unknown_';
              if (!day.giftsReceived[gid]) {
                day.giftsReceived[gid] = { count: 0, minutes: 0 };
              }
              day.giftsReceived[gid].count += 1;
              day.giftsReceived[gid].minutes += mins;
            } else if (data.type === 'like') {
              if (!day.likesReceived) day.likesReceived = { story: 0, gallery: 0, earnings: 0 };
              if (data.likeSubtype === 'story') day.likesReceived.story += 1;
              else day.likesReceived.gallery += 1;
              day.likesReceived.earnings += earnings;
            } else if (data.callType === 'bonus' || data.type === 'bonus') {
              if (!day.bonusesReceived) day.bonusesReceived = { count: 0, earnings: 0 };
              day.bonusesReceived.count += 1;
              day.bonusesReceived.earnings += earnings;
            } else {
              day.calls += 1;
              day.minutes += mins;
              day.callMinutes += mins;
            }

            day.earnings += earnings;
            totalE += earnings;
          }
        }
      });

      const statsArray = days.map(d => dailyStats[d.toDateString()]);
      const result = { stats: statsArray, totalEarnings: Number(totalE.toFixed(2)) };
      cacheRef.current[currentWeek] = result;
      setStats(statsArray);
      setTotalEarnings(result.totalEarnings);
    }, (err) => console.warn('EarningsStats subscription error:', err));

    return () => unsubscribe();
  }, [isVisible, currentWeek, currentDateKey]);

  const formatDate = (date) => {
    return date.toLocaleDateString(i18n.language === 'uk' ? 'uk-UA' : i18n.language, {
      day: '2-digit',
      month: '2-digit'
    });
  };

  const getDayName = (date) => {
    const dayNames = [
      t('common.sunday'), t('common.monday'), t('common.tuesday'),
      t('common.wednesday'), t('common.thursday'), t('common.friday'), t('common.saturday')
    ];
    return dayNames[date.getDay()];
  };

  const { start, end } = getWeekDates(currentWeek);
  const weekLabel = (() => {
    if (currentWeek === 0) return t('earnings.current_week');
    if (currentWeek === -1) return t('earnings.previous_week');
    if (currentWeek < -1) return t('earnings.weeks_ago', { count: Math.abs(currentWeek) });
    return t('earnings.next_week');
  })();

  if (!isVisible) return null;

  return (
    <Modal visible={isVisible} animationType="slide" transparent={true} statusBarTranslucent>
      <View style={styles.overlay}>
        <BlurView intensity={80} tint="dark" style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>📊 {t('earnings.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <IconSymbol name="xmark" size={24} color="#fff" />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Week Navigation */}
            <View style={styles.navigation}>
              <TouchableOpacity onPress={() => setCurrentWeek(prev => prev - 1)} style={styles.navBtn}>
                <IconSymbol name="chevron.left" size={20} color={Colors.dark.primary} />
              </TouchableOpacity>
              <View style={styles.weekInfo}>
                <Text style={styles.weekLabel}>{weekLabel}</Text>
                <Text style={styles.weekDates}>{formatDate(start)} - {formatDate(end)}</Text>
              </View>
              <TouchableOpacity onPress={() => setCurrentWeek(prev => prev + 1)} style={styles.navBtn}>
                <IconSymbol name="chevron.right" size={20} color={Colors.dark.primary} />
              </TouchableOpacity>
            </View>

            {/* Total Balance Card */}
            <View style={styles.totalCard}>
              <View style={styles.totalIconWrapper}>
                <IconSymbol name="dollarsign.circle.fill" size={32} color={Colors.dark.primary} />
              </View>
              <View>
                <Text style={styles.totalLabel}>{t('earnings.total_earnings')}</Text>
                <Text style={styles.totalValue}>${totalEarnings.toFixed(2)}</Text>
              </View>
            </View>

            {/* Daily List */}
            <View style={styles.dailyList}>
              {stats.map((day, index) => {
                const isExpanded = expandedDays[day.date.toDateString()];
                const hasGifts = Object.keys(day.giftsReceived).length > 0;

                return (
                  <View key={index} style={[styles.dayCard, day.earnings > 0 && styles.activeDayCard]}>
                    <View style={styles.dayHeader}>
                      <View>
                        <Text style={styles.dayName}>{getDayName(day.date)}</Text>
                        <Text style={styles.dayDate}>{formatDate(day.date)}</Text>
                      </View>
                      <View style={styles.dayEarningsWrapper}>
                        <Text style={styles.dayEarningsValue}>${day.earnings.toFixed(2)}</Text>
                      </View>
                    </View>

                    {/* Simple stats bar */}
                    <View style={styles.statsBar}>
                      <View style={styles.statItem}>
                        <IconSymbol name="phone.fill" size={14} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.statText}>{day.calls} {t('earnings.calls').toLowerCase()}</Text>
                      </View>
                      <View style={styles.statItem}>
                        <IconSymbol name="clock.fill" size={14} color="rgba(255,255,255,0.4)" />
                        <Text style={styles.statText}>{day.minutes} {t('header.min')}</Text>
                      </View>
                    </View>

                    {/* Gifts Section */}
                    {hasGifts && (
                      <TouchableOpacity 
                        style={styles.giftsToggle} 
                        onPress={() => toggleDayStats(day.date.toDateString())}
                      >
                        <View style={styles.giftsIconsRow}>
                          <Text style={styles.giftsLabel}>🎁 {t('earnings.gift_minutes').replace('🎁', '').trim()}: {day.giftMinutes} {t('header.min')}</Text>
                          <View style={styles.giftBadges}>
                             {Object.keys(day.giftsReceived).slice(0, 3).map(gid => {
                               const gift = GIFTS.find(g => g.id === gid);
                               return <Text key={gid} style={styles.miniGiftEmoji}>{gift?.emoji || '🎁'}</Text>
                             })}
                             {Object.keys(day.giftsReceived).length > 3 && <Text style={styles.moreGifts}>...</Text>}
                          </View>
                        </View>
                        <IconSymbol name={isExpanded ? "chevron.up" : "chevron.down"} size={16} color="rgba(255,255,255,0.4)" />
                      </TouchableOpacity>
                    )}

                    {isExpanded && (
                      <View style={styles.giftsExpandedContent}>
                        {Object.entries(day.giftsReceived).map(([giftId, info]) => {
                          const gift = GIFTS.find(g => g.id === giftId);
                          return (
                            <View key={giftId} style={styles.expandedGiftRow}>
                              <Text style={styles.expandedGiftEmoji}>{gift?.emoji || '🎁'}</Text>
                              <Text style={styles.expandedGiftText}>
                                {info.count > 1 ? `x${info.count} ` : ''}({info.minutes} {t('header.min')})
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}

                    {/* Likes detail if exists */}
                    {day.likesReceived && day.likesReceived.earnings > 0 && (
                      <View style={styles.likesDetail}>
                        <Text style={styles.likesText}>❤️ {day.likesReceived.story + day.likesReceived.gallery} (+${day.likesReceived.earnings.toFixed(2)})</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            <View style={styles.footerNote}>
                <Text style={styles.rateInfoText}>
                   💰 {t('earnings.rate_info_dynamic', { rate: earningsManager.getRatePerMinute().toFixed(2) })}
                </Text>
                <Text style={styles.noteText}>{t('earnings.calls_counting')}</Text>
                <Text style={styles.noteText}>{t('earnings.realtime_stats')}</Text>
            </View>
          </ScrollView>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  container: {
    height: '92%',
    backgroundColor: '#030e21',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)'
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)'
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff'
  },
  closeBtn: {
    padding: 4
  },
  scrollContent: {
    padding: 20
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    padding: 12,
    marginBottom: 20
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(14, 240, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  weekInfo: {
    alignItems: 'center'
  },
  weekLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700'
  },
  weekDates: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginTop: 2
  },
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14, 240, 255, 0.05)',
    padding: 24,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(14, 240, 255, 0.2)',
    marginBottom: 20
  },
  totalIconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 20
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500'
  },
  totalValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '900',
    marginTop: 4
  },
  rateInfoBox: {
    marginBottom: 24,
    paddingHorizontal: 12
  },
  rateInfoText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center'
  },
  dailyList: {
    gap: 16
  },
  dayCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)'
  },
  activeDayCard: {
    backgroundColor: 'rgba(14, 240, 255, 0.03)',
    borderColor: 'rgba(14, 240, 255, 0.1)'
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  dayName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700'
  },
  dayDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 13,
    marginTop: 2
  },
  dayEarningsWrapper: {
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12
  },
  dayEarningsValue: {
    color: '#0ef0ff',
    fontWeight: '800',
    fontSize: 16
  },
  statsBar: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  statText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13
  },
  giftsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)'
  },
  giftsIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12
  },
  giftsLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600'
  },
  giftBadges: {
    flexDirection: 'row',
    gap: 4
  },
  miniGiftEmoji: {
    fontSize: 14
  },
  moreGifts: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12
  },
  giftsExpandedContent: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 12,
    gap: 8
  },
  expandedGiftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  expandedGiftEmoji: {
    fontSize: 16
  },
  expandedGiftText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13
  },
  likesDetail: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)'
  },
  likesText: {
    color: '#ff4757',
    fontSize: 13,
    fontWeight: '600'
  },
  footerNote: {
    marginTop: 32,
    marginBottom: 40,
    gap: 8,
    alignItems: 'center'
  },
  noteText: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    textAlign: 'center'
  }
});
