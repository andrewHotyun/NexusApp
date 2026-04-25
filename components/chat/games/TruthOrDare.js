// ========================================
// Truth or Dare — Правда чи Дія (React Native)
// ========================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function TruthOrDare({ gameChannel, isCaller, partnerName }) {
  const { t } = useTranslation();
  
  const truths = useMemo(() => t('tod_data.truths', { returnObjects: true }) || [], [t]);
  const dares = useMemo(() => t('tod_data.dares', { returnObjects: true }) || [], [t]);

  const [currentCard, setCurrentCard] = useState(null);
  const [usedTruths, setUsedTruths] = useState([]);
  const [usedDares, setUsedDares] = useState([]);

  useEffect(() => {
    if (!gameChannel?.isReady) return;
    const unsub = gameChannel.onMessage('game_action', (msg) => {
      if (msg.gameId === 'tod' && msg.data?.card) setCurrentCard(msg.data.card);
    });
    return unsub;
  }, [gameChannel]);

  const pickRandom = useCallback((type) => {
    const pool = type === 'truth' ? truths : dares;
    const used = type === 'truth' ? usedTruths : usedDares;
    const available = pool.map((_, i) => i).filter(i => !used.includes(i));
    let index;
    if (available.length === 0) {
      if (type === 'truth') setUsedTruths([]); else setUsedDares([]);
      index = Math.floor(Math.random() * pool.length);
    } else {
      index = available[Math.floor(Math.random() * available.length)];
    }
    if (type === 'truth') setUsedTruths(prev => [...prev, index]);
    else setUsedDares(prev => [...prev, index]);
    
    const text = pool[index];
    const card = { type, text, index };
    setCurrentCard(card);
    gameChannel.sendMessage({ type: 'game_action', gameId: 'tod', data: { card } });
  }, [usedTruths, usedDares, truths, dares, gameChannel]);

  return (
    <View style={styles.container}>
      {!currentCard ? (
        <>
          <Text style={styles.hint}>{t('games.choose_tod', 'Choose one!')}</Text>
          <View style={styles.selectionRow}>
            <TouchableOpacity style={[styles.todBtn, styles.truthBtn]} onPress={() => pickRandom('truth')}>
              <Text style={styles.todBtnText}>🤫 {t('games.truth', 'Truth')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.todBtn, styles.dareBtn]} onPress={() => pickRandom('dare')}>
              <Text style={styles.todBtnText}>🔥 {t('games.dare', 'Dare')}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={[styles.typeBadge, currentCard.type === 'truth' ? styles.truthColor : styles.dareColor]}>
              {currentCard.type === 'truth' ? `🤫 ${t('games.truth', 'Truth')}` : `🔥 ${t('games.dare', 'Dare')}`}
            </Text>
            <Text style={styles.cardText}>{currentCard.text}</Text>
          </View>
          <View style={styles.selectionRow}>
            <TouchableOpacity style={[styles.todBtn, styles.truthBtn]} onPress={() => pickRandom('truth')}>
              <Text style={styles.todBtnText}>🤫 {t('games.truth', 'Truth')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.todBtn, styles.dareBtn]} onPress={() => pickRandom('dare')}>
              <Text style={styles.todBtnText}>🔥 {t('games.dare', 'Dare')}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  hint: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 16 },
  selectionRow: { flexDirection: 'row', gap: 12, justifyContent: 'center', marginBottom: 16 },
  todBtn: {
    paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  truthBtn: { borderColor: 'rgba(52,152,219,0.3)' },
  dareBtn: { borderColor: 'rgba(231,76,60,0.3)' },
  todBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  card: {
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)', borderRadius: 14,
    padding: 20, marginBottom: 16, width: '100%',
  },
  typeBadge: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: '700', marginBottom: 10 },
  truthColor: { color: '#3498db' },
  dareColor: { color: '#e74c3c' },
  cardText: { fontSize: 16, lineHeight: 24, color: 'rgba(255,255,255,0.9)' },
});
