import { doc, updateDoc } from 'firebase/firestore';
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
import { ActionModal } from './ActionModal';
import { IconSymbol } from './icon-symbol';

const PaymentDetailsModal = ({ isVisible, onClose, currentDetails = '' }) => {
  const { t } = useTranslation();
  const [paymentMethod, setPaymentMethod] = useState('card');
  const [allMethods, setAllMethods] = useState({ card: null, paypal: null, crypto: null });
  const [formData, setFormData] = useState({
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardholderName: '',
    paypalEmail: '',
    cryptoWallet: '',
    cryptoType: 'bitcoin'
  });
  const [errors, setErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [primaryMethod, setPrimaryMethod] = useState('card');
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

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      const newErrors = { ...errors };
      delete newErrors[field];
      setErrors(newErrors);
    }
  };

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

  // Effect 1a: Initial selection when opening
  useEffect(() => {
    if (!isVisible) return;

    try {
      let parsed;
      if (typeof currentDetails === 'string') {
        parsed = currentDetails ? JSON.parse(currentDetails) : {};
      } else {
        parsed = currentDetails || {};
      }
      
      const initialMethod = parsed.primaryMethod || parsed.method || 'card';
      setPaymentMethod(initialMethod);
    } catch (e) {
      setPaymentMethod('card');
    }
  }, [isVisible]);

  // Effect 1b: Sync allMethods and primaryMethod from props when they change externally
  useEffect(() => {
    if (!isVisible || isSaving) return;
    
    try {
      let parsed;
      if (typeof currentDetails === 'string') {
        parsed = currentDetails ? JSON.parse(currentDetails) : {};
      } else {
        parsed = currentDetails || {};
      }

      // New structure
      if (parsed.methods) {
        if (JSON.stringify(parsed.methods) !== JSON.stringify(allMethods)) {
          setAllMethods(parsed.methods);
        }
        if (parsed.primaryMethod && parsed.primaryMethod !== primaryMethod) {
          setPrimaryMethod(parsed.primaryMethod);
        }
      } 
      // Legacy structure
      else {
        const savedMethod = parsed.method || 'card';
        const legacyData = parsed.data || {};
        
        const legacyWallet = {
          ...allMethods,
          [savedMethod]: { data: legacyData, displayText: parsed.displayText || '' }
        };
        
        if (JSON.stringify(legacyWallet) !== JSON.stringify(allMethods)) {
          setAllMethods(legacyWallet);
          setPrimaryMethod(parsed.primaryMethod || savedMethod);
        }
      }
    } catch (e) {
      // Fallback for plain text
      if (typeof currentDetails === 'string' && currentDetails.length > 0 && currentDetails.length < 50) {
        if (!allMethods.card || allMethods.card.displayText !== currentDetails) {
          setAllMethods(prev => ({
            ...prev,
            card: { data: { cardNumber: currentDetails }, displayText: currentDetails }
          }));
        }
      }
    }
  }, [isVisible, currentDetails, isSaving]);

  // Effect 2: Load data into form ONLY when switching tabs or when modal opens
  useEffect(() => {
    if (!isVisible || isSaving) return;

    const savedData = allMethods[paymentMethod]?.data;
    if (savedData) {
      // Compare current formData with savedData to avoid unnecessary updates
      const relevantKeys = 
        paymentMethod === 'card' ? ['cardNumber', 'expiryDate', 'cvv', 'cardholderName'] :
        paymentMethod === 'paypal' ? ['paypalEmail'] :
        ['cryptoWallet', 'cryptoType'];
      
      const isDifferent = relevantKeys.some(key => formData[key] !== (savedData[key] || ''));
      
      if (isDifferent) {
        setFormData(prev => ({ ...prev, ...savedData }));
      }
    } else {
      resetTabFields(paymentMethod);
    }
    
    if (Object.keys(errors).length > 0) {
      setErrors({});
    }
  }, [paymentMethod, isVisible, allMethods]);

  const resetTabFields = (method) => {
    if (method === 'card') {
      setFormData(prev => ({ ...prev, cardNumber: '', expiryDate: '', cvv: '', cardholderName: '' }));
    } else if (method === 'paypal') {
      setFormData(prev => ({ ...prev, paypalEmail: '' }));
    } else if (method === 'crypto') {
      setFormData(prev => ({ ...prev, cryptoWallet: '', cryptoType: 'bitcoin' }));
    }
  };

  const validateLuhn = (number) => {
    let sum = 0;
    let isEven = false;
    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number.charAt(i), 10);
      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      isEven = !isEven;
    }
    return sum % 10 === 0;
  };

  const validateForm = () => {
    const newErrors = {};

    if (paymentMethod === 'card') {
      const cleanNumber = formData.cardNumber.replace(/\s/g, '');
      if (!cleanNumber || cleanNumber.length < 16) {
        newErrors.cardNumber = t('payment.errors.card_number');
      } else if (!validateLuhn(cleanNumber)) {
        newErrors.cardNumber = t('payment.errors.invalid_card');
      }

      const expiryRegex = /^(0[1-9]|1[0-2])\/(\d{2})$/;
      if (!formData.expiryDate || !expiryRegex.test(formData.expiryDate)) {
        newErrors.expiryDate = t('payment.errors.invalid_expiry');
      } else {
        const [month, year] = formData.expiryDate.split('/').map(n => parseInt(n, 10));
        const now = new Date();
        const currentYear = now.getFullYear() % 100;
        const currentMonth = now.getMonth() + 1;

        if (year < currentYear || (year === currentYear && month < currentMonth)) {
          newErrors.expiryDate = t('payment.errors.expiry_past');
        }
      }

      if (!formData.cvv || (formData.cvv.length !== 3 && formData.cvv.length !== 4)) {
        newErrors.cvv = t('payment.errors.cvv');
      }

      const name = formData.cardholderName.trim();
      const latinOnlyRegex = /^[a-zA-Z\s]+$/;
      if (!name) {
        newErrors.cardholderName = t('payment.errors.cardholder_name');
      } else if (!latinOnlyRegex.test(name)) {
        newErrors.cardholderName = t('payment.errors.latin_only');
      } else if (name.split(/\s+/).length < 2) {
        newErrors.cardholderName = t('payment.errors.enter_full_name');
      }
    } else if (paymentMethod === 'paypal') {
      if (!formData.paypalEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.paypalEmail)) {
        newErrors.paypalEmail = t('payment.errors.paypal_email');
      }
    } else if (paymentMethod === 'crypto') {
      const wallet = formData.cryptoWallet.trim();
      if (!wallet) {
        newErrors.cryptoWallet = t('payment.errors.wallet_address');
      } else {
        // Robust Crypto Validation
        let isValid = true;
        if (formData.cryptoType === 'bitcoin') {
          // BTC: Legacy (1...), SegWit (3...), Native SegWit (bc1...)
          const btcRegex = /^(1[a-km-zA-HJ-NP-Z1-9]{25,34}|3[a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,62})$/;
          isValid = btcRegex.test(wallet);
        } else if (formData.cryptoType === 'ethereum' || formData.cryptoType === 'usdc' || (formData.cryptoType === 'usdt' && wallet.startsWith('0x'))) {
          // ETH/ERC20: 0x followed by 40 hex chars
          const ethRegex = /^0x[a-fA-F0-9]{40}$/;
          isValid = ethRegex.test(wallet);
        } else if (formData.cryptoType === 'usdt' && wallet.startsWith('T')) {
          // USDT-TRC20 (Tron): T followed by 33 chars
          isValid = wallet.length === 34;
        } else {
          // Fallback for other formats
          isValid = wallet.length >= 20;
        }

        if (!isValid) {
          newErrors.cryptoWallet = t('payment.errors.wallet_address');
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const isMethodFilled = (method = paymentMethod) => {
    if (method === 'card') {
      return formData.cardNumber && formData.expiryDate && formData.cvv && formData.cardholderName;
    } else if (method === 'paypal') {
      return formData.paypalEmail;
    } else if (method === 'crypto') {
      return formData.cryptoWallet;
    }
    return false;
  };

  const hasMethodData = (method) => {
    const m = allMethods[method];
    if (!m) return false;
    
    // Check if there is any display text
    if (m.displayText && m.displayText.trim() !== '') return true;
    
    // Check if there is any actual field data
    if (m.data) {
      return Object.values(m.data).some(val => val && val.toString().trim() !== '');
    }
    
    return false;
  };

  const getDisplayText = (method = paymentMethod) => {
    if (method === 'card') {
      const lastFour = formData.cardNumber.replace(/\s/g, '').slice(-4);
      return `**** **** **** ${lastFour} (${formData.cardholderName})`;
    } else if (method === 'paypal') {
      return `PayPal: ${formData.paypalEmail}`;
    } else if (method === 'crypto') {
      const shortAddress = formData.cryptoWallet.substring(0, 6) + '...' + formData.cryptoWallet.slice(-6);
      return `${formData.cryptoType.toUpperCase()}: ${shortAddress}`;
    }
    return '';
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      const activeMethodData = {
        data: formData,
        displayText: getDisplayText(paymentMethod)
      };

      // Prepare multi-method structure
      const newMethods = {
        ...allMethods,
        [paymentMethod]: activeMethodData
      };

      const finalPayload = {
        primaryMethod: paymentMethod,
        methods: newMethods
      };

      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        paymentDetails: finalPayload
      });

      setPrimaryMethod(paymentMethod);
      setAllMethods(newMethods);
      showAlert({ title: t('common.success'), message: t('payment.save_success') });
    } catch (error) {
      console.error('Error saving payment details:', error);
      showAlert({ title: t('common.error'), message: t('payment.save_error') });
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDelete = () => {
    // Only show delete if there is data for THIS specific method
    if (!allMethods[paymentMethod]) return;

    showAlert({
      title: t('payment.delete_title'),
      message: t('payment.delete_confirm'),
      showCancel: true,
      confirmText: t('common.delete'),
      isDestructive: true,
      onConfirm: async () => {
        try {
          setIsSaving(true);
          const userRef = doc(db, 'users', auth.currentUser.uid);
          
          // Remove ONLY the active method from the map
          const updatedMethods = { ...allMethods };
          delete updatedMethods[paymentMethod];

          // If we deleted the primary method, pick another one or null
          let newPrimary = primaryMethod;
          if (primaryMethod === paymentMethod) {
            const remainingKeys = Object.keys(updatedMethods).filter(k => updatedMethods[k] !== null);
            newPrimary = remainingKeys.length > 0 ? remainingKeys[0] : null;
          }

          const hasRemainingData = Object.keys(updatedMethods).some(k => updatedMethods[k] !== null);

          await updateDoc(userRef, {
            paymentDetails: hasRemainingData ? {
              primaryMethod: newPrimary,
              methods: updatedMethods
            } : ""
          });
          
          // Reset local state for this tab
          resetTabFields(paymentMethod);
          setAllMethods(updatedMethods);
          
          if (!hasRemainingData) {
            setPrimaryMethod(null);
          } else if (newPrimary) {
            setPrimaryMethod(newPrimary);
          }
          
          showAlert({ title: t('common.success'), message: t('payment.delete_success') });
        } catch (error) {
          console.error('Error deleting payment details:', error);
          showAlert({ title: t('common.error'), message: t('common.error') });
        } finally {
          setIsSaving(false);
        }
      }
    });
  };

  const formatCardNumber = (value) => {
    const v = value.replace(/\D/g, '').substring(0, 16);
    const parts = v.match(/.{1,4}/g) || [];
    return parts.join(' ');
  };

  const formatExpiryDate = (value) => {
    const v = value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
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
              <View style={styles.headerLeft}>
                {hasMethodData(paymentMethod) && (
                  <TouchableOpacity onPress={handleConfirmDelete} style={styles.deleteBtn}>
                    <IconSymbol name="trash.fill" size={20} color="#ff4444" />
                  </TouchableOpacity>
                )}
              </View>
              
              <Text style={styles.headerTitle}>{t('payment.title')}</Text>
              
              <TouchableOpacity onPress={onClose} style={styles.headerRight}>
                <IconSymbol name="xmark" size={24} color="#fff" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
              <Text style={styles.label}>{t('payment.method_label')}</Text>
              <View style={styles.methodSelector}>
                <TouchableOpacity
                  style={[styles.methodBtn, paymentMethod === 'card' && styles.activeMethod]}
                  onPress={() => setPaymentMethod('card')}
                >
                  <View style={styles.methodIconWrapper}>
                    <IconSymbol name="creditcard.fill" size={20} color={paymentMethod === 'card' ? '#fff' : 'rgba(255,255,255,0.4)'} />
                    {primaryMethod === 'card' && hasMethodData('card') && <View style={styles.primaryIndicator} />}
                  </View>
                  <Text style={[styles.methodText, paymentMethod === 'card' && styles.activeMethodText]}>{t('payment.card')}</Text>
                  {primaryMethod === 'card' && hasMethodData('card') && <Text style={styles.badgeText}>{t('payment.primary_badge')}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.methodBtn, paymentMethod === 'paypal' && styles.activeMethod]}
                  onPress={() => setPaymentMethod('paypal')}
                >
                  <View style={styles.methodIconWrapper}>
                    <IconSymbol name="p.square.fill" size={20} color={paymentMethod === 'paypal' ? '#fff' : 'rgba(255,255,255,0.4)'} />
                    {primaryMethod === 'paypal' && hasMethodData('paypal') && <View style={styles.primaryIndicator} />}
                  </View>
                  <Text style={[styles.methodText, paymentMethod === 'paypal' && styles.activeMethodText]}>{t('payment.paypal')}</Text>
                  {primaryMethod === 'paypal' && hasMethodData('paypal') && <Text style={styles.badgeText}>{t('payment.primary_badge')}</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.methodBtn, paymentMethod === 'crypto' && styles.activeMethod]}
                  onPress={() => setPaymentMethod('crypto')}
                >
                  <View style={styles.methodIconWrapper}>
                    <IconSymbol name="bitcoinsign.circle.fill" size={20} color={paymentMethod === 'crypto' ? '#fff' : 'rgba(255,255,255,0.4)'} />
                    {primaryMethod === 'crypto' && hasMethodData('crypto') && <View style={styles.primaryIndicator} />}
                  </View>
                  <Text style={[styles.methodText, paymentMethod === 'crypto' && styles.activeMethodText]}>{t('payment.crypto')}</Text>
                  {primaryMethod === 'crypto' && hasMethodData('crypto') && <Text style={styles.badgeText}>{t('payment.primary_badge')}</Text>}
                </TouchableOpacity>
              </View>

              <View style={styles.form}>
                {paymentMethod === 'card' && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>{t('payment.card_number')}</Text>
                      <TextInput
                        style={[styles.input, errors.cardNumber && styles.inputError]}
                        value={formData.cardNumber}
                        onChangeText={(text) => updateField('cardNumber', formatCardNumber(text))}
                        placeholder={t('payment.placeholders.card_number')}
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        keyboardType="numeric"
                        maxLength={19}
                      />
                      {errors.cardNumber && <Text style={styles.errorText}>{errors.cardNumber}</Text>}
                    </View>

                    <View style={styles.row}>
                      <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
                        <Text style={styles.inputLabel}>{t('payment.expiry_date')}</Text>
                        <TextInput
                          style={[styles.input, errors.expiryDate && styles.inputError]}
                          value={formData.expiryDate}
                          onChangeText={(text) => updateField('expiryDate', formatExpiryDate(text))}
                          placeholder={t('payment.placeholders.expiry_date')}
                          placeholderTextColor="rgba(255,255,255,0.2)"
                          keyboardType="numeric"
                          maxLength={5}
                        />
                        {errors.expiryDate && <Text style={styles.errorText}>{errors.expiryDate}</Text>}
                      </View>

                      <View style={[styles.inputGroup, { flex: 1 }]}>
                        <Text style={styles.inputLabel}>{t('payment.cvv')}</Text>
                        <TextInput
                          style={[styles.input, errors.cvv && styles.inputError]}
                          value={formData.cvv}
                          onChangeText={(text) => updateField('cvv', text.replace(/\D/g, '').substring(0, 4))}
                          placeholder={t('payment.placeholders.cvv')}
                          placeholderTextColor="rgba(255,255,255,0.2)"
                          keyboardType="numeric"
                          secureTextEntry
                          maxLength={4}
                        />
                        {errors.cvv && <Text style={styles.errorText}>{errors.cvv}</Text>}
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>{t('payment.cardholder_name')}</Text>
                      <TextInput
                        style={[styles.input, errors.cardholderName && styles.inputError]}
                        value={formData.cardholderName}
                        onChangeText={(text) => updateField('cardholderName', text)}
                        placeholder={t('payment.placeholders.cardholder')}
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        autoCapitalize="words"
                      />
                      {errors.cardholderName && <Text style={styles.errorText}>{errors.cardholderName}</Text>}
                    </View>
                  </>
                )}

                {paymentMethod === 'paypal' && (
                  <View style={styles.inputGroup}>
                    <Text style={styles.inputLabel}>{t('payment.paypal_email')}</Text>
                    <TextInput
                      style={[styles.input, errors.paypalEmail && styles.inputError]}
                      value={formData.paypalEmail}
                      onChangeText={(text) => updateField('paypalEmail', text.toLowerCase())}
                      placeholder={t('payment.placeholders.paypal')}
                      placeholderTextColor="rgba(255,255,255,0.2)"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                    {errors.paypalEmail && <Text style={styles.errorText}>{errors.paypalEmail}</Text>}
                    <View style={styles.infoBox}>
                      <Text style={styles.infoText}>{t('payment.paypal_info')}</Text>
                    </View>
                  </View>
                )}

                {paymentMethod === 'crypto' && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>{t('payment.crypto_type')}</Text>
                      <View style={styles.cryptoSelector}>
                        {['bitcoin', 'ethereum', 'usdt', 'usdc'].map((type) => (
                          <TouchableOpacity
                            key={type}
                            style={[styles.cryptoTypeBtn, formData.cryptoType === type && styles.activeCryptoType]}
                            onPress={() => updateField('cryptoType', type)}
                          >
                            <Text style={[styles.cryptoTypeText, formData.cryptoType === type && styles.activeCryptoTypeText]}>
                              {type.toUpperCase()}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>{t('payment.wallet_address')}</Text>
                      <TextInput
                        style={[styles.input, errors.cryptoWallet && styles.inputError]}
                        value={formData.cryptoWallet}
                        onChangeText={(text) => updateField('cryptoWallet', text.trim())}
                        placeholder={t('payment.placeholders.crypto')}
                        placeholderTextColor="rgba(255,255,255,0.2)"
                        autoCapitalize="none"
                      />
                      {errors.cryptoWallet && <Text style={styles.errorText}>{errors.cryptoWallet}</Text>}
                      <View style={styles.infoBox}>
                        <Text style={styles.infoText}>
                          {t('payment.crypto_info', { type: formData.cryptoType.toUpperCase() })}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, isSaving && styles.disabledBtn]}
                onPress={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>{t('payment.save_btn')}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>

        <ActionModal 
          {...alertConfig} 
          onClose={closeAlert}
          onConfirm={() => {
            if (alertConfig.onConfirm) alertConfig.onConfirm();
            closeAlert();
          }}
        />
      </View>
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
    height: '85%',
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
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  deleteBtn: {
    padding: 4,
  },
  scrollContent: {
    padding: 24,
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
    marginBottom: 12,
    fontWeight: '600',
  },
  methodSelector: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 32,
  },
  methodBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 4,
    position: 'relative',
  },
  methodIconWrapper: {
    position: 'relative',
    marginBottom: 2,
  },
  primaryIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.primary,
    borderWidth: 2,
    borderColor: '#030e21',
  },
  badgeText: {
    color: Colors.dark.primary,
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: -2,
  },
  activeMethod: {
    backgroundColor: 'rgba(13, 139, 209, 0.15)',
    borderColor: Colors.dark.primary,
  },
  methodText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '600',
  },
  activeMethodText: {
    color: '#fff',
  },
  form: {
    marginBottom: 32,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 15,
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  inputError: {
    borderColor: '#ff4444',
  },
  errorText: {
    color: '#ff4444',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  row: {
    flexDirection: 'row',
  },
  infoBox: {
    backgroundColor: 'rgba(13, 139, 209, 0.08)',
    borderRadius: 12,
    padding: 12,
    marginTop: 10,
  },
  infoText: {
    color: 'rgba(13, 139, 209, 0.7)',
    fontSize: 13,
    lineHeight: 18,
  },
  cryptoSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cryptoTypeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  activeCryptoType: {
    backgroundColor: 'rgba(13, 139, 209, 0.2)',
    borderColor: Colors.dark.primary,
  },
  cryptoTypeText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    fontWeight: '700',
  },
  activeCryptoTypeText: {
    color: '#fff',
  },
  saveBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 40,
    shadowColor: Colors.dark.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  primaryToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  primaryTextContainer: {
    flex: 1,
  },
  primaryLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  primaryHelp: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
  },
  disabledToggle: {
    opacity: 0.4,
  }
});

export default PaymentDetailsModal;
