// ========================================
// Who Is The Killer — Хто вбивця? (React Native)
// ========================================
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useTranslation } from 'react-i18next';

const CASE_IMAGES = {
  case1: require('../../../assets/images/games/killer/case1.png'),
  case2: require('../../../assets/images/games/killer/case2.png'),
  case3: require('../../../assets/images/games/killer/case3.png'),
  case4: require('../../../assets/images/games/killer/case4.png'),
  case5: require('../../../assets/images/games/killer/case5.png'),
  case6: require('../../../assets/images/games/killer/case6.png'),
  case7: require('../../../assets/images/games/killer/case7.png'),
  case8: require('../../../assets/images/games/killer/case8.png'),
  case9: require('../../../assets/images/games/killer/case9.png'),
  case10: require('../../../assets/images/games/killer/case10.png'),
  case11: require('../../../assets/images/games/killer/case11.png'),
  case12: require('../../../assets/images/games/killer/case12.png'),
  case13: require('../../../assets/images/games/killer/case13.png'),
  case14: require('../../../assets/images/games/killer/case14.png'),
  case15: require('../../../assets/images/games/killer/case15.png'),
};

const CASES_CONFIG = [
  { id: 'case1', correctIdx: 3, icons: ['🧑‍💼', '🤵', '👨‍🍳', '🧹'] },
  { id: 'case2', correctIdx: 2, icons: ['👨‍🍳', '👩', '🧊', '🍸'] },
  { id: 'case3', correctIdx: 2, icons: ['🧹', '🔪', '🚿', '🚗'] },
  { id: 'case4', correctIdx: 3, icons: ['✈️', '👩‍✈️', '💼', '👨‍⚕️'] },
  { id: 'case5', correctIdx: 3, icons: ['🎬', '🎭', '💃', '💡'] },
  { id: 'case6', correctIdx: 2, icons: ['👨‍✈️', '🤵', '📷', '🍹'] },
  { id: 'case7', correctIdx: 3, icons: ['👤', '🏠', '🤝', '🧘'] },
  { id: 'case8', correctIdx: 0, icons: ['👨‍🔬', '👨‍💼', '🤵', '🧑‍🔬'] },
  { id: 'case9', correctIdx: 1, icons: ['🎩', '🤵', '👨‍🍳', '🧹'] },
  { id: 'case10', correctIdx: 2, icons: ['🔗', '⛓️', '⚖️', '🧹'] },
  { id: 'case11', correctIdx: 0, icons: ['👩', '✂️', '👨‍🍳', '🧘'] },
  { id: 'case12', correctIdx: 2, icons: ['👩', '🤝', '🧹', '👨‍🌾'] },
  { id: 'case13', correctIdx: 2, icons: ['💼', '🎨', '⚡', '🧹'] },
  { id: 'case14', correctIdx: 1, icons: ['👩', '📝', '🤝', '🧘'] },
  { id: 'case15', correctIdx: 0, icons: ['🤵', '👮', '🦹', '🚶'] },
];

export default function WhoIsTheKiller({ gameChannel, isCaller, partnerName }) {
  const { t } = useTranslation();
  
  const cases = useMemo(() => {
    const data = t('killer_game.cases', { returnObjects: true });
    return Array.isArray(data) ? data : [];
  }, [t]);

  const TOTAL = cases.length;

  const [state, setState] = useState('intro');
  const [round, setRound] = useState(0);
  const [myGuess, setMyGuess] = useState(null);
  const [pGuess, setPGuess] = useState(null);
  const [scores, setScores] = useState({ me: 0, partner: 0 });

  useEffect(() => {
    if (!gameChannel?.isReady) return;
    const unsub = gameChannel.onMessage('game_action', (msg) => {
      if (msg.gameId !== 'killer_puzzle') return;
      const { type, guess, round: r } = msg.data;
      if (type === 'start_game') { setState('playing'); setRound(0); setMyGuess(null); setPGuess(null); setScores({ me: 0, partner: 0 }); }
      if (type === 'submit_guess') setPGuess(guess);
      if (type === 'next_round') { if (r >= TOTAL) setState('finished'); else { setRound(r); setMyGuess(null); setPGuess(null); setState('playing'); } }
    });
    return unsub;
  }, [gameChannel]);

  useEffect(() => {
    if (myGuess !== null && pGuess !== null && state === 'playing') {
      const c = CASES_CONFIG[round];
      setScores(prev => ({
        me: prev.me + (myGuess === c.correctIdx ? 1 : 0),
        partner: prev.partner + (pGuess === c.correctIdx ? 1 : 0),
      }));
      setState('round_result');
    }
  }, [myGuess, pGuess, state, round]);

  const start = () => { setState('playing'); gameChannel.sendMessage({ type: 'game_action', gameId: 'killer_puzzle', data: { type: 'start_game' } }); };
  const guess = (i) => { setMyGuess(i); gameChannel.sendMessage({ type: 'game_action', gameId: 'killer_puzzle', data: { type: 'submit_guess', guess: i } }); };
  const next = () => {
    const n = round + 1;
    if (n >= TOTAL) setState('finished'); else { setRound(n); setMyGuess(null); setPGuess(null); setState('playing'); }
    gameChannel.sendMessage({ type: 'game_action', gameId: 'killer_puzzle', data: { type: 'next_round', round: n } });
  };

  const pName = partnerName || 'Partner';

  if (state === 'intro') return (
    <View style={s.center}>
      <Text style={s.introTitle}>🕵️‍♂️ {t('killer_game.intro_title', 'Who is the Murderer?')}</Text>
      <Text style={s.introSub}>{t('killer_game.intro_desc', 'Solve mysteries together.')}</Text>
      <TouchableOpacity onPress={start} style={s.primaryBtn}><Text style={s.primaryText}>{t('killer_game.start_btn', 'Start Investigation')}</Text></TouchableOpacity>
    </View>
  );

  if (state === 'finished') {
    const w = scores.me > scores.partner, d = scores.me === scores.partner;
    return (
      <View style={s.center}>
        <Text style={s.introTitle}>{t('killer_game.finished_title', 'Case Closed!')}</Text>
        <View style={s.scoresRow}>
          <View style={s.scoreBox}><Text style={s.scoreLabel}>{t('games.you', 'You')}</Text><Text style={s.scoreNum}>{scores.me}</Text></View>
          <View style={s.scoreBox}><Text style={s.scoreLabel}>{pName}</Text><Text style={s.scoreNum}>{scores.partner}</Text></View>
        </View>
        <Text style={[s.winnerText, { color: d ? '#f39c12' : w ? '#2ecc71' : '#e74c3c' }]}>
          {d ? t('killer_game.tie', 'Tie!') : w ? t('killer_game.you_won', 'You won!') : t('killer_game.partner_won', `${pName} won!`, { name: pName })}
        </Text>
        <TouchableOpacity onPress={start} style={s.primaryBtn}><Text style={s.primaryText}>{t('killer_game.play_again', 'Play Again')}</Text></TouchableOpacity>
      </View>
    );
  }

  const caseT = cases[round] || {};
  const cfg = CASES_CONFIG[round];
  const suspects = caseT.suspects || ['A', 'B', 'C', 'D'];

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.roundBadge}>{t('killer_game.round', 'Case')} {round + 1}/{TOTAL}</Text>
        <Text style={s.headerScore}>{t('games.you', 'You')}: {scores.me} | {pName}: {scores.partner}</Text>
      </View>
      <Text style={s.caseTitle}>{caseT.title || `Case ${round + 1}`}</Text>
      
      {CASE_IMAGES[cfg.id] && (
        <Image 
          source={CASE_IMAGES[cfg.id]} 
          style={s.caseImage} 
          resizeMode="contain" 
        />
      )}

      {caseT.story ? <Text style={s.caseStory}>{caseT.story}</Text> : null}

      {state === 'playing' ? (
        myGuess !== null ? (
          <Text style={s.waitMsg}>{t('killer_game.waiting_partner', 'Waiting for partner...')}</Text>
        ) : (
          <>
            <Text style={s.pickPrompt}>{t('killer_game.pick_prompt', 'Who is the killer?')}</Text>
            <View style={s.suspectsGrid}>
              {suspects.map((name, i) => (
                <TouchableOpacity key={i} style={s.suspectBtn} onPress={() => guess(i)}>
                  <Text style={s.suspectIcon}>{cfg.icons[i]}</Text>
                  <Text style={s.suspectName}>{name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )
      ) : (
        <View style={s.resultArea}>
          <Text style={s.resultTitle}>{t('killer_game.result_title', 'Round Results')}</Text>
          <Text style={s.correctAns}>{t('killer_game.correct_answer', 'Correct')}: <Text style={s.greenText}>{suspects[cfg.correctIdx]}</Text></Text>
          {caseT.explanation ? <Text style={s.explanation}>{caseT.explanation}</Text> : null}
          <View style={s.choicesSummary}>
            <View style={[s.choiceBox, myGuess === cfg.correctIdx ? s.correctBox : s.wrongBox]}>
              <Text style={s.choiceLabel}>{t('games.you', 'You')}:</Text>
              <Text style={s.choiceName}>{suspects[myGuess]}</Text>
            </View>
            <View style={[s.choiceBox, pGuess === cfg.correctIdx ? s.correctBox : s.wrongBox]}>
              <Text style={s.choiceLabel}>{pName}:</Text>
              <Text style={s.choiceName}>{suspects[pGuess]}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={next} style={s.primaryBtn}>
            <Text style={s.primaryText}>{round + 1 >= TOTAL ? t('killer_game.end_game', 'End Game') : t('killer_game.next_round', 'Next Case')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { width: '100%' },
  center: { alignItems: 'center', paddingVertical: 20 },
  introTitle: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  introSub: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 20 },
  primaryBtn: { backgroundColor: '#3498db', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  roundBadge: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  headerScore: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  caseTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  caseImage: { width: '100%', height: 180, borderRadius: 12, marginBottom: 12, backgroundColor: 'rgba(255,255,255,0.05)' },
  caseStory: { color: 'rgba(255,255,255,0.7)', fontSize: 13, lineHeight: 20, marginBottom: 16 },
  pickPrompt: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginBottom: 12, textAlign: 'center' },
  suspectsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  suspectBtn: { alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.05)', width: '45%' },
  suspectIcon: { fontSize: 28, marginBottom: 4 },
  suspectName: { color: '#fff', fontSize: 12, fontWeight: '500' },
  waitMsg: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginTop: 20 },
  resultArea: { alignItems: 'center', marginTop: 12 },
  resultTitle: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  correctAns: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginBottom: 8 },
  greenText: { color: '#2ecc71', fontWeight: '700' },
  explanation: { color: 'rgba(255,255,255,0.5)', fontSize: 12, lineHeight: 18, marginBottom: 12, textAlign: 'center' },
  choicesSummary: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  choiceBox: { padding: 10, borderRadius: 10, borderWidth: 2, alignItems: 'center', flex: 1 },
  correctBox: { borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,0.15)' },
  wrongBox: { borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.15)' },
  choiceLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11 },
  choiceName: { color: '#fff', fontSize: 13, fontWeight: '600', marginTop: 2 },
  scoresRow: { flexDirection: 'row', gap: 30, marginVertical: 16 },
  scoreBox: { alignItems: 'center' },
  scoreLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 12 },
  scoreNum: { color: '#fff', fontSize: 28, fontWeight: '700' },
  winnerText: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
});
