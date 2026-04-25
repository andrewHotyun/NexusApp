// ========================================
// GameMenuPanel — Game Selection Menu (React Native)
// ========================================
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

const GAMES = [
  { id: 'rps', emoji: '✊', nameKey: 'games.rps_name', descKey: 'games.rps_desc', nameDefault: 'Rock Paper Scissors', descDefault: 'Best of 3 rounds' },
  { id: 'ttt', emoji: '❌', nameKey: 'games.ttt_name', descKey: 'games.ttt_desc', nameDefault: 'Tic Tac Toe', descDefault: 'Classic 3×3 grid' },
  { id: 'wyr', emoji: '🤔', nameKey: 'games.wyr_name', descKey: 'games.wyr_desc', nameDefault: 'Would You Rather', descDefault: 'Choose between two options' },
  { id: 'tod', emoji: '🎲', nameKey: 'games.tod_name', descKey: 'games.tod_desc', nameDefault: 'Truth or Dare', descDefault: 'Random fun questions' },
  { id: 'memory', emoji: '🧠', nameKey: 'games.memory_name', descKey: 'games.memory_desc', nameDefault: 'Emoji Memory', descDefault: 'Find matching pairs' },
  { id: 'quiz', emoji: '❓', nameKey: 'games.quiz_name', descKey: 'games.quiz_desc', nameDefault: 'Quiz', descDefault: 'Harry Potter & Lord of the Rings' },
  { id: 'killer', emoji: '🕵️', nameKey: 'games.killer_name', descKey: 'games.killer_desc', nameDefault: 'Who is the Killer?', descDefault: 'Solve the mystery with clues' },
  // Web-only games (locked on mobile)
  { id: 'battleship', emoji: '🚢', nameKey: 'games.battleship_name', descKey: 'games.battleship_desc', nameDefault: 'Battleship', descDefault: 'Classic 10×10 sea battle', locked: true },
  { id: 'find_diff', emoji: '🔍', nameKey: 'games.find_diff_name', descKey: 'games.find_diff_desc', nameDefault: 'Find Differences', descDefault: 'Who finds all 10 first?', locked: true },
  { id: 'pong', emoji: '🏓', nameKey: 'games.pong_name', descKey: 'games.pong_desc', nameDefault: 'Ping Pong', descDefault: 'Classic arcade battle', locked: true },
  { id: 'melody', emoji: '🎵', nameKey: 'games.melody_name', descKey: 'games.melody_desc', nameDefault: 'Guess the Melody', descDefault: 'Listen and identify the song', locked: true },
];

export { GAMES };

export default function GameMenuPanel({
  isOpen,
  onClose,
  onSelectGame,
  gameChannel,
  incomingInvite,
  onAcceptInvite,
  onDeclineInvite,
  partnerName,
}) {
  const { t } = useTranslation();
  const [waitingForGame, setWaitingForGame] = useState(null);

  // Listen for invite responses
  useEffect(() => {
    if (!gameChannel?.isReady || !waitingForGame) return;
    const unsub = gameChannel.onMessage('game_accept', (msg) => {
      if (msg.gameId === waitingForGame) {
        setWaitingForGame(null);
        onSelectGame(waitingForGame);
      }
    });
    const unsub2 = gameChannel.onMessage('game_decline', () => {
      setWaitingForGame(null);
    });
    return () => { unsub(); unsub2(); };
  }, [gameChannel, waitingForGame, onSelectGame]);

  const handleSelectGame = useCallback((gameId) => {
    if (!gameChannel?.isReady) return;
    gameChannel.sendMessage({ type: 'game_invite', gameId });
    setWaitingForGame(gameId);
  }, [gameChannel]);

  const handleCancel = useCallback(() => {
    if (gameChannel?.isReady && waitingForGame) {
      gameChannel.sendMessage({ type: 'game_cancel' });
    }
    setWaitingForGame(null);
  }, [gameChannel, waitingForGame]);

  return (
    <>
      {/* Game Selection Menu */}
      <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.panel}>
            <View style={styles.header}>
              <Text style={styles.title}>🎮 {t('games.title', 'Mini Games')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {waitingForGame ? (
              <View style={styles.waitingContainer}>
                <ActivityIndicator size="small" color="#3498db" />
                <Text style={styles.waitingText}>{t('games.waiting_partner', 'Waiting for partner...')}</Text>
                <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn}>
                  <Text style={styles.cancelText}>{t('common.cancel', 'Cancel')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.list}>
                {GAMES.map(game => (
                  <TouchableOpacity
                    key={game.id}
                    style={[styles.item, game.locked && styles.itemLocked]}
                    onPress={() => !game.locked && handleSelectGame(game.id)}
                    activeOpacity={game.locked ? 1 : 0.7}
                    disabled={game.locked}
                  >
                    <Text style={[styles.itemEmoji, game.locked && styles.itemEmojiLocked]}>{game.emoji}</Text>
                    <View style={styles.itemInfo}>
                      <Text style={[styles.itemName, game.locked && styles.itemNameLocked]}>{t(game.nameKey, game.nameDefault)}</Text>
                      {game.locked ? (
                        <View style={styles.lockedRow}>
                          <Ionicons name="lock-closed" size={10} color="rgba(255,255,255,0.3)" />
                          <Text style={styles.lockedText}>{t('games.web_only', 'Web version only')}</Text>
                        </View>
                      ) : (
                        <Text style={styles.itemDesc}>{t(game.descKey, game.descDefault)}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* Incoming Invite Overlay */}
      {incomingInvite && (() => {
        const game = GAMES.find(g => g.id === incomingInvite.gameId);
        if (!game) return null;
        return (
          <Modal visible={true} transparent animationType="slide">
            <View style={styles.inviteBackdrop}>
              <View style={styles.inviteCard}>
                <Text style={styles.inviteEmoji}>{game.emoji}</Text>
                <Text style={styles.inviteText}>
                  {partnerName || 'Partner'} {t('games.invites_you', 'invites you to play')}
                </Text>
                <Text style={styles.inviteName}>{t(game.nameKey, game.nameDefault)}</Text>
                <View style={styles.inviteActions}>
                  <TouchableOpacity onPress={onAcceptInvite} style={styles.acceptBtn}>
                    <Text style={styles.acceptText}>{t('games.play', 'Play!')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={onDeclineInvite} style={styles.declineBtn}>
                    <Text style={styles.declineText}>{t('games.decline', 'No thanks')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        );
      })()}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    backgroundColor: 'rgba(15, 15, 30, 0.97)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    width: '85%',
    maxWidth: 360,
    maxHeight: '70%',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 16, fontWeight: '600' },
  closeBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    width: '48%',
  },
  itemEmoji: { fontSize: 24 },
  itemInfo: { flex: 1 },
  itemName: { color: '#fff', fontSize: 13, fontWeight: '600' },
  itemDesc: { color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 2 },
  itemLocked: { opacity: 0.45 },
  itemEmojiLocked: { opacity: 0.6 },
  itemNameLocked: { color: 'rgba(255,255,255,0.5)' },
  lockedRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  lockedText: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontStyle: 'italic' },
  waitingContainer: { alignItems: 'center', paddingVertical: 30 },
  waitingText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 12 },
  cancelBtn: {
    marginTop: 16,
    backgroundColor: 'rgba(231,76,60,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.3)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  cancelText: { color: '#e74c3c', fontSize: 12, fontWeight: '500' },
  inviteBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteCard: {
    backgroundColor: 'rgba(15,15,30,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(52,152,219,0.3)',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    minWidth: 260,
  },
  inviteEmoji: { fontSize: 48, marginBottom: 8 },
  inviteText: { color: '#fff', fontSize: 14, fontWeight: '600', marginBottom: 4 },
  inviteName: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginBottom: 16 },
  inviteActions: { flexDirection: 'row', gap: 10 },
  acceptBtn: {
    backgroundColor: '#27ae60',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  acceptText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  declineBtn: {
    backgroundColor: 'rgba(231,76,60,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(231,76,60,0.4)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  declineText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
