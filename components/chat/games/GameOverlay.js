// ========================================
// GameOverlay — Active Game Container (React Native)
// ========================================
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { GAMES } from './GameMenuPanel';
import RockPaperScissors from './RockPaperScissors';
import TicTacToe from './TicTacToe';
import WouldYouRather from './WouldYouRather';
import TruthOrDare from './TruthOrDare';
import EmojiMemory from './EmojiMemory';
import Quiz from './Quiz';
import WhoIsTheKiller from './WhoIsTheKiller';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const GAME_COMPONENTS = {
  rps: RockPaperScissors,
  ttt: TicTacToe,
  wyr: WouldYouRather,
  tod: TruthOrDare,
  memory: EmojiMemory,
  quiz: Quiz,
  killer: WhoIsTheKiller,
};

export default function GameOverlay({
  gameId,
  gameChannel,
  isCaller,
  onClose,
  partnerName,
}) {
  const { t } = useTranslation();
  const game = GAMES.find(g => g.id === gameId);
  const GameComponent = GAME_COMPONENTS[gameId];

  if (!game || !GameComponent) return null;

  const handleClose = () => {
    if (gameChannel?.isReady) {
      gameChannel.sendMessage({ type: 'game_end' });
    }
    onClose();
  };

  return (
    <View style={styles.backdrop}>
      <View style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {game.emoji} {t(game.nameKey, game.nameDefault)}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.bodyScroll}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <GameComponent
            gameChannel={gameChannel}
            isCaller={isCaller}
            partnerName={partnerName}
            onClose={handleClose}
            gameId={gameId}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  overlay: {
    backgroundColor: '#0f172a',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    width: '92%',
    maxWidth: 400,
    maxHeight: SCREEN_HEIGHT * 0.75,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  title: { color: '#fff', fontSize: 17, fontWeight: '700' },
  closeBtn: {
    backgroundColor: 'rgba(231,76,60,0.4)',
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyScroll: { flexGrow: 0 },
  body: {
    padding: 20,
    paddingBottom: 5,
    alignItems: 'center',
    width: '100%',
  },
});
