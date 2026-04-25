// ========================================
// Emoji Memory — Знайди пари емодзі (React Native)
// ========================================
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

const EMOJI_POOL = ['🐶', '🐱', '🦊', '🐻', '🐼', '🐨', '🦁', '🐸', '🐵', '🦄', '🐢', '🐙', '🦋', '🌺', '🌈', '⭐'];

const shuffleArray = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const generateBoard = () => {
  const selected = shuffleArray(EMOJI_POOL).slice(0, 8);
  return shuffleArray([...selected, ...selected]);
};

export default function EmojiMemory({ gameChannel, isCaller, partnerName }) {
  const { t } = useTranslation();
  const [cards, setCards] = useState(() => isCaller ? generateBoard() : []);
  const [flipped, setFlipped] = useState([]);
  const [matched, setMatched] = useState([]);
  const [moves, setMoves] = useState(0);
  const [isMyTurn, setIsMyTurn] = useState(isCaller);
  const [gameOver, setGameOver] = useState(false);
  const [myPairs, setMyPairs] = useState(0);
  const [theirPairs, setTheirPairs] = useState(0);

  const cardsRef = useRef(cards);
  const matchedRef = useRef(matched);
  const isMyTurnRef = useRef(isMyTurn);
  const flippedRef = useRef(flipped);
  const myPairsRef = useRef(myPairs);

  useEffect(() => { cardsRef.current = cards; }, [cards]);
  useEffect(() => { matchedRef.current = matched; }, [matched]);
  useEffect(() => { isMyTurnRef.current = isMyTurn; }, [isMyTurn]);
  useEffect(() => { flippedRef.current = flipped; }, [flipped]);
  useEffect(() => { myPairsRef.current = myPairs; }, [myPairs]);

  useEffect(() => {
    if (!gameChannel?.isReady) return;
    if (isCaller) {
      gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { board: cardsRef.current, isCallerTurn: true } });
    } else {
      gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { request_sync: true } });
    }
    const unsub = gameChannel.onMessage('game_action', (msg) => {
      if (msg.gameId !== 'memory') return;
      if (msg.data?.request_sync && isCaller) {
        gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { board: cardsRef.current, matched: matchedRef.current, myPairs: theirPairs, theirPairs: myPairsRef.current, isCallerTurn: isMyTurnRef.current ? isCaller : !isCaller } });
        return;
      }
      if (msg.data?.board) {
        setCards(msg.data.board);
        if (msg.data.matched) setMatched(msg.data.matched);
        if (typeof msg.data.myPairs === 'number') setMyPairs(msg.data.myPairs);
        if (typeof msg.data.theirPairs === 'number') setTheirPairs(msg.data.theirPairs);
        if (typeof msg.data.isCallerTurn === 'boolean') setIsMyTurn(isCaller === msg.data.isCallerTurn);
        setFlipped([]); setGameOver(false);
      }
      if (msg.data?.matched && msg.data?.theirPairs !== undefined) {
        setMatched(msg.data.matched); setTheirPairs(msg.data.theirPairs); setFlipped([]);
      }
      if (typeof msg.data?.flip === 'number') {
        const index = msg.data.flip;
        setFlipped(prev => {
          if (prev.includes(index) || prev.length >= 2) return prev;
          const next = [...prev, index];
          if (next.length === 2) {
            setMoves(m => m + 1);
            setTimeout(() => checkMatch(next, false), 805);
          }
          return next;
        });
      }
      if (typeof msg.data?.nextTurnIsCaller === 'boolean') setIsMyTurn(isCaller === msg.data.nextTurnIsCaller);
      if (msg.data?.reset) handlePlayAgain(false);
    });
    return unsub;
  }, [gameChannel?.isReady, isCaller]);

  const checkMatch = useCallback((flippedPair, isMyAction) => {
    const [a, b] = flippedPair;
    const currentCards = cardsRef.current;
    if (!currentCards[a] || !currentCards[b]) return;
    const isMatch = currentCards[a] === currentCards[b];
    if (isMatch) {
      setMatched(prev => {
        if (prev.includes(a) || prev.includes(b)) return prev;
        const nextMatched = [...prev, a, b];
        if (isMyAction) {
          const nextMyPairs = myPairsRef.current + 1;
          setMyPairs(nextMyPairs);
          gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { matched: nextMatched, theirPairs: nextMyPairs } });
        }
        return nextMatched;
      });
    } else {
      if (isMyAction) {
        const nextIsCaller = !isCaller;
        setIsMyTurn(false);
        gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { nextTurnIsCaller: nextIsCaller } });
      }
    }
    setFlipped([]);
  }, [isCaller, gameChannel]);

  const handleCardClick = useCallback((index) => {
    if (!isMyTurnRef.current || flippedRef.current.length >= 2 || flippedRef.current.includes(index) || matchedRef.current.includes(index)) return;
    setFlipped(prev => {
      const next = [...prev, index];
      gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { flip: index } });
      if (next.length === 2) {
        setMoves(m => m + 1);
        setTimeout(() => checkMatch(next, true), 800);
      }
      return next;
    });
  }, [gameChannel, checkMatch]);

  useEffect(() => {
    if (cards.length > 0 && matched.length === cards.length) setGameOver(true);
  }, [matched, cards.length]);

  const handlePlayAgain = useCallback((sendMsg = true) => {
    const newBoard = generateBoard();
    setCards(isCaller ? newBoard : []); setFlipped([]); setMatched([]);
    setMoves(0); setMyPairs(0); setTheirPairs(0);
    setIsMyTurn(isCaller); setGameOver(false);
    if (sendMsg && isCaller) {
      gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { board: newBoard, isCallerTurn: true, myPairs: 0, theirPairs: 0 } });
    } else if (sendMsg && !isCaller) {
      gameChannel.sendMessage({ type: 'game_action', gameId: 'memory', data: { reset: true } });
    }
  }, [gameChannel, isCaller]);

  if (gameOver) {
    const won = myPairs > theirPairs;
    const draw = myPairs === theirPairs;
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultEmoji}>{draw ? '🤝' : won ? '🎉' : '😔'}</Text>
        <Text style={[styles.resultText, { color: draw ? '#f39c12' : won ? '#2ecc71' : '#e74c3c' }]}>
          {draw ? t('games.draw', "It's a Draw!") : won ? t('games.you_win', 'You Win!') : t('games.you_lose', 'You Lose!')}
        </Text>
        <Text style={styles.scoreLine}>{myPairs} : {theirPairs}</Text>
        <Text style={styles.movesLine}>{t('games.total_moves', 'Total moves')}: {moves}</Text>
        <TouchableOpacity onPress={() => handlePlayAgain(true)} style={styles.playAgainBtn}>
          <Text style={styles.playAgainText}>{t('games.play_again', 'Play Again')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.infoRow}>
        <Text style={styles.infoText}>{t('games.you', 'You')}: {myPairs}</Text>
        <Text style={styles.infoText}>{partnerName || t('games.partner', 'Partner')}: {theirPairs}</Text>
      </View>
      <Text style={styles.turnText}>
        {cards.length === 0 ? t('games.waiting_for_partner', 'Waiting for partner...') : (isMyTurn ? t('games.your_turn', 'Your turn') : t('games.their_turn', "Partner's turn"))}
      </Text>
      <View style={styles.grid}>
        {cards.map((emoji, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.card, flipped.includes(i) && styles.cardFlipped, matched.includes(i) && styles.cardMatched]}
            onPress={() => handleCardClick(i)}
            disabled={!isMyTurn || flipped.length >= 2 || matched.includes(i)}
            activeOpacity={0.7}
          >
            <Text style={styles.cardEmoji}>{(flipped.includes(i) || matched.includes(i)) ? emoji : '❓'}</Text>
          </TouchableOpacity>
        ))}
        {cards.length === 0 && <Text style={styles.waitingIcon}>⌛</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 8 },
  infoText: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
  turnText: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, maxWidth: 260, marginBottom: 12 },
  card: {
    width: 58, height: 58, borderRadius: 8,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  cardFlipped: { backgroundColor: 'rgba(52,152,219,0.15)', borderColor: 'rgba(52,152,219,0.3)' },
  cardMatched: { backgroundColor: 'rgba(46,204,113,0.15)', borderColor: 'rgba(46,204,113,0.3)', opacity: 0.7 },
  cardEmoji: { fontSize: 24 },
  waitingIcon: { fontSize: 40, opacity: 0.3, marginVertical: 60 },
  resultContainer: { alignItems: 'center', paddingVertical: 20 },
  resultEmoji: { fontSize: 56, marginBottom: 12 },
  resultText: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  scoreLine: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 4 },
  movesLine: { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 },
  playAgainBtn: { backgroundColor: '#3498db', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  playAgainText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
