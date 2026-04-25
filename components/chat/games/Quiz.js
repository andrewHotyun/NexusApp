// ========================================
// Quiz Game — Вікторина (React Native)
// ========================================
import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

export default function Quiz({ gameChannel, isCaller, partnerName }) {
  const { t } = useTranslation();
  const [theme, setTheme] = useState(null);
  const [idx, setIdx] = useState(0);
  const [myScore, setMyScore] = useState(0);
  const [pScore, setPScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [pAnswered, setPAnswered] = useState(false);
  const [selected, setSelected] = useState(null);
  const [state, setState] = useState('selecting');

  const qs = useMemo(() => {
    if (!theme) return [];
    return t(`quiz_data.${theme}`, { returnObjects: true }) || [];
  }, [theme, t]);

  useEffect(() => {
    if (!gameChannel?.isReady) return;
    const unsub = gameChannel.onMessage('game_action', (msg) => {
      if (msg.gameId !== 'quiz') return;
      const d = msg.data;
      if (d.type === 'select_theme') { setTheme(d.theme); setState('playing'); setIdx(0); setMyScore(0); setPScore(0); }
      if (d.type === 'answer') { 
        const currentQs = t(`quiz_data.${d.theme || theme}`, { returnObjects: true });
        if (currentQs?.[d.questionIndex]?.correct === d.index) setPScore(p => p + 1); 
        setPAnswered(true); 
      }
      if (d.type === 'next_question') { setIdx(d.index); setAnswered(false); setPAnswered(false); setSelected(null); }
      if (d.type === 'finish') setState('finished');
      if (d.type === 'reset') { setState('selecting'); setTheme(null); setIdx(0); setMyScore(0); setPScore(0); setAnswered(false); setPAnswered(false); setSelected(null); }
    });
    return unsub;
  }, [gameChannel, theme, t]);

  const pickTheme = (th) => { setTheme(th); setState('playing'); gameChannel.sendMessage({ type: 'game_action', gameId: 'quiz', data: { type: 'select_theme', theme: th } }); };
  const answer = (i) => { if (answered || !qs[idx]) return; setAnswered(true); setSelected(i); if (i === qs[idx].correct) setMyScore(p => p + 1); gameChannel.sendMessage({ type: 'game_action', gameId: 'quiz', data: { type: 'answer', index: i, questionIndex: idx, theme } }); };

  useEffect(() => {
    if (answered && pAnswered && state === 'playing') {
      const tm = setTimeout(() => { const n = idx + 1; if (n < qs.length) { if (isCaller) { setIdx(n); setAnswered(false); setPAnswered(false); setSelected(null); gameChannel.sendMessage({ type: 'game_action', gameId: 'quiz', data: { type: 'next_question', index: n } }); } } else { if (isCaller) { setState('finished'); gameChannel.sendMessage({ type: 'game_action', gameId: 'quiz', data: { type: 'finish' } }); } } }, 2000);
      return () => clearTimeout(tm);
    }
  }, [answered, pAnswered, idx, qs.length, isCaller, gameChannel, state]);

  const restart = () => { setState('selecting'); setTheme(null); gameChannel.sendMessage({ type: 'game_action', gameId: 'quiz', data: { type: 'reset' } }); };

  if (state === 'selecting') return (<View style={s.c}><Text style={s.st}>{t('games.quiz_select_theme', 'Select quiz theme')}</Text><View style={s.tr}><TouchableOpacity style={[s.tb, { borderColor: 'rgba(231,76,60,0.3)' }]} onPress={() => pickTheme('hp')}><Text style={s.te}>⚡</Text><Text style={s.tt}>{t('games.quiz_theme_hp', 'Harry Potter')}</Text></TouchableOpacity><TouchableOpacity style={[s.tb, { borderColor: 'rgba(243,156,18,0.3)' }]} onPress={() => pickTheme('lotr')}><Text style={s.te}>💍</Text><Text style={s.tt}>{t('games.quiz_theme_lotr', 'Lord of the Rings')}</Text></TouchableOpacity></View></View>);

  if (state === 'finished') { const w = myScore > pScore, d = myScore === pScore; return (<View style={s.rc}><Text style={s.re}>{d ? '🤝' : w ? '🎉' : '😔'}</Text><Text style={[s.rt, { color: d ? '#f39c12' : w ? '#2ecc71' : '#e74c3c' }]}>{d ? t('games.draw', 'Draw!') : w ? t('games.you_win', 'You Win!') : t('games.you_lose', 'You Lose!')}</Text><View style={s.fs}><View style={s.si}><Text style={s.sv}>{myScore}</Text><Text style={s.sl}>{t('games.you', 'You')}</Text></View><View style={s.si}><Text style={s.sv}>{pScore}</Text><Text style={s.sl}>{partnerName || 'Partner'}</Text></View></View><TouchableOpacity onPress={restart} style={s.pa}><Text style={s.pt}>{t('games.play_again', 'Play Again')}</Text></TouchableOpacity></View>); }

  const q = qs[idx]; 
  if (!q) return null;
  const ans = q.a;
  return (<View style={s.c}><View style={s.qh}><Text style={s.qc}>{t('games.quiz_question', 'Question')} {idx + 1}/{qs.length}</Text><Text style={s.qs}>{myScore} : {pScore}</Text></View><View style={s.qb}><Text style={s.qt}>{q.q}</Text></View><View style={s.oc}>{ans.map((o, i) => (<TouchableOpacity key={i} style={[s.ob, answered ? (i === q.correct ? s.occ : i === selected ? s.ow : s.od) : s.od]} onPress={() => answer(i)} disabled={answered}><Text style={s.ot}>{o}</Text></TouchableOpacity>))}</View></View>);
}

const s = StyleSheet.create({
  c: { alignItems: 'center', width: '100%' },
  st: { color: '#fff', fontSize: 16, fontWeight: '600', marginBottom: 16 },
  tr: { flexDirection: 'row', gap: 12 },
  tb: { flex: 1, paddingVertical: 20, borderRadius: 14, borderWidth: 2, alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  te: { fontSize: 32 }, tt: { color: '#fff', fontSize: 13, fontWeight: '600' },
  qh: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 12 },
  qc: { color: 'rgba(255,255,255,0.5)', fontSize: 13 }, qs: { color: '#fff', fontSize: 15, fontWeight: '700' },
  qb: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 12, padding: 16, marginBottom: 16, width: '100%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  qt: { color: '#fff', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  oc: { gap: 8, width: '100%' },
  ob: { padding: 14, borderRadius: 10, borderWidth: 2 },
  od: { borderColor: 'rgba(255,255,255,0.1)', backgroundColor: 'rgba(255,255,255,0.04)' },
  occ: { backgroundColor: 'rgba(46,204,113,0.2)', borderColor: '#2ecc71' },
  ow: { backgroundColor: 'rgba(231,76,60,0.2)', borderColor: '#e74c3c' },
  ot: { color: '#fff', fontSize: 14 },
  rc: { alignItems: 'center', paddingVertical: 20 }, re: { fontSize: 56, marginBottom: 12 },
  rt: { fontSize: 20, fontWeight: '700', marginBottom: 16 },
  fs: { flexDirection: 'row', gap: 30, marginBottom: 16 }, si: { alignItems: 'center' },
  sv: { color: '#fff', fontSize: 28, fontWeight: '700' }, sl: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 4 },
  pa: { backgroundColor: '#3498db', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10 },
  pt: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
