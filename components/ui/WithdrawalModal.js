import { collection, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Colors } from '../../constants/theme';
import { auth, db } from '../../utils/firebase';
import payoutManager from '../../utils/payoutManager';
import { ActionModal } from './ActionModal';
import { IconSymbol } from './icon-symbol';

const WithdrawalModal = ({ isVisible, onClose, userProfile, onOpenPaymentDetails }) => {
  const { t, i18n } = useTranslation();
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalMethod, setWithdrawalMethod] = useState('card');
  const [isProcessing, setIsProcessing] = useState(false);
  const [liveTotal, setLiveTotal] = useState(Number(userProfile?.totalEarnings || 0));
  const [payoutHistory, setPayoutHistory] = useState([]);
  const [alertConfig, setAlertConfig] = useState({ 
    visible: false, 
    title: '', 
    message: '', 
    onConfirm: null, 
    confirmText: t('common.ok'), 
    cancelText: t('common.cancel'), 
    showCancel: false,
    isDestructive: false 
  });

  const showAlert = (config) => {
    setAlertConfig({
      visible: true,
      title: config.title || '',
      message: config.message || '',
      onConfirm: config.onConfirm || null,
      confirmText: config.confirmText || t('common.ok'),
      cancelText: config.cancelText || t('common.cancel'),
      showCancel: config.showCancel !== undefined ? config.showCancel : true,
      isDestructive: config.isDestructive || false
    });
  };

  const closeAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };


  // Sync with live data from Firestore
  useEffect(() => {
    if (!isVisible) return;

    // Reset input on open
    setWithdrawalAmount('');

    if (!auth.currentUser?.uid) return;
    const unsub = onSnapshot(doc(db, 'users', auth.currentUser.uid), (snap) => {
      if (snap.exists()) {
        setLiveTotal(Number(snap.data()?.totalEarnings || 0));
      }
    });

    return () => unsub();
  }, [isVisible]);

  // Sync Payout History
  useEffect(() => {
    if (!isVisible || !auth.currentUser?.uid) return;

    const q = query(
      collection(db, 'payouts'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const history = [];
      snap.forEach((doc) => {
        history.push({ id: doc.id, ...doc.data() });
      });
      setPayoutHistory(history);
    }, (err) => {
      console.error('History sync error:', err);
    });

    return () => unsub();
  }, [isVisible]);

  // Sync method with payment details if available
  useEffect(() => {
    if (isVisible && userProfile?.paymentDetails) {
      try {
        let parsed;
        if (typeof userProfile.paymentDetails === 'string') {
          parsed = JSON.parse(userProfile.paymentDetails);
        } else {
          parsed = userProfile.paymentDetails;
        }

        const preferredMethod = parsed.primaryMethod || parsed.method || 'card';
        // Always update method on visibility change or details change
        setWithdrawalMethod(preferredMethod);
      } catch (e) {
        setWithdrawalMethod('card');
      }
    }
  }, [isVisible, userProfile?.paymentDetails]);

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawalAmount);

    if (isNaN(amount) || amount <= 0) {
      showAlert({ title: t('common.error'), message: t('payout.invalid_amount') });
      return;
    }

    if (amount > liveTotal) {
      showAlert({ title: t('common.error'), message: t('payout.insufficient_balance') });
      return;
    }

    if (amount < 10) {
      showAlert({ title: t('common.error'), message: t('payout.min_limit') });
      return;
    }

    const details = userProfile?.paymentDetails;
    const hasDetails = details && (typeof details === 'string' ? details.trim() !== '' : Object.keys(details).length > 0);

    if (!hasDetails) {
      showAlert({
        title: t('common.attention'),
        message: t('payout.not_specified_profile'),
        showCancel: true,
        confirmText: t('common.edit'),
        onConfirm: onOpenPaymentDetails
      });
      return;
    }

    setIsProcessing(true);
    try {
      const result = await payoutManager.createPayoutRequest(
        auth.currentUser.uid,
        amount,
        withdrawalMethod,
        userProfile.paymentDetails
      );

      if (result.success) {
        showAlert({
          title: t('common.success'),
          message: t('payout.request_submitted', { amount: amount.toFixed(2), method: t(`payout.method_${withdrawalMethod}`) }),
          onConfirm: () => {
            setWithdrawalAmount('');
            onClose();
          }
        });
      } else {
        showAlert({ title: t('common.error'), message: result.error });
      }
    } catch (error) {
      showAlert({ title: t('common.error'), message: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const getPaymentDisplay = () => {
    if (!userProfile?.paymentDetails) return t('payout.not_specified_profile');
    try {
      let parsed;
      if (typeof userProfile.paymentDetails === 'string') {
        parsed = JSON.parse(userProfile.paymentDetails);
      } else {
        parsed = userProfile.paymentDetails;
      }

      // Handle new multi-method structure
      if (parsed.methods) {
        const primaryKey = parsed.primaryMethod || Object.keys(parsed.methods)[0];
        const primary = parsed.methods[primaryKey];
        return primary?.displayText || t('payout.not_specified_profile');
      }

      return parsed.displayText || t('payout.not_specified_profile');
    } catch (e) {
      return typeof userProfile.paymentDetails === 'string' ? userProfile.paymentDetails : t('payout.not_specified_profile');
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return '#10b981';
      case 'processing': return '#3b82f6';
      case 'failed': return '#ef4444';
      default: return '#f59e0b'; // pending
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString(i18n.language === 'uk' ? 'uk-UA' : 'en-US', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!isVisible) return null;

  return (
    <Modal
      visible={isVisible}
      transparent={true}
      animationType="slide"
      statusBarTranslucent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.container}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 40 : 0}
        >
          <View style={styles.modalContent}>
            <View style={styles.header}>
              <View style={styles.headerLeft} />
              <Text style={styles.headerTitle}>{t('payout.withdraw_title')}</Text>
              <TouchableOpacity onPress={onClose} style={styles.headerRight}>
                <IconSymbol name="xmark" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
              {/* Earnings Info */}
              <View style={styles.earningsCard}>
                <View style={styles.earningsMain}>
                  <Text style={styles.earningsLabel}>{t('payout.total_earnings')}</Text>
                  <Text style={styles.earningsValue}>${liveTotal.toFixed(2)}</Text>
                </View>
                <View style={styles.paymentPreview}>
                  <Text style={styles.paymentLabel}>{t('payout.payment_details')}</Text>
                  <TouchableOpacity onPress={onOpenPaymentDetails} style={styles.paymentTextWrapper}>
                    <Text style={styles.paymentValue} numberOfLines={1}>{getPaymentDisplay()}</Text>
                    <IconSymbol name="chevron.right" size={12} color="rgba(255,255,255,0.3)" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Amount Input */}
              <View style={styles.formGroup}>
                <Text style={styles.inputLabel}>{t('payout.withdraw_amount_label')}</Text>
                <View style={styles.amountInputWrapper}>
                  <Text style={styles.currencySymbol}>$</Text>
                  <TextInput
                    style={styles.amountInput}
                    value={withdrawalAmount}
                    onChangeText={setWithdrawalAmount}
                    placeholder="0.00"
                    placeholderTextColor="rgba(255,255,255,0.1)"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.suggestions}>
                  {['10.00', '25.00', '50.00', '100.00'].map(amt => (
                    <TouchableOpacity
                      key={amt}
                      style={styles.suggestionBtn}
                      onPress={() => setWithdrawalAmount(amt)}
                    >
                      <Text style={styles.suggestionText}>${parseInt(amt)}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={[styles.suggestionBtn, styles.allBtn]}
                    onPress={() => setWithdrawalAmount(liveTotal.toFixed(2))}
                  >
                    <Text style={styles.allBtnText}>{t('payout.all_btn', { amount: liveTotal.toFixed(2) })}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Info Items */}
              <View style={styles.infoList}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{t('payout.processing_time')}</Text>
                  <Text style={styles.infoValue}>{t('payout.processing_time_value')}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{t('payout.min_withdrawal')}</Text>
                  <Text style={styles.infoValue}>$10.00</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>{t('payout.fee')}</Text>
                  <Text style={styles.infoValue}>2.5%</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[
                  styles.withdrawBtn,
                  (isProcessing || !withdrawalAmount || parseFloat(withdrawalAmount) < 10) && styles.disabledBtn
                ]}
                onPress={handleWithdraw}
                disabled={isProcessing || !withdrawalAmount || parseFloat(withdrawalAmount) < 10}
              >
                {isProcessing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.withdrawBtnText}>{t('payout.request_withdrawal_btn')}</Text>
                )}
              </TouchableOpacity>

              {/* History Section */}
              {payoutHistory.length > 0 && (
                <View style={styles.historySection}>
                  <View style={styles.historyHeader}>
                    <IconSymbol name="clock.fill" size={16} color="rgba(255,255,255,0.4)" />
                    <Text style={styles.historyTitle}>{t('payout.history_title')}</Text>
                  </View>
                  
                  <View style={styles.historyList}>
                    {payoutHistory.map((item) => (
                      <View key={item.id} style={styles.historyItem}>
                        <View style={styles.historyItemMain}>
                          <View>
                            <Text style={styles.historyAmount}>${Number(item.amount || 0).toFixed(2)}</Text>
                            <Text style={styles.historyDate}>{formatDate(item.createdAt)}</Text>
                          </View>
                          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20', borderColor: getStatusColor(item.status) + '40' }]}>
                            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
                            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
                              {t(`payout.status_${item.status}`)}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.historyItemFooter}>
                          <Text style={styles.historyMethod}>
                            {t(`payout.method_${item.payoutMethod || 'card'}`)}
                          </Text>
                          {item.adminNotes ? (
                            <Text style={styles.adminNote} numberOfLines={1}>• {item.adminNotes}</Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>

      <ActionModal 
        {...alertConfig} 
        onClose={closeAlert}
        onConfirm={() => {
          if (alertConfig.onConfirm) alertConfig.onConfirm();
          closeAlert();
        }}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    width: '100%',
    height: '80%',
  },
  modalContent: {
    flex: 1,
    backgroundColor: '#030e21',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: -100, // Aggressive bleed for Android bottom gaps
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  headerLeft: {
    width: 40,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 24,
  },
  earningsCard: {
    backgroundColor: 'rgba(13, 139, 209, 0.05)',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: 'rgba(13, 139, 209, 0.2)',
    marginBottom: 24,
  },
  earningsMain: {
    marginBottom: 20,
  },
  earningsLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    fontWeight: '500',
  },
  earningsValue: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '900',
    marginTop: 4,
  },
  paymentPreview: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  paymentLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    marginBottom: 6,
  },
  paymentTextWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentValue: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  formGroup: {
    marginBottom: 32,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    marginBottom: 12,
    fontWeight: '600',
  },
  amountInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 18,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  currencySymbol: {
    color: Colors.dark.primary,
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    paddingVertical: 16,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  suggestionBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  suggestionText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    fontWeight: '600',
  },
  allBtn: {
    backgroundColor: 'rgba(13, 139, 209, 0.1)',
    borderColor: 'rgba(13, 139, 209, 0.2)',
  },
  allBtnText: {
    color: Colors.dark.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  infoList: {
    gap: 12,
    marginBottom: 32,
    backgroundColor: 'rgba(255,255,255,0.02)',
    padding: 16,
    borderRadius: 20,
  },
  infoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
  },
  infoValue: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
  },
  withdrawBtn: {
    backgroundColor: '#10b981', // Emerald green for withdrawal
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  withdrawBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledBtn: {
    opacity: 0.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  historySection: {
    marginTop: 40,
    paddingBottom: 20,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  historyTitle: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  historyList: {
    gap: 12,
  },
  historyItem: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  historyItemMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  historyAmount: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  historyDate: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  historyItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.03)',
  },
  historyMethod: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '500',
  },
  adminNote: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
  }
});

export default WithdrawalModal;
