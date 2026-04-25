// ========================================
// Tic Tac Toe — Хрестики-Нулики (React Native)
// ========================================
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

const WINNING_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

const checkWinner = (board) => {
  for (const [a, b, c] of WINNING_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], line: [a, b, c] };
    }
  }
  if (board.every(cell => cell !== null)) return { winner: 'draw', line: [] };
  return null;
};

export default function TicTacToe({ gameChannel, isCaller, partnerName, onClose }) {
  const { t } = useTranslation();
  const [board, setBoard] = useState(Array(9).fill(null));
  const [isMyTurn, setIsMyTurn] = useState(isCaller);
  const mySymbol = isCaller ? 'X' : 'O';
  const theirSymbol = isCaller ? 'O' : 'X';
  const [result, setResult] = useState(null);
  const [winLine, setWinLine] = useState([]);

  useEffect(() => {
    if (!gameChannel?.isReady) return;
    const unsub = gameChannel.onMessage('game_action', (msg) => {
      if (msg.gameId === 'ttt' && typeof msg.data?.cell === 'number') {
        setBoard(prev => {
          const next = [...prev];
          if (next[msg.data.cell] === null) next[msg.data.cell] = theirSymbol;
          return next;
        });
        setIsMyTurn(true);
      }
      if (msg.gameId === 'ttt' && msg.data?.reset) {
        setBoard(Array(9).fill(null)); setIsMyTurn(isCaller);
        setResult(null); setWinLine([]);
      }
    });
    return unsub;
  }, [gameChannel, theirSymbol, isCaller]);

  useEffect(() => {
    const res = checkWinner(board);
    if (res) { setResult(res.winner); setWinLine(res.line || []); }
  }, [board]);

  const handleCellClick = useCallback((index) => {
    if (!isMyTurn || board[index] !== null || result) return;
    const next = [...board];
    next[index] = mySymbol;
    setBoard(next);
    setIsMyTurn(false);
    gameChannel.sendMessage({ type: 'game_action', gameId: 'ttt', data: { cell: index } });
  }, [isMyTurn, board, result, mySymbol, gameChannel]);

  const handlePlayAgain = useCallback(() => {
    setBoard(Array(9).fill(null)); setIsMyTurn(isCaller);
    setResult(null); setWinLine([]);
    gameChannel.sendMessage({ type: 'game_action', gameId: 'ttt', data: { reset: true } });
  }, [gameChannel, isCaller]);

  if (result) {
    const won = result === mySymbol;
    const draw = result === 'draw';
    return (
      <View style={styles.resultContainer}>
        <Text style={styles.resultEmoji}>{draw ? '🤝' : won ? '🎉' : '😔'}</Text>
        <Text style={[styles.resultText, { color: draw ? '#f39c12' : won ? '#2ecc71' : '#e74c3c' }]}>
          {draw ? t('games.draw', 'Draw!') : won ? t('games.you_win', 'You Win!') : t('games.you_lose', 'You Lose!')}
        </Text>
        <TouchableOpacity onPress={handlePlayAgain} style={styles.playAgainBtn}>
          <Text style={styles.playAgainText}>{t('games.play_again', 'Play Again')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.statusText}>
        {isMyTurn ? t('games.your_turn', 'Your turn') + ` (${mySymbol})` : t('games.their_turn', "Partner's turn") + ` (${theirSymbol})`}
      </Text>
      <View style={styles.board}>
        {board.map((cell, i) => (
          <TouchableOpacity
            key={i}
            style={[
              styles.cell,
              cell === 'X' && styles.cellX,
              cell === 'O' && styles.cellO,
              winLine.includes(i) && styles.cellWinning,
            ]}
            onPress={() => handleCellClick(i)}
            disabled={!isMyTurn || cell !== null}
            activeOpacity={0.7}
          >
            <Text style={[styles.cellText, cell === 'X' ? styles.textX : styles.textO]}>{cell}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', width: '100%' },
  statusText: { fontSize: 14, color: 'rgba(255,255,255,0.7)', marginBottom: 12, fontWeight: '500' },
  board: {
    flexDirection: 'row', flexWrap: 'wrap',
    width: 210, gap: 6, marginBottom: 16,
  },
  cell: {
    width: 64, height: 64, borderRadius: 10,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center', justifyContent: 'center',
  },
  cellX: {},
  cellO: {},
  cellWinning: { backgroundColor: 'rgba(46,204,113,0.2)', borderColor: '#2ecc71' },
  cellText: { fontSize: 30, fontWeight: '700' },
  textX: { color: '#3498db' },
  textO: { color: '#e74c3c' },
  resultContainer: { alignItems: 'center', paddingVertical: 20 },
  resultEmoji: { fontSize: 56, marginBottom: 12 },
  resultText: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  playAgainBtn: { backgroundColor: '#3498db', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  playAgainText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
