// ========================================
// Rock Paper Scissors — Камінь Ножиці Папір (React Native)
// ========================================
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

const CHOICES = [
  { id: 'rock', emoji: '✊' },
  { id: 'paper', emoji: '✋' },
  { id: 'scissors', emoji: '✌️' },
];

const getResult = (my, their) => {
  if (my === their) return 'draw';
  if (
    (my === 'rock' && their === 'scissors') ||
    (my === 'paper' && their === 'rock') ||
    (my === 'scissors' && their === 'paper')
  ) return 'win';
  return 'lose';
};

export default function RockPaperScissors({ gameChannel, isCaller, partnerName, onClose }) {
  const { t } = useTranslation();
  const [round, setRound] = useState(1);
  const [myScore, setMyScore] = useState(0);
  const [theirScore, setTheirScore] = useState(0);
  const [myChoice, setMyChoice] = useState(null);
  const [theirChoice, setTheirChoice] = useState(null);
  const [roundResult, setRoundResult] = useState(null);
  const [gameOver, setGameOver] = useState(false);

  useEffect(() => {
    if (!gameChannel?.isReady) return;
    const unsub = gameChannel.onMessage('game_action', (msg) => {
      if (msg.gameId === 'rps' && msg.data?.choice) {
        setTheirChoice(msg.data.choice);
      }
      if (msg.gameId === 'rps' && msg.data?.reset) {
        setRound(1); setMyScore(0); setTheirScore(0);
        setMyChoice(null); setTheirChoice(null);
        setRoundResult(null); setGameOver(false);
      }
    });
    return unsub;
  }, [gameChannel]);

  useEffect(() => {
    if (!myChoice || !theirChoice) return;
    const result = getResult(myChoice, theirChoice);
    setRoundResult(result);
    const newMy = result === 'win' ? myScore + 1 : myScore;
    const newTheir = result === 'lose' ? theirScore + 1 : theirScore;
    setMyScore(newMy);
    setTheirScore(newTheir);
    if (newMy >= 2 || newTheir >= 2) {
      setTimeout(() => setGameOver(true), 1500);
    } else {
      setTimeout(() => {
        setMyChoice(null); setTheirChoice(null);
        setRoundResult(null); setRound(r => r + 1);
      }, 2000);
    }
  }, [myChoice, theirChoice]);

  const handleChoice = useCallback((choiceId) => {
    if (myChoice) return;
    setMyChoice(choiceId);
    gameChannel.sendMessage({ type: 'game_action', gameId: 'rps', data: { choice: choiceId } });
  }, [myChoice, gameChannel]);

  const handlePlayAgain = useCallback(() => {
    setRound(1); setMyScore(0); setTheirScore(0);
    setMyChoice(null); setTheirChoice(null);
    setRoundResult(null); setGameOver(false);
    gameChannel.sendMessage({ type: 'game_action', gameId: 'rps', data: { reset: true } });
  }, [gameChannel]);

  if (gameOver) {
    const won = myScore > theirScore;
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultEmoji}>{won ? '🎉' : '😔'}</Text>
        <Text style={[styles.resultText, { color: won ? '#2ecc71' : '#e74c3c' }]}>
          {won ? t('games.you_win', 'You Win!') : t('games.you_lose', 'You Lose!')}
        </Text>
        <Text style={styles.resultSub}>{myScore} : {theirScore}</Text>
        <TouchableOpacity onPress={handlePlayAgain} style={styles.playAgainBtn}>
          <Text style={styles.playAgainText}>{t('games.play_again', 'Play Again')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.roundText}>{t('games.round', 'Round')} {round}/3</Text>
      <Text style={styles.scoreText}>
        {t('games.you', 'You')} {myScore} : {theirScore} {partnerName || t('games.partner', 'Partner')}
      </Text>

      {roundResult && myChoice && theirChoice ? (
        <>
          <View style={styles.vsRow}>
            <View style={styles.player}>
              <Text style={styles.playerChoice}>{CHOICES.find(c => c.id === myChoice)?.emoji}</Text>
              <Text style={styles.playerName}>{t('games.you', 'You')}</Text>
            </View>
            <Text style={styles.vsDivider}>VS</Text>
            <View style={styles.player}>
              <Text style={styles.playerChoice}>{CHOICES.find(c => c.id === theirChoice)?.emoji}</Text>
              <Text style={styles.playerName}>{partnerName || t('games.partner', 'Partner')}</Text>
            </View>
          </View>
          <View style={[styles.roundResultBadge, roundResult === 'win' ? styles.winBg : roundResult === 'lose' ? styles.loseBg : styles.drawBg]}>
            <Text style={[styles.roundResultText, roundResult === 'win' ? styles.winColor : roundResult === 'lose' ? styles.loseColor : styles.drawColor]}>
              {roundResult === 'win' && t('games.round_win', 'You win this round!')}
              {roundResult === 'lose' && t('games.round_lose', 'They win this round!')}
              {roundResult === 'draw' && t('games.round_draw', 'Draw!')}
            </Text>
          </View>
        </>
      ) : (
        <>
          <View style={styles.choicesRow}>
            {CHOICES.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[styles.choiceBtn, myChoice === c.id && styles.choiceBtnSelected]}
                onPress={() => handleChoice(c.id)}
                disabled={!!myChoice}
                activeOpacity={0.7}
              >
                <Text style={styles.choiceEmoji}>{c.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {myChoice && !theirChoice && (
            <Text style={styles.waitingText}>{t('games.waiting_choice', 'Waiting for partner...')}</Text>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  roundText: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 },
  scoreText: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.8)', marginBottom: 16 },
  choicesRow: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
  choiceBtn: {
    width: 72, height: 72, borderRadius: 16,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  choiceBtnSelected: { borderColor: '#3498db', backgroundColor: 'rgba(52,152,219,0.3)' },
  choiceEmoji: { fontSize: 36 },
  vsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16, marginVertical: 16 },
  player: { alignItems: 'center' },
  playerChoice: { fontSize: 48, marginBottom: 4 },
  playerName: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  vsDivider: { fontSize: 18, fontWeight: '700', color: 'rgba(255,255,255,0.3)' },
  roundResultBadge: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginTop: 8 },
  roundResultText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  winBg: { backgroundColor: 'rgba(46,204,113,0.15)' },
  loseBg: { backgroundColor: 'rgba(231,76,60,0.15)' },
  drawBg: { backgroundColor: 'rgba(243,156,18,0.15)' },
  winColor: { color: '#2ecc71' },
  loseColor: { color: '#e74c3c' },
  drawColor: { color: '#f39c12' },
  waitingText: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 8 },
  resultContainer: { alignItems: 'center', paddingVertical: 20 },
  resultEmoji: { fontSize: 56, marginBottom: 12 },
  resultText: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  resultSub: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 16 },
  playAgainBtn: { backgroundColor: '#3498db', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  playAgainText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
