import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  TextInput, 
  Platform, 
  Dimensions, 
  KeyboardAvoidingView,
  ScrollView,
  ActivityIndicator
} from 'react-native';
import { BlurView } from 'expo-blur';
import { db } from '../../utils/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Colors } from '../../constants/theme';
import { IconSymbol } from './icon-symbol';
import { useTranslation } from 'react-i18next';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// EmailJS Configuration from web project
const EMAILJS_SERVICE_ID = 'service_j51fn6r';
const EMAILJS_TEMPLATE_ID = 'template_es0wmwf';
const EMAILJS_PUBLIC_KEY = 'CL5BESxnv7aEEtecd';

export default function ReportUserModal({ isVisible, onClose, reportedUser, currentUser, onSuccess }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);


  const reasons = [
    'inappropriate',
    'spam',
    'nudity',
    'hate',
    'underage',
    'other',
  ];

  const handleSubmit = async () => {
    if (!reason) return;

    setIsSubmitting(true);
    
    // Define the background submission logic
    const submitReport = async () => {
      try {
        const templateParams = {
          from_name: currentUser.name || currentUser.displayName || 'Nexus User',
          from_id: currentUser.uid,
          reported_user_name: reportedUser?.name || 'User',
          reported_user_id: reportedUser?.uid,
          reason: reason,
          details: details,
        };

        const emailPromise = fetch('https://api.emailjs.com/api/v1.0/email/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            service_id: EMAILJS_SERVICE_ID,
            template_id: EMAILJS_TEMPLATE_ID,
            user_id: EMAILJS_PUBLIC_KEY,
            template_params: templateParams
          })
        });

        const firestorePromise = addDoc(collection(db, 'reports'), {
          reporterId: currentUser.uid,
          reporterName: currentUser.name || currentUser.displayName || 'Anonymous',
          reportedUserId: reportedUser?.uid,
          reportedUserName: reportedUser?.name || 'User',
          reason: reason,
          details: details,
          platform: 'mobile',
          timestamp: serverTimestamp(),
        });

        const [emailResponse, firestoreDoc] = await Promise.all([emailPromise, firestorePromise]);
        
        if (!emailResponse.ok) {
          const errorText = await emailResponse.text();
          console.error('[Nexus] EmailJS API error:', emailResponse.status, errorText);
        } else {
          console.log('[Nexus] EmailJS report sent successfully');
        }
        
        console.log('[Nexus] Firestore report logged with ID:', firestoreDoc.id);
      } catch (error) {
        console.error('[Nexus] Background report submission failed:', error);
      }
    };

    // Close modal immediately for better UX
    if (onSuccess) onSuccess();
    onClose();
    
    // Execute submission in background
    submitReport().finally(() => setIsSubmitting(false));
  };

  const resetAndClose = () => {
    setReason('');
    setDetails('');
    onClose();
  };

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={resetAndClose}
    >
      <TouchableOpacity 
        style={styles.overlay} 
        activeOpacity={1} 
        onPress={resetAndClose}
      >
        {Platform.OS === 'ios' && (
          <BlurView intensity={25} tint="dark" style={StyleSheet.absoluteFill} />
        )}
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardView}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            style={styles.sheetContainer}
          >
            <View style={styles.sheetHeader}>
              <View style={styles.dragIndicator} />
              <Text style={styles.sheetTitle}>{t('chat.report_user', 'Report User')}</Text>
              <Text style={styles.sheetSubtitle}>
                {t('chat.reporting_target', { name: reportedUser?.name || 'this user' })}
              </Text>
            </View>

            <ScrollView 
              style={styles.scrollContent}
              contentContainerStyle={styles.scrollContentContainer}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sectionTitle}>{t('chat.select_reason', 'Please select a reason:')}</Text>
              
              {reasons.map((r) => (
                <TouchableOpacity 
                  key={r} 
                  style={[
                    styles.reasonItem, 
                    reason === r && styles.reasonItemActive
                  ]} 
                  onPress={() => setReason(r)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.radioCircle, 
                    reason === r && styles.radioCircleActive
                  ]}>
                    {reason === r && <View style={styles.radioDot} />}
                  </View>
                  <Text style={[
                    styles.reasonText, 
                    reason === r && styles.reasonTextActive
                  ]}>
                    {t(`chat.reasons.${r}`)}
                  </Text>
                </TouchableOpacity>
              ))}

              {reason === 'other' && (
                <View style={styles.detailsContainer}>
                  <TextInput
                    style={styles.detailsInput}
                    placeholder={t('chat.report_details_placeholder', 'Please provide more details...')}
                    placeholderTextColor="rgba(255,255,255,0.3)"
                    multiline
                    numberOfLines={4}
                    value={details}
                    onChangeText={setDetails}
                    textAlignVertical="top"
                  />
                </View>
              )}
            </ScrollView>

            <View style={styles.footer}>
              <TouchableOpacity 
                style={[styles.submitBtn, !reason && styles.submitBtnDisabled]} 
                onPress={handleSubmit}
                disabled={!reason || isSubmitting}
                activeOpacity={0.8}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={Colors.dark.background} />
                ) : (
                  <Text style={styles.submitBtnText}>{t('common.submit', 'Submit Report')}</Text>
                )}
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={styles.cancelBtn} 
                onPress={resetAndClose}
                disabled={isSubmitting}
              >
                <Text style={styles.cancelText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Platform.OS === 'ios' ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  keyboardView: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#1e293b',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: SCREEN_HEIGHT * 0.9,
    height: SCREEN_HEIGHT * 0.85, // Increased from 0.7 to 0.85
    marginBottom: -100, // Aggressive bleed for Android bottom gaps
    paddingBottom: 100,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 24,
  },
  dragIndicator: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
  },
  scrollContent: {
    width: '100%',
  },
  scrollContentContainer: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    marginBottom: 16,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  reasonItemActive: {
    backgroundColor: 'rgba(13, 139, 209, 0.1)',
    borderColor: 'rgba(13, 139, 209, 0.3)',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  radioCircleActive: {
    borderColor: Colors.dark.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.primary,
  },
  reasonText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  reasonTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  detailsContainer: {
    marginTop: 12,
  },
  detailsInput: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 16,
    color: '#fff',
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  submitBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: Colors.dark.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: '#030e21',
    fontSize: 17,
    fontWeight: '800',
  },
  cancelBtn: {
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#94a3b8',
  },
});
