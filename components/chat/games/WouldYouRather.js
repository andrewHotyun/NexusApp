// ========================================
// Would You Rather — Що б ти обрав? (React Native)
// ========================================
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function WouldYouRather({ gameChannel, isCaller, partnerName }) {
  const { t } = useTranslation();

  const questions = useMemo(() => {
    return t('wyr_data', { returnObjects: true }) || [];
  }, [t]);

  const [questionIndex, setQuestionIndex] = useState(() => Math.floor(Math.random() * (questions.length || 1)));
  const [myChoice, setMyChoice] = useState(null);
  const [theirChoice, setTheirChoice] = useState(null);
  
  const question = questions[questionIndex];

  useEffect(() => {
    if (!gameChannel?.isReady) return;
    if (isCaller) {
      gameChannel.sendMessage({ type: 'game_action', gameId: 'wyr', data: { questionIndex } });
    } else {
      gameChannel.sendMessage({ type: 'game_action', gameId: 'wyr', data: { request_sync: true } });
    }
    const unsub = gameChannel.onMessage('game_action', (msg) => {
      if (msg.gameId !== 'wyr') return;
      if (msg.data?.request_sync && isCaller) {
        gameChannel.sendMessage({ type: 'game_action', gameId: 'wyr', data: { questionIndex } });
        return;
      }
      if (typeof msg.data?.questionIndex === 'number' && msg.data.questionIndex !== questionIndex) {
        setQuestionIndex(msg.data.questionIndex);
        setMyChoice(null); setTheirChoice(null);
      }
      if (msg.data?.choice) setTheirChoice(msg.data.choice);
    });
    return unsub;
  }, [gameChannel?.isReady, isCaller, questionIndex]);

  const handleChoice = useCallback((choice) => {
    if (myChoice) return;
    setMyChoice(choice);
    gameChannel.sendMessage({ type: 'game_action', gameId: 'wyr', data: { choice } });
  }, [myChoice, gameChannel]);

  const handleNext = useCallback(() => {
    const nextIdx = (questionIndex + 1) % questions.length;
    setQuestionIndex(nextIdx); setMyChoice(null); setTheirChoice(null);
    gameChannel.sendMessage({ type: 'game_action', gameId: 'wyr', data: { questionIndex: nextIdx } });
  }, [questionIndex, gameChannel, questions.length]);

  if (!question) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{t('games.would_you_rather', 'Would you rather...')}</Text>
      <View style={styles.options}>
        <TouchableOpacity
          style={[styles.option, myChoice === 'a' && styles.optionSelected, theirChoice === 'a' && styles.optionPartner]}
          onPress={() => handleChoice('a')}
          disabled={!!myChoice}
        >
          <Text style={styles.optionText}>{question.a}</Text>
          {myChoice === 'a' && <Text style={styles.optionLabel}>👈 {t('games.you', 'You')}</Text>}
          {theirChoice === 'a' && <Text style={styles.optionLabel}>👈 {partnerName || t('games.partner', 'Partner')}</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.option, myChoice === 'b' && styles.optionSelected, theirChoice === 'b' && styles.optionPartner]}
          onPress={() => handleChoice('b')}
          disabled={!!myChoice}
        >
          <Text style={styles.optionText}>{question.b}</Text>
          {myChoice === 'b' && <Text style={styles.optionLabel}>👈 {t('games.you', 'You')}</Text>}
          {theirChoice === 'b' && <Text style={styles.optionLabel}>👈 {partnerName || t('games.partner', 'Partner')}</Text>}
        </TouchableOpacity>
      </View>
      {myChoice && theirChoice && (
        <TouchableOpacity onPress={handleNext} style={styles.nextBtn}>
          <Text style={styles.nextText}>{t('games.next_question', 'Next Question')} →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  options: { gap: 10, marginBottom: 16, width: '100%' },
  option: {
    padding: 14, borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  optionSelected: { borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.25)' },
  optionPartner: { borderColor: '#e74c3c' },
  optionText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  optionLabel: { fontSize: 11, marginTop: 6, color: 'rgba(255,255,255,0.4)' },
  nextBtn: {
    backgroundColor: 'rgba(52,152,219,0.2)', borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.3)', paddingHorizontal: 20,
    paddingVertical: 8, borderRadius: 8,
  },
  nextText: { color: '#3498db', fontSize: 13, fontWeight: '500' },
});
