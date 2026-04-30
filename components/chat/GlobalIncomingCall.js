import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { useRouter } from 'expo-router';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/theme';
import { useAppData } from '../../utils/AppDataProvider';
import { db } from '../../utils/firebase';
import { StoryAvatar } from '../ui/StoryAvatar';

export default function GlobalIncomingCall() {
  const { t } = useTranslation();
  const router = useRouter();
  const { activeIncomingCall, setActiveIncomingCall, startGlobalCall } = useAppData();

  const [sound, setSound] = useState(null);
  // 1. Handle Ringing Animation & Sound
  // Animation removed as per user request
  useEffect(() => {
    if (activeIncomingCall) {

      // Play sound
      const playSound = async () => {
        try {
          const { sound: newSound } = await Audio.Sound.createAsync(
            // Using a standard system-like sound. 
            // In a real app we'd have a local asset, but for now we use a remote one or fallback.
            { uri: 'https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3' },
            { shouldPlay: true, isLooping: true, volume: 1.0 }
          );
          setSound(newSound);
        } catch (e) {
          console.warn('Failed to play ringing sound:', e);
        }
      };
      playSound();
    } else {
      stopRinging();
    }

    return () => stopRinging();
  }, [activeIncomingCall]);

  const stopRinging = async () => {
    if (sound) {
      try {
        await sound.stopAsync();
        await sound.unloadAsync();
        setSound(null);
      } catch (e) { }
    }
  };

  const handleAccept = async () => {
    if (!activeIncomingCall) return;
    const callId = activeIncomingCall.id;
    const callerId = activeIncomingCall.callerId;

    try {
      // Stop ringing first
      await stopRinging();

      // Update Firestore
      await updateDoc(doc(db, 'calls', callId), {
        status: 'accepted',
        acceptedAt: serverTimestamp(),
        calleeDeviceType: 'mobile'
      });

      // Open video call modal instantly over current screen
      startGlobalCall(callId, false, {
        uid: callerId,
        name: activeIncomingCall.callerName || t('common.user'),
        avatar: activeIncomingCall.callerAvatar || null,
        gender: activeIncomingCall.callerGender || null
      });

      // Clear state so banner closes
      setActiveIncomingCall(null);

      // We do NOT navigate to the chat screen here anymore.
      // This keeps the user on the screen where they accepted the call,
      // providing the expected background and eliminating the UI lag.
    } catch (e) {
      console.error('Error accepting call globally:', e);
    }
  };

  const handleDecline = async () => {
    if (!activeIncomingCall) return;
    const callId = activeIncomingCall.id;

    try {
      await stopRinging();
      await updateDoc(doc(db, 'calls', callId), {
        status: 'declined',
        endedAt: serverTimestamp()
      });
      setActiveIncomingCall(null);
    } catch (e) {
      console.error('Error declining call globally:', e);
    }
  };

  if (!activeIncomingCall) return null;

  return (
    <Modal transparent animationType="fade" visible={!!activeIncomingCall}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.avatarContainer}>
              <View style={styles.ring} />
              <StoryAvatar
                userId={activeIncomingCall.callerId}
                avatarUrl={activeIncomingCall.callerAvatar}
                name={activeIncomingCall.callerName}
                size={60}
                showStatus={false}
              />
            </View>
            <View style={styles.headerInfo}>
              <Text style={styles.callerName}>{activeIncomingCall.callerName || t('common.unknown_user')}</Text>
              <Text style={styles.callType}>{t('common.incoming_video_call', 'Incoming Video Call')}</Text>
            </View>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={[styles.btn, styles.acceptBtn]} onPress={handleAccept}>
              <Ionicons name="call" size={20} color="#000" />
              <Text style={styles.btnText}>{t('common.accept')}</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.btn, styles.declineBtn]} onPress={handleDecline}>
              <Ionicons name="close" size={24} color="#000" />
              <Text style={styles.btnText}>{t('common.decline')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingHorizontal: 10
  },
  card: {
    width: '100%',
    backgroundColor: '#161e2b',
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 15,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14
  },
  avatarContainer: {
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  ring: {
    position: 'absolute',
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  headerInfo: {
    flex: 1,
    justifyContent: 'center'
  },
  callerName: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 2
  },
  callType: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 10
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  },
  acceptBtn: {
    backgroundColor: '#00fbff',
    shadowColor: '#00fbff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  declineBtn: {
    backgroundColor: '#ff4b4b',
    shadowColor: '#ff4b4b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  btnText: {
    color: '#000',
    fontSize: 15,
    fontWeight: '700',
  }
});
