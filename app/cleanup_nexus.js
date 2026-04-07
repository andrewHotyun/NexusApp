import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView } from 'react-native';
import { collection, query, getDocs, deleteDoc, doc, writeBatch, where } from 'firebase/firestore';
import { db } from '../utils/firebase';
import { Colors } from '../constants/theme';
import { useRouter } from 'expo-router';

export default function CleanupScreen() {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const router = useRouter();

  const addLog = (msg) => setLogs(prev => [...prev, msg]);

  const handleCleanup = async () => {
    setLoading(true);
    setLogs([]);
    addLog('🚀 Starting production cleanup...');

    try {
      // 1. Find users with "Test" in their name
      const usersSnap = await getDocs(collection(db, 'users'));
      const testUserIds = [];
      const batch = writeBatch(db);
      
      usersSnap.forEach(uDoc => {
        const data = uDoc.data();
        if (data.name && data.name.includes('Test')) {
          testUserIds.push(uDoc.id);
          addLog(`Found test user: ${data.name} (${uDoc.id})`);
          batch.delete(doc(db, 'users', uDoc.id));
        }
      });

      if (testUserIds.length === 0) {
        addLog('✅ No test users found in "users" collection.');
      } else {
        addLog(`🧹 Deleting ${testUserIds.length} test users...`);
      }

      // 2. Cleanup friendRequests
      const reqSnap = await getDocs(collection(db, 'friendRequests'));
      let reqCount = 0;
      reqSnap.forEach(rDoc => {
        const data = rDoc.data();
        if (testUserIds.includes(data.fromUserId) || testUserIds.includes(data.toUserId)) {
          batch.delete(doc(db, 'friendRequests', rDoc.id));
          reqCount++;
        }
      });
      addLog(`🧹 Deleting ${reqCount} friend requests...`);

      // 3. Cleanup friends
      const friendsSnap = await getDocs(collection(db, 'friends'));
      let friendCount = 0;
      friendsSnap.forEach(fDoc => {
        const data = fDoc.data();
        if (testUserIds.includes(data.userId) || testUserIds.includes(data.friendId)) {
          batch.delete(doc(db, 'friends', fDoc.id));
          friendCount++;
        }
      });
      addLog(`🧹 Deleting ${friendCount} friend links...`);

      await batch.commit();
      addLog('✨ CLEANUP COMPLETE! The database is now production-clean.');
    } catch (e) {
      addLog(`❌ ERROR: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Nexus Production Purge</Text>
      <Text style={styles.subtitle}>Use this tool to wipe all test users and records from Firestore.</Text>
      
      <TouchableOpacity 
        style={[styles.btn, loading && styles.btnDisabled]} 
        onPress={handleCleanup}
        disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>WIPE TEST DATA</Text>}
      </TouchableOpacity>

      <ScrollView style={styles.logsArea}>
        {logs.map((log, i) => <Text key={i} style={styles.logText}>{log}</Text>)}
      </ScrollView>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)/friends')}>
        <Text style={styles.backBtnText}>Go to Friends</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background, padding: 24, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: '#7f8c8d', fontSize: 14, textAlign: 'center', marginTop: 10, marginBottom: 30 },
  btn: { backgroundColor: '#e74c3c', height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  logsArea: { flex: 1, backgroundColor: '#000', marginTop: 20, borderRadius: 8, padding: 12 },
  logText: { color: '#2ecc71', fontSize: 12, fontFamily: 'monospace', marginBottom: 4 },
  backBtn: { marginTop: 20, alignItems: 'center' },
  backBtnText: { color: Colors.dark.primary, fontSize: 14, fontWeight: '600' }
});
