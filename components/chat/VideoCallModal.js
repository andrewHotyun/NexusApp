import { Ionicons } from '@expo/vector-icons';

import { LinearGradient } from 'expo-linear-gradient';
import { addDoc, collection, doc, getDoc, onSnapshot, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, orderBy } from 'firebase/firestore';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Pressable
} from 'react-native';
import { RTCIceCandidate, RTCPeerConnection, RTCSessionDescription, RTCView, mediaDevices } from 'react-native-webrtc';
import EmojiPicker from 'rn-emoji-keyboard';
import { useRouter, usePathname } from 'expo-router';
import { getGiftById } from '../../constants/gifts';
import { Colors } from '../../constants/theme';
import { auth, db } from '../../utils/firebase';
import { addCallEarnings, getEarningsRate } from '../../utils/earningsHelper';
import GiftAnimationOverlay from './GiftAnimationOverlay';
import GiftModal from './GiftModal';
import { StoryAvatar } from '../ui/StoryAvatar';
import { updateConversation } from '../../utils/conversationHelper';

const EXPO_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export default function VideoCallModal({
  visible,
  callId,
  isCaller,
  remoteUserId,
  remoteUserName,
  remoteUserAvatar,
  remoteUserGender,
  currentUserGender,
  currentUserProfile,
  onEndCall,
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const currentUserId = auth.currentUser?.uid;

  // Normalize gender values for reliable comparisons
  const normalizeGender = (g) => {
    if (!g || typeof g !== 'string') return '';
    const lower = g.toLowerCase();
    if (lower === 'man' || lower === 'male') return 'male';
    if (lower === 'woman' || lower === 'female') return 'female';
    return lower;
  };
  const myGender = normalizeGender(currentUserGender || currentUserProfile?.gender || currentUserProfile?.sex);
  console.log("[VideoCallModal] myGender:", myGender, "currentUserGender prop:", currentUserGender);

  const initialRoleRef = useRef(isCaller);
  const isActuallyCaller = initialRoleRef.current === true;

  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [isChatExpanded, setIsChatExpanded] = useState(true);

  const [showGiftModal, setShowGiftModal] = useState(false);
  const [activeGiftAnimation, setActiveGiftAnimation] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showControls, setShowControls] = useState(true);

  const [secondsInMinute, setSecondsInMinute] = useState(0);
  const [callStartMs, setCallStartMs] = useState(null);
  const [minutesBalance, setMinutesBalance] = useState(null);
  const [error, setError] = useState(null);

  const [remoteData, setRemoteData] = useState({ 
    name: remoteUserName, 
    avatar: remoteUserAvatar, 
    gender: remoteUserGender 
  });

  // Auto-hide controls after 3 seconds ONLY when the call is active
  useEffect(() => {
    let timeout;
    const isChatActuallyOpen = isChatExpanded && messages.length > 0;
    // remoteStream being present means the video is actively showing
    if (remoteStream && showControls && !isChatActuallyOpen && !inputText) {
      timeout = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [remoteStream, showControls, isChatExpanded, inputText, messages.length]);

  useEffect(() => {
    if (!remoteUserId || !visible) return;
    
    const fetchRemoteData = async () => {
      try {
        const snap = await getDoc(doc(db, 'users', remoteUserId));
        if (snap.exists()) {
          const data = snap.data();
          setRemoteData(prev => ({
            ...prev,
            name: prev.name || data.name || t('common.user'),
            avatar: prev.avatar || data.avatar,
            gender: prev.gender || data.gender
          }));
        }
      } catch (err) {
        console.warn('[VideoCallModal] Data fetch error:', err);
      }
    };

    fetchRemoteData();
  }, [remoteUserId, visible]);

  const partnerGenderResolved = normalizeGender(remoteData.gender || remoteUserGender);
  const partnerNameResolved = remoteData.name || remoteUserName || t('common.user');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const candidateBufferRef = useRef([]);
  const processingSignalingRef = useRef(false);
  const billingTimerRef = useRef(null);
  const billingStartedRef = useRef(false);
  const billingMinutesRef = useRef(0);
  const isChargingRef = useRef(false);
  const animatedGiftsRef = useRef(new Set());
  const unsubscribeCallRef = useRef(null);

  const callIdRef = useRef(callId);
  useEffect(() => { callIdRef.current = callId; }, [callId]);

  const callEndedRef = useRef(false);
  const isEndingRef = useRef(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [modalVisible, setModalVisible] = useState(visible);
  const slideAnim = useRef(new Animated.Value(visible ? 0 : Dimensions.get('window').height)).current;

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: Dimensions.get('window').height,
        duration: 300,
        useNativeDriver: true
      }).start(() => {
        setModalVisible(false);
      });
    }
  }, [visible, slideAnim]);

  const getUIState = () => {
    if (isFinishing || isEndingRef.current) return 'ending';
    if (!localStream) return 'initializing';
    // If we have a remote stream, we are active, period.
    if (remoteStream) return 'active';
    if (isActuallyCaller && !callStartMs) return 'waiting';
    return 'connecting';
  };
  
  const uiState = getUIState();

  const keyboardHeightAnim = useRef(new Animated.Value(0)).current;
  const keyboardOpenAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const kShow = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      setKeyboardVisible(true);
      Animated.parallel([
        Animated.timing(keyboardHeightAnim, {
          toValue: e.endCoordinates.height,
          duration: e.duration || 250,
          useNativeDriver: false
        }),
        Animated.timing(keyboardOpenAnim, {
          toValue: 1,
          duration: e.duration || 250,
          useNativeDriver: false
        })
      ]).start();
    });
    const kHide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', (e) => {
      setKeyboardVisible(false);
      Animated.parallel([
        Animated.timing(keyboardHeightAnim, {
          toValue: 0,
          duration: e.duration || 250,
          useNativeDriver: false
        }),
        Animated.timing(keyboardOpenAnim, {
          toValue: 0,
          duration: e.duration || 250,
          useNativeDriver: false
        })
      ]).start();
    });
    return () => { kShow.remove(); kHide.remove(); };
  }, [keyboardHeightAnim, keyboardOpenAnim]);

  const glassHeight = keyboardOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [84, 0] });
  const glassOpacity = keyboardOpenAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  const handleEndCallRef = useRef(null);
  useEffect(() => { localStreamRef.current = localStream; }, [localStream]);

  const cleanupCall = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(track => { try { track.stop(); } catch (_) { } });
    if (pcRef.current) { try { pcRef.current.close(); } catch (_) { } pcRef.current = null; }
    if (billingTimerRef.current) clearInterval(billingTimerRef.current);
    if (unsubscribeCallRef.current) { unsubscribeCallRef.current(); unsubscribeCallRef.current = null; }
  }, []);

  const handleEndCall = useCallback(() => {
    if (callEndedRef.current || isEndingRef.current) return;
    callEndedRef.current = true;
    isEndingRef.current = true;
    setIsFinishing(true);

    const effectiveCallId = callIdRef.current;
    if (effectiveCallId) {
      updateDoc(doc(db, 'calls', effectiveCallId), {
        status: 'ended',
        endedAt: serverTimestamp(),
        endedBy: currentUserId,
        duration: billingMinutesRef.current || 0
      }).catch(() => { });

      if (currentUserId && remoteUserId && isCaller && effectiveCallId) {
        const messageId = `call_${effectiveCallId}_ended`;
        setDoc(doc(db, 'chats', currentUserId, 'messages', messageId), {
          id: messageId, text: t('chat.video_call_ended'), senderId: currentUserId, receiverId: remoteUserId, timestamp: serverTimestamp(), type: 'system', isRead: true, systemType: 'call_ended', duration: billingMinutesRef.current || 0
        }, { merge: true }).catch(() => { });
        setDoc(doc(db, 'chats', remoteUserId, 'messages', messageId), {
          id: messageId, text: t('chat.video_call_ended'), senderId: currentUserId, receiverId: remoteUserId, timestamp: serverTimestamp(), type: 'system', isRead: false, systemType: 'call_ended', duration: billingMinutesRef.current || 0
        }, { merge: true }).catch(() => { });

        addDoc(collection(db, 'videoCalls'), {
          callerId: currentUserId, partnerId: remoteUserId, callId: effectiveCallId, status: 'completed', endedAt: serverTimestamp(), duration: billingMinutesRef.current
        }).catch(() => { });
      } else if (currentUserId && remoteUserId && !isCaller && effectiveCallId) {
        let maleId = remoteUserGender === 'man' || remoteUserGender === 'male' ? remoteUserId : currentUserId;
        let femaleId = remoteUserGender === 'woman' || remoteUserGender === 'female' ? remoteUserId : currentUserId;
        addDoc(collection(db, 'videoCalls'), {
          callerId: maleId, partnerId: femaleId, callId: effectiveCallId, status: 'completed', endedAt: serverTimestamp(), duration: billingMinutesRef.current
        }).catch(() => { });
      }
    }

    cleanupCall();
    onEndCall && onEndCall();
    
    // Only redirect to chat if we are not already there
    if (remoteUserId && !pathname.includes(remoteUserId)) {
      router.push(`/chat/${remoteUserId}`);
    }
  }, [cleanupCall, onEndCall, remoteUserId, router, pathname]);

  useEffect(() => { handleEndCallRef.current = handleEndCall; }, [handleEndCall]);

  useEffect(() => {
    if (!visible || !callId || callId === 'null' || !currentUserId || !remoteUserId) {
      console.log('[VideoCall] SKIP init — visible:', visible, 'callId:', callId);
      return;
    }
    console.log('[VideoCall] INIT — callId:', callId, 'isCaller:', isCaller);

    callEndedRef.current = false;
    isEndingRef.current = false;
    setIsFinishing(false);
    let isCancelled = false;
    const initTimeMs = Date.now();

    let pc;
    const initWebRTC = async () => {
      try {
        const stream = await mediaDevices.getUserMedia({
          audio: true,
          video: true
        });

        if (isCancelled || callEndedRef.current) {
          stream.getTracks().forEach(track => { try { track.stop(); } catch (_) { } });
          return;
        }

        setLocalStream(stream);
        localStreamRef.current = stream;

        pc = new RTCPeerConnection({ 
          iceServers: EXPO_ICE_SERVERS
        });
        pcRef.current = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

        pc.ontrack = (event) => {
          console.log("[WebRTC] Track received:", event.track.kind);
          if (event.track.kind === 'video') event.track.enabled = true;
          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
          }
        };

        pc.onaddstream = (event) => {
          console.log("[WebRTC] Stream added");
          event.stream.getVideoTracks().forEach(t => t.enabled = true);
          setRemoteStream(event.stream);
        };

        let disconnectTimeout;
        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected' || pc.connectionState === 'completed') {
            setConnectionStatus('connected');
            if (disconnectTimeout) clearTimeout(disconnectTimeout);
          } else if (pc.connectionState === 'disconnected') {
            setConnectionStatus('connecting'); // temporary drop, show reconnecting UI
            if (disconnectTimeout) clearTimeout(disconnectTimeout);
            disconnectTimeout = setTimeout(() => {
              if (pc && pc.connectionState === 'disconnected') {
                handleEndCallRef.current && handleEndCallRef.current();
              }
            }, 15000); // 15s drop timeout
          } else if (pc.connectionState === 'failed') {
            setConnectionStatus('connecting');
            if (disconnectTimeout) clearTimeout(disconnectTimeout);
            disconnectTimeout = setTimeout(() => {
              if (pc && pc.connectionState === 'failed') {
                handleEndCallRef.current && handleEndCallRef.current();
              }
            }, 15000); // 15 seconds grace period
          }
        };

        const callDocRef = doc(db, 'calls', callId);

        unsubscribeCallRef.current = onSnapshot(callDocRef, async (snap) => {
          if (!snap.exists()) {
            // Safety: only end call if it's been more than 5 seconds (to avoid sync races)
            if (!isCaller && !isFinishing) {
               if (Date.now() - initTimeMs > 5000) {
                 handleEndCallRef.current && handleEndCallRef.current();
               }
            }
            return;
          }
          const callData = snap.data();
          if (callData.status === 'ended' || callData.status === 'declined') {
            handleEndCallRef.current && handleEndCallRef.current();
            return;
          }

          if (callData.status === 'accepted' && !callStartMs) {
            const acceptedAtMs = callData?.acceptedAt?.toDate?.()?.getTime?.() || Date.now();
            setCallStartMs(acceptedAtMs);
          }

          if (!isCaller && callData.offer && !callData.answer && pc.signalingState === 'stable' && !processingSignalingRef.current) {
            processingSignalingRef.current = true;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
              
              // Flush buffered candidates for callee
              candidateBufferRef.current.forEach(cand => pc.addIceCandidate(cand).catch(() => { }));
              candidateBufferRef.current = [];

              const answer = await pc.createAnswer();
              if (pc.signalingState === 'have-remote-offer') {
                await pc.setLocalDescription(answer);
                await updateDoc(callDocRef, { answer: { type: answer.type, sdp: answer.sdp } });
              }
            } catch (err) { console.warn("[WebRTC] Callee signaling error:", err); } finally { processingSignalingRef.current = false; }
          } else if (isCaller && callData.answer && pc.signalingState === 'have-local-offer' && !processingSignalingRef.current) {
            processingSignalingRef.current = true;
            try {
              await pc.setRemoteDescription(new RTCSessionDescription(callData.answer));
              
              // Flush buffered candidates for caller
              candidateBufferRef.current.forEach(cand => pc.addIceCandidate(cand).catch(() => { }));
              candidateBufferRef.current = [];
            } catch (err) { console.warn("[WebRTC] Caller signaling error:", err); } finally { processingSignalingRef.current = false; }
          }
        });

        const callerCandidatesCol = collection(callDocRef, isCaller ? 'answerCandidates' : 'offerCandidates');
        onSnapshot(callerCandidatesCol, (snap) => {
          snap.docChanges().forEach(change => {
            if (change.type === 'added') {
              const candidate = new RTCIceCandidate(change.doc.data());
              if (pc.remoteDescription) {
                pc.addIceCandidate(candidate).catch(() => { });
              } else {
                candidateBufferRef.current.push(candidate);
              }
            }
          });
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            const myCandidatesCol = collection(callDocRef, isCaller ? 'offerCandidates' : 'answerCandidates');
            addDoc(myCandidatesCol, event.candidate.toJSON()).catch(() => { });
          }
        };

        if (isCaller) {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          await updateDoc(callDocRef, { offer: { type: offer.type, sdp: offer.sdp } });
        }

      } catch (err) {
        console.error("WebRTC Init Error:", err);
        setError(err.message || "Failed to initialize camera/audio");
      }
    };

    initWebRTC();

    const liveMessagesRef = collection(db, 'liveMessages');
    const unsubscribeMessages = onSnapshot(liveMessagesRef, (snap) => {
      const msgs = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(m => m.callId === callId)
        .sort((a, b) => (b.timestamp?.toMillis?.() || Date.now()) - (a.timestamp?.toMillis?.() || Date.now())); // Descending sort for inverted FlatList
      setMessages(msgs);

      const freshGifts = msgs.filter(m => m.type === 'gift' && !animatedGiftsRef.current.has(m.id));
      if (freshGifts.length > 0) {
        const latestGift = freshGifts[freshGifts.length - 1];
        animatedGiftsRef.current.add(latestGift.id);
        setActiveGiftAnimation({ gift: getGiftById(latestGift.giftId), isSender: latestGift.senderId === currentUserId, partnerName: remoteUserName || t('common.user') });
      }
    });

    return () => {
      isCancelled = true;
      const stream = localStreamRef.current;
      if (stream) stream.getTracks().forEach(track => { try { track.stop(); } catch (_) { } });
      if (pcRef.current) { try { pcRef.current.close(); } catch (_) { } pcRef.current = null; }
      if (unsubscribeCallRef.current) { unsubscribeCallRef.current(); unsubscribeCallRef.current = null; }
      if (billingTimerRef.current) clearInterval(billingTimerRef.current);
      unsubscribeMessages();
    };
  }, [visible, callId]);

  const toggleMute = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach(t => t.enabled = !t.enabled);
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach(t => t.enabled = !t.enabled);
      setIsCameraOff(!isCameraOff);
    }
  };

  // Real-time listener for male user's minutes balance
  useEffect(() => {
    if (!visible || !currentUserId) return;
    if (myGender === 'female') return;

    const unsub = onSnapshot(doc(db, 'users', currentUserId), (snap) => {
      if (snap.exists()) {
        setMinutesBalance(parseInt(snap.data().minutesBalance || 0, 10));
      }
    }, () => {});
    return () => unsub();
  }, [visible, currentUserId, currentUserGender]);

  useEffect(() => {
    if (!visible || !callStartMs || connectionStatus !== 'connected') return;

    let isMale = myGender !== 'female';
    let partnerIsFemale = partnerGenderResolved === 'female';

    if (isMale && partnerIsFemale) {
      if (!billingStartedRef.current) {
        billingStartedRef.current = true;
        billingMinutesRef.current = 0;
      }

      billingTimerRef.current = setInterval(async () => {
        if (isChargingRef.current) return;
        const elapsedMs = Date.now() - callStartMs;
        const expectedChargedMinutes = Math.floor(elapsedMs / 60000);

        const secs = Math.floor((elapsedMs % 60000) / 1000);
        setSecondsInMinute(secs);

        if (expectedChargedMinutes >= billingMinutesRef.current) {
          isChargingRef.current = true;
          try {
            const maleRef = doc(db, 'users', currentUserId);
            let hasBalance = false;

            await runTransaction(db, async (tx) => {
              const maleDoc = await tx.get(maleRef);
              if (!maleDoc.exists()) throw new Error("User doc not found");
              const currentBalance = maleDoc.data().minutesBalance || 0;

              if (currentBalance < 1) {
                hasBalance = false;
              } else {
                tx.update(maleRef, { minutesBalance: currentBalance - 1 });
                hasBalance = true;
              }
            });

            if (hasBalance) {
              billingMinutesRef.current += 1;
              // Determine who is female to credit earnings
              if (remoteUserGender === 'woman' || remoteUserGender === 'female') {
                await addCallEarnings(remoteUserId, currentUserId, 1, callIdRef.current);
              } else if (myGender === 'female') {
                await addCallEarnings(currentUserId, remoteUserId, 1, callIdRef.current);
              }
            } else {
              Alert.alert(t('common.error'), t('chat.no_minutes_male'));
              handleEndCallRef.current && handleEndCallRef.current();
            }
          } catch (error) { } finally { isChargingRef.current = false; }
        }
      }, 1000);
    } else {
      billingTimerRef.current = setInterval(() => {
        const elapsedMs = Date.now() - callStartMs;
        setSecondsInMinute(Math.floor((elapsedMs % 60000) / 1000));
        billingMinutesRef.current = Math.floor(elapsedMs / 60000);
      }, 1000);
    }

    return () => { if (billingTimerRef.current) clearInterval(billingTimerRef.current); };
  }, [visible, callStartMs, connectionStatus]);

  const handleSendMessage = async () => {
    const textToSend = inputText.trim();
    if (!textToSend) return;
    
    setInputText('');
    
    try {
      const chatId = [currentUserId, remoteUserId].sort().join('_');
      // Write to liveMessages for the in-call overlay
      await addDoc(collection(db, 'liveMessages'), {
        callId, 
        senderId: currentUserId, 
        senderName: currentUserProfile?.name || t('common.me'),
        receiverId: remoteUserId, 
        text: textToSend, 
        type: 'text', 
        timestamp: serverTimestamp()
      });
      // Also write to the main messages collection so it appears in regular chat
      await addDoc(collection(db, 'messages'), {
        chatId,
        senderId: currentUserId,
        receiverId: remoteUserId,
        text: textToSend,
        type: 'text',
        timestamp: serverTimestamp(),
        read: false,
        participants: [currentUserId, remoteUserId],
        callId: callId
      });
      
      updateConversation(chatId, [currentUserId, remoteUserId], {
        text: textToSend,
        senderId: currentUserId,
        type: 'text'
      });
    } catch (error) {
      setInputText(textToSend);
    }
  };

  const handleSendGift = async (gift) => {
    setShowGiftModal(false);
    try {
      const maleRef = doc(db, 'users', currentUserId);
      const femaleRef = doc(db, 'users', remoteUserId);
      const rate = await getEarningsRate() || 0.5;

      await runTransaction(db, async (tx) => {
        const maleDoc = await tx.get(maleRef);
        const femaleDoc = await tx.get(femaleRef);

        const currentBalance = maleDoc.exists() ? (maleDoc.data().minutesBalance || 0) : 0;
        if (currentBalance < gift.minutes) throw new Error("Not enough minutes");

        tx.update(maleRef, { minutesBalance: currentBalance - gift.minutes });

        const femaleBal = femaleDoc.exists() ? (femaleDoc.data().minutesBalance || 0) : 0;
        const femaleEarned = femaleDoc.exists() ? (femaleDoc.data().totalMinutesEarned || 0) : 0;
        const femaleMoney = femaleDoc.exists() ? (femaleDoc.data().totalEarnings || 0) : 0;

        tx.update(femaleRef, {
          minutesBalance: femaleBal + gift.minutes, 
          totalMinutesEarned: femaleEarned + gift.minutes, 
          totalEarnings: femaleMoney + (gift.minutes * rate)
        });
        
        const earningsRef = doc(collection(db, 'earnings'));
        tx.set(earningsRef, {
          userId: remoteUserId,
          partnerId: currentUserId,
          minutes: gift.minutes,
          earnings: gift.minutes * rate,
          type: 'gift',
          giftId: gift.id,
          status: 'completed',
          createdAt: serverTimestamp(),
          callId: callId
        });
      });

      const giftText = `🎁 «${t(gift.nameKey)}» (+${gift.minutes} ${t('gifts.minutes_unit')})`;
      const chatId = [currentUserId, remoteUserId].sort().join('_');
      // Write to liveMessages for the in-call overlay
      await addDoc(collection(db, 'liveMessages'), {
        callId, senderId: currentUserId, receiverId: remoteUserId, text: giftText, type: 'gift', giftId: gift.id, timestamp: serverTimestamp(), senderName: currentUserProfile?.name || t('common.me')
      });
      // Also write to the main messages collection so gift appears in regular chat
      await addDoc(collection(db, 'messages'), {
        chatId,
        senderId: currentUserId,
        receiverId: remoteUserId,
        text: giftText,
        type: 'gift',
        giftId: gift.id,
        minutes: gift.minutes,
        timestamp: serverTimestamp(),
        read: false,
        participants: [currentUserId, remoteUserId],
        callId: callId
      });

      updateConversation(chatId, [currentUserId, remoteUserId], {
        text: giftText,
        senderId: currentUserId,
        type: 'gift'
      });
    } catch (err) { Alert.alert(t('common.error'), t('chat.no_minutes_male')); }
  };

  if (!modalVisible || (!callId && !isEndingRef.current)) return null;

  if (!modalVisible || (!callId && !isEndingRef.current)) return null;

  const animatedStyle = {
    flex: 1,
    transform: [{ translateY: slideAnim }],
    backgroundColor: (uiState === 'active') ? 'transparent' : (uiState === 'waiting' || uiState === 'connecting' || uiState === 'initializing') ? 'transparent' : '#000'
  };

  const renderContent = () => {
    if (error) {
      return (
        <View style={styles.container}>
          <View style={[styles.overlay, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
            <Ionicons name="alert-circle" size={64} color="#ff3b30" />
            <Text style={[styles.waitingName, { marginTop: 20, textAlign: 'center' }]}>{t('chat.call_error')}</Text>
            <Text style={[styles.waitingMessage, { color: '#ff3b30' }]}>{error}</Text>
            <TouchableOpacity 
              style={[styles.glassBtn, { backgroundColor: '#ff3b30', marginTop: 30, width: 200 }]} 
              onPress={() => { Alert.alert(t('common.alert'), t('chat.closing_call')); handleEndCall(); }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }


    const HEADER_HEIGHT = Platform.OS === 'ios' ? 100 : 120;
    const isConnecting = uiState === 'waiting' || uiState === 'connecting';
    const isActive = uiState === 'active';
    const isInitializing = uiState === 'initializing';

    return (
      <View style={[styles.container, (isConnecting || isInitializing) && { backgroundColor: 'transparent' }]}>
        {/* Main Background Gradient - Only visible when active */}
        <LinearGradient 
          colors={['#0c1427', '#1a2a44', '#2a446a']} 
          style={[StyleSheet.absoluteFill, !isActive && { opacity: 0 }]} 
        />

        {/* === FULL SCREEN VIDEO (Remote) === */}
        {/* We mount it as soon as we have a stream, but keep it hidden/tiny if not active to pre-warm the surface */}
        {remoteStream && (
          <RTCView 
            key={`remote-${remoteStream.id}`}
            streamURL={remoteStream.toURL()} 
            style={[StyleSheet.absoluteFill, !isActive && { top: 0, left: 0, width: 1, height: 1, opacity: 0.01 }]} 
            objectFit="contain"
          />
        )}

        <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowControls(!showControls)} />

        {/* === PIP (My camera) — top right === */}
        {/* Always mount when localStream exists to prevent Android freeze on state change. 
            Keep on-screen at 1x1 size when connecting so OS doesn't pause it. */}
        {localStream && (
          <View style={[
            styles.pipContainer, 
            !isActive && { position: 'absolute', top: 0, right: 0, width: 1, height: 1, opacity: 0.01 }
          ]} pointerEvents={!isActive ? 'none' : 'auto'}>
            <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>
              <RTCView 
                key={`local-${localStream.id}`}
                streamURL={localStream.toURL()} 
                style={styles.pipVideo} 
                objectFit="cover" 
                mirror={true}
                zOrder={1}
              />
            </View>
          </View>
        )}

        {/* === INITIALIZING STATE OVERLAY === */}
        {isInitializing && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 10 }]}>
            <ActivityIndicator size="large" color={Colors.dark.primary} />
            <Text style={{ color: '#fff', marginTop: 20, fontSize: 16 }}>{t('chat.connecting', 'Connecting...')}</Text>
          </View>
        )}

        {/* === WAITING/CONNECTING STATE OVERLAY === */}
        {isConnecting && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 10 }]}>
            <Animated.View style={[styles.waitingCard, { transform: [{ scale: 1 }] }]}>
              <View style={styles.waitingCardContent}>
                <View style={styles.cardAvatarOuter}>
                  <LinearGradient
                    colors={['#00d2ff', '#3a7bd5']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.neonRing}
                  >
                    <View style={styles.cardAvatarInner}>
                      {(remoteData?.avatar || remoteUserAvatar) ? (
                        <Image 
                          key={remoteData?.avatar || remoteUserAvatar}
                          source={{ uri: remoteData?.avatar || remoteUserAvatar }} 
                          style={styles.cardAvatar} 
                        />
                      ) : (
                        <View style={styles.cardAvatarPlaceholder}>
                          <Text style={styles.cardAvatarText}>{(remoteData?.name || remoteUserName) ? (remoteData?.name || remoteUserName)[0].toUpperCase() : 'U'}</Text>
                        </View>
                      )}
                    </View>
                  </LinearGradient>
                </View>
                
                <Text style={styles.cardName}>{remoteUserName || t('common.user')}</Text>
                
                <View style={styles.statusRow}>
                  <ActivityIndicator size="small" color={Colors.dark.primary} style={{ marginRight: 8 }} />
                  <Text style={styles.cardStatusText}>
                    {uiState === 'waiting' ? t('chat.waiting_accept', 'Calling...') : t('chat.connecting', 'Connecting...')}
                  </Text>
                </View>

                {uiState === 'waiting' && (
                  <TouchableOpacity style={styles.cardCancelBtn} onPress={handleEndCall}>
                    <Text style={styles.cardCancelText}>{t('common.cancel', 'Cancel')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          </View>
        )}

        {/* Controls and Chat (only if active) */}
        {isActive && (
          <>
            {/* === RESTORING CONNECTION OVERLAY === */}
            {connectionStatus === 'connecting' && (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 20 }]} pointerEvents="box-none">
                <ActivityIndicator size="large" color="#00fbff" />
                <Text style={{ color: '#fff', marginTop: 16, fontSize: 16, fontWeight: '600' }}>
                  {t('chat.restoring_connection', 'Restoring connection...')}
                </Text>
              </View>
            )}

        {/* === SMALL FLOATING INFO & TIMER === */}
        {showControls && (
          <SafeAreaView style={styles.floatingContainer} pointerEvents="box-none">
          {/* Avatar + Name */}
          <View style={styles.floatingInfo}>
            <StoryAvatar userId={remoteUserId} avatarUrl={remoteData?.avatar || remoteUserAvatar} size={32} showStatus={false} />
            <Text style={styles.floatingName} numberOfLines={1}>{partnerNameResolved}</Text>
          </View>

          {/* Timer (Restored exact custom layout) */}
          <View style={styles.floatingTimer}>
            <Ionicons name="time-outline" size={11} color="#00fbff" />
            <Text style={styles.floatingTimerText}>{minutesBalance !== null ? minutesBalance : '—'} {t('chat.minutes_unit')}</Text>
            <View style={styles.timerDivider} />
            <Text style={styles.timerCountdown}>{60 - secondsInMinute}{t('chat.seconds_unit')}</Text>
          </View>
          </SafeAreaView>
        )}

        {/* === OVERLAY for chat & controls === */}
        <View style={[StyleSheet.absoluteFill]} pointerEvents="box-none">
            <Animated.View style={[styles.chatOverlay, { bottom: Animated.add(200, keyboardHeightAnim) }]} pointerEvents="box-none">
              <View style={styles.chatHeader}>
                {messages.length > 0 && (
                  <TouchableOpacity onPress={() => setIsChatExpanded(!isChatExpanded)} style={styles.toggleChatBtn}>
                    <Ionicons name={isChatExpanded ? "chevron-down" : "chevron-up"} size={20} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>

              {isChatExpanded && (
                <FlatList
                  data={messages}
                  keyExtractor={item => item.id}
                  inverted={true}
                  style={styles.chatList}
                  contentContainerStyle={styles.chatContent}
                  showsVerticalScrollIndicator={true}
                  renderItem={({ item }) => {
                    const isMe = item.senderId === currentUserId;
                    const isGift = item.type === 'gift';
                    const gift = isGift ? getGiftById(item.giftId) : null;
                    
                    return (
                      <View style={isMe ? styles.chatBubbleRight : styles.chatBubbleLeft}>
                        <Text style={{ fontSize: 10, color: isMe ? 'rgba(0,251,255,0.8)' : 'rgba(255,255,255,0.6)', marginBottom: 2, textAlign: isMe ? 'right' : 'left', fontWeight: '600' }}>
                          {isMe ? t('common.me') + ':' : (item.senderName || remoteUserName || t('common.user')) + ':'}
                        </Text>
                        
                        {isGift && gift ? (
                          <View style={styles.smallGiftBlock}>
                            <LinearGradient
                              colors={gift.gradientColors || ['#333', '#666']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 1 }}
                              style={styles.smallGiftVisual}
                            >
                              <Text style={styles.smallGiftEmoji}>{gift.emoji}</Text>
                            </LinearGradient>
                            <Text style={styles.smallGiftText}>{t(gift.nameKey)}</Text>
                          </View>
                        ) : (
                          <Text style={styles.chatText}>{item.text}</Text>
                        )}
                      </View>
                    );
                  }}
                />
              )}
            </Animated.View>

            {showControls && (
              <Animated.View style={[styles.footerContainer, { bottom: keyboardHeightAnim }]} pointerEvents="box-none">
              <LinearGradient colors={['transparent', 'rgba(0,0,0,0.8)']} style={styles.bottomGradient} pointerEvents="none" />

              <View style={styles.footer}>
                <Animated.View style={[styles.glassControlsRow, { marginTop: 0, marginBottom: 15, height: glassHeight, opacity: glassOpacity, overflow: 'hidden' }]}>
                  <View style={styles.glassControlsBackground}>
                    <TouchableOpacity onPress={toggleMute} style={[styles.glassBtn, isMuted && styles.glassBtnActive]}>
                      <Ionicons name={isMuted ? 'mic-off' : 'mic'} size={26} color="#fff" />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handleEndCall} style={styles.glassEndBtn}>
                      <Ionicons name="call" size={32} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => Alert.alert(t('common.info', 'Info'), t('chat.games_coming_soon', 'Games are coming soon!'))} style={styles.glassBtn}>
                      <Ionicons name="game-controller-outline" size={26} color="#fff" />
                    </TouchableOpacity>
                  </View>
                </Animated.View>

                <View style={styles.inputRow}>
                  <View style={styles.chatInputContainer}>
                    <TouchableOpacity onPress={() => setShowEmojiPicker(true)} style={styles.iconBtn}>
                      <Ionicons name="happy-outline" size={24} color="#fff" />
                    </TouchableOpacity>
                    <TextInput
                      style={styles.chatInput}
                      placeholder={t('chat.message_placeholder', { name: remoteUserName })}
                      placeholderTextColor="#999"
                      value={inputText}
                      onChangeText={setInputText}
                      onSubmitEditing={handleSendMessage}
                      maxLength={500}
                    />
                    <TouchableOpacity onPress={() => setShowGiftModal(true)} style={styles.iconBtn}>
                      <Ionicons name="gift-outline" size={24} color="#FFD700" />
                    </TouchableOpacity>
                  </View>

                  {inputText.trim().length > 0 && (
                    <TouchableOpacity onPress={handleSendMessage} style={styles.sendBtnOuter}>
                      <Ionicons name="send" size={20} color="#fff" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </Animated.View>
          )}
        </View>

        <GiftModal 
          visible={showGiftModal} 
          onClose={() => setShowGiftModal(false)} 
          onSendGift={handleSendGift} 
          userBalance={minutesBalance !== null ? minutesBalance : 0}
          recipientName={partnerNameResolved}
        />

        {activeGiftAnimation && (
          <GiftAnimationOverlay
            gift={activeGiftAnimation.gift}
            partnerName={activeGiftAnimation.partnerName}
            isSender={activeGiftAnimation.isSender}
            onComplete={() => setActiveGiftAnimation(null)}
          />
        )}

        <EmojiPicker open={showEmojiPicker} onClose={() => setShowEmojiPicker(false)} onEmojiSelected={(emoji) => setInputText(prev => prev + emoji.emoji)} />
          </>
        )}
      </View>
    );
  };

  return (
    <Modal transparent visible={modalVisible} animationType="none">
      <Animated.View style={animatedStyle}>
        {renderContent()}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 120 },
  bottomGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 250 },
  overlay: { flex: 1, zIndex: 110 },
  
  // PIP Video (Local)
  pipContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    width: 110,
    height: 160,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 10,
    zIndex: 100
  },
  pipVideo: { width: '100%', height: '100%', borderRadius: 20 },

  // Floating container (holds info and timer)
  floatingContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 10 : 40,
    left: 15,
    zIndex: 200,
    elevation: 20,
    alignItems: 'flex-start',
  },
  floatingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  floatingName: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
    maxWidth: 120,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  floatingTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(0,251,255,0.3)',
    marginTop: 8, // Spacing between avatar block and timer block
  },
  floatingTimerText: { color: '#fff', marginLeft: 5, fontSize: 12, fontWeight: '600' },
  timerDivider: { width: 1, height: 14, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 8 },
  timerCountdown: { color: '#00fbff', fontSize: 13, fontWeight: '700' },

  // Live Chat
  chatOverlay: { position: 'absolute', bottom: 200, left: 0, right: 0, maxHeight: 250, paddingHorizontal: 15 },
  chatOverlayHidden: { opacity: 0, pointerEvents: 'none' },
  chatHeader: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 5 },
  toggleChatBtn: { backgroundColor: 'rgba(0,0,0,0.4)', width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  chatList: { flex: 1 },
  chatContent: { paddingVertical: 10 },
  chatBubbleLeft: { backgroundColor: 'rgba(0,0,0,0.85)', alignSelf: 'flex-start', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 18, borderBottomLeftRadius: 4, marginBottom: 8, maxWidth: '80%', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  chatBubbleRight: { backgroundColor: 'rgba(5, 80, 100, 0.9)', alignSelf: 'flex-end', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 18, borderBottomRightRadius: 4, marginBottom: 8, maxWidth: '80%', borderWidth: 1, borderColor: 'rgba(0,251,255,0.4)' },
  chatText: { color: '#fff', fontSize: 16, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  
  // In-call Gift display
  smallGiftBlock: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 12, padding: 4, marginTop: 4 },
  smallGiftVisual: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  smallGiftEmoji: { fontSize: 18 },
  smallGiftText: { color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 8, marginRight: 8, textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },

  // Footer & Input
  footerContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10 },
  footer: { padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  inputRow: { flexDirection: 'row', alignItems: 'center' },
  chatInputContainer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 25, paddingHorizontal: 15, height: 50, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  chatInput: { flex: 1, color: '#fff', fontSize: 16, paddingHorizontal: 10, height: '100%' },
  sendBtnOuter: { width: 50, height: 50, borderRadius: 25, backgroundColor: Colors.dark.primary, justifyContent: 'center', alignItems: 'center', marginLeft: 10, shadowColor: Colors.dark.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 5, elevation: 6 },
  iconBtn: { padding: 5 },

  // Glass Controls
  glassControlsRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  glassControlsBackground: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 10, borderRadius: 35, overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.5)' },
  glassBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', marginHorizontal: 8 },
  glassBtnActive: { backgroundColor: 'rgba(255,255,255,0.5)' },
  glassEndBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#ff3b30', justifyContent: 'center', alignItems: 'center', marginHorizontal: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 5, elevation: 8 },

  // Waiting State
  waitingContent: { alignItems: 'center' },
  pulsingAvatarContainer: { width: 160, height: 160, justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  waitingAvatar: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, borderColor: 'rgba(255,255,255,0.8)' },
  avatarPlaceholderLarge: { width: 140, height: 140, borderRadius: 70, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center', borderWidth: 3, borderColor: 'rgba(255,255,255,0.5)' },
  avatarPlaceholderTextLarge: { fontSize: 60, color: '#fff', fontWeight: 'bold' },
  waitingName: { fontSize: 32, fontWeight: '800', color: '#fff', marginBottom: 10, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  waitingMessage: { fontSize: 18, color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginBottom: 50 },
  glassCancelContainer: { position: 'absolute', bottom: 60, alignSelf: 'center' },
  glassCancelBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,59,48,0.8)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },

  // New Card Style
  waitingCard: {
    width: '85%',
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderRadius: 32,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  waitingCardContent: {
    alignItems: 'center',
  },
  cardAvatarOuter: {
    marginBottom: 20,
    shadowColor: '#00d2ff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    elevation: 15,
  },
  neonRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 3,
  },
  cardAvatarInner: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#1e293b',
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardAvatar: {
    width: '100%',
    height: '100%',
    borderRadius: 50,
  },
  cardAvatarPlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 47,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardAvatarText: {
    fontSize: 40,
    color: '#fff',
    fontWeight: 'bold',
  },
  cardName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  cardStatusText: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.6)',
  },
  cardCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,59,48,0.2)',
    paddingHorizontal: 26,
    paddingVertical: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255,59,48,0.4)',
    marginTop: 8,
  },
  cardCancelText: {
    color: '#ff453a',
    fontSize: 16,
    fontWeight: '700',
  }
});
