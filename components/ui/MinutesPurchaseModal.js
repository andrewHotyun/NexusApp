import { LinearGradient } from 'expo-linear-gradient';
import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
  writeBatch
} from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Dimensions,
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
import { db } from '../../utils/firebase';
import { ActionModal } from './ActionModal';
import { IconSymbol } from './icon-symbol';
import { Toast } from './Toast';

const { width } = Dimensions.get('window');

export function MinutesPurchaseModal({ visible, onClose, userProfile }) {
  const { t } = useTranslation();

  const [selectedPackage, setSelectedPackage] = useState(null);
  const [step, setStep] = useState('packages'); // packages, methods, add_details
  const [addingMethodType, setAddingMethodType] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [savedMethods, setSavedMethods] = useState([]);
  const [selectedMethod, setSelectedMethod] = useState(null);

  const [paymentData, setPaymentData] = useState({
    cardNumber: '',
    cardholderName: '',
    expiryDate: '',
    cvv: '',
    paypalEmail: '',
    cryptoWallet: '',
    selectedCrypto: 'BTC'
  });
  const [errors, setErrors] = useState({});
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastTitle, setToastTitle] = useState('');
  const [toastType, setToastType] = useState('success');
  const [methodIndexToDelete, setMethodIndexToDelete] = useState(null);
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

  const packages = [
    { id: 'basic', minutes: 30, price: 10.00 },
    { id: 'premium', minutes: 60, price: 25.00 },
    { id: 'unlimited', minutes: 360, price: 50.00 }
  ];

  useEffect(() => {
    if (visible) {
      // Reset state on open
      setSelectedPackage(null);
      setStep('packages');
      setAddingMethodType(null);
      setSelectedMethod(null);
      setPaymentData({
        cardNumber: '',
        cardholderName: '',
        expiryDate: '',
        cvv: '',
        paypalEmail: '',
        cryptoWallet: '',
        selectedCrypto: 'BTC'
      });
      setErrors({});
      setToastVisible(false);
      setToastTitle('');
      setToastType('success');

      if (userProfile?.uid) {
        loadSavedMethods();
      }
    }
  }, [visible, userProfile?.uid]);

  const loadSavedMethods = async () => {
    try {
      const userSnap = await getDoc(doc(db, 'users', userProfile.uid));
      if (userSnap.exists()) {
        const methods = userSnap.data().savedPaymentMethods || [];
        setSavedMethods(methods);
        if (methods.length > 0) {
          setSelectedMethod(methods[0]);
        }
      }
    } catch (e) {
      console.error('Error loading saved methods:', e);
    }
  };

  const getCardType = (number) => {
    const clean = number.replace(/\s/g, '');
    if (/^4/.test(clean)) return 'visa';
    if (/^(5[1-5]|2[2-7])/.test(clean)) return 'mastercard';
    if (/^3[47]/.test(clean)) return 'amex';
    if (/^6(011|5|4|22)/.test(clean)) return 'discover';
    return 'unknown';
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
    if (addingMethodType === 'card') {
      const cleanNumber = paymentData.cardNumber.replace(/\s/g, '');
      const cardType = getCardType(cleanNumber);

      // Card Number Validation
      const expectedLength = cardType === 'amex' ? 15 : 16;
      if (!cleanNumber) {
        newErrors.cardNumber = t('payment.errors.number_required') || 'Number required';
      } else if (cleanNumber.length !== expectedLength && cardType !== 'unknown') {
        newErrors.cardNumber = t('payment.errors.must_be_digits', { count: expectedLength });
      } else if (cleanNumber.length < 13) {
        newErrors.cardNumber = t('payment.errors.invalid_card');
      } else if (!validateLuhn(cleanNumber)) {
        newErrors.cardNumber = t('payment.errors.invalid_card');
      }

      // Expiry Validation
      if (!paymentData.expiryDate || !/^(0[1-9]|1[0-2])\/(\d{2})$/.test(paymentData.expiryDate)) {
        newErrors.expiryDate = t('payment.errors.invalid_expiry');
      } else {
        const [month, year] = paymentData.expiryDate.split('/');
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = parseInt(now.getFullYear().toString().slice(-2));
        const expMonth = parseInt(month, 10);
        const expYear = parseInt(year, 10);
        if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) {
          newErrors.expiryDate = t('payment.errors.expiry_past');
        }
      }

      // CVV Validation (Amex uses 4 digits, others 3)
      const expectedCvvLength = cardType === 'amex' ? 4 : 3;
      if (!paymentData.cvv) {
        newErrors.cvv = t('payment.errors.cvv');
      } else if (paymentData.cvv.length !== expectedCvvLength && cardType !== 'unknown') {
        newErrors.cvv = t('payment.errors.must_be_digits', { count: expectedCvvLength });
      } else if (!/^\d{3,4}$/.test(paymentData.cvv)) {
        newErrors.cvv = t('payment.errors.invalid_cvv');
      }

      // Name Validation (Strict Latin)
      const name = paymentData.cardholderName.trim();
      const nameParts = name.split(/\s+/).filter(p => p.length > 0);
      if (!name) {
        newErrors.cardholderName = t('payment.errors.cardholder_name');
      } else if (nameParts.length < 2) {
        newErrors.cardholderName = t('payment.errors.enter_full_name');
      } else if (/[^A-Z\s-]/.test(name.toUpperCase())) { // Latin only
        newErrors.cardholderName = t('payment.errors.latin_only');
      }
    } else if (addingMethodType === 'paypal') {
      if (!paymentData.paypalEmail || !/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,10}$/.test(paymentData.paypalEmail)) {
        newErrors.paypalEmail = t('payment.errors.email_invalid_format');
      }
    } else if (addingMethodType === 'crypto') {
      const wallet = paymentData.cryptoWallet.trim();
      const cryptoType = paymentData.selectedCrypto;

      if (!wallet) {
        newErrors.cryptoWallet = t('payment.errors.wallet_address');
      } else {
        let isValid = true;
        if (cryptoType === 'BTC' && !/^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,39}$/.test(wallet)) isValid = false;
        if (cryptoType === 'ETH' && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) isValid = false;
        if (cryptoType === 'USDT' && !/^0x[a-fA-F0-9]{40}$/.test(wallet) && !/^T[A-Za-z1-9]{33}$/.test(wallet)) isValid = false;

        if (!isValid) {
          newErrors.cryptoWallet = t('payment.errors.wallet_address');
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleManualPurchase = async (pkg) => {
    setProcessing(true);
    try {
      const userRef = doc(db, 'users', userProfile.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const currentBalance = userSnap.data().minutesBalance || 0;
        const newBalance = currentBalance + pkg.minutes;

        const batch = writeBatch(db);
        batch.update(userRef, {
          minutesBalance: newBalance,
          updatedAt: serverTimestamp()
        });

        const paymentRef = doc(collection(db, 'instantPayments'));
        batch.set(paymentRef, {
          userId: userProfile.uid,
          packageId: pkg.id,
          minutes: pkg.minutes,
          amountUSD: pkg.price,
          amountUAH: pkg.price * 40,
          paymentMethod: 'instant_test',
          status: 'completed',
          completedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });

        await batch.commit();
        
        // Show success toast
        setToastTitle(t('success_toast.minutes_added'));
        setToastMessage(t('success_toast.added_minutes_desc', { count: pkg.minutes }));
        setToastType('success');
        setToastVisible(true);

        // Close immediately
        onClose();
      }
    } catch (e) {
      console.error('Purchase error:', e);
    } finally {
      setProcessing(false);
    }
  };

  const handleDeleteMethod = (index) => {
    showAlert({
      title: t('purchase.delete_method_title'),
      message: t('purchase.delete_method_confirm'),
      confirmText: t('common.delete'),
      isDestructive: true,
      onConfirm: async () => {
        try {
          const updatedMethods = savedMethods.filter((_, i) => i !== index);
          const userRef = doc(db, 'users', userProfile.uid);
          await updateDoc(userRef, { savedPaymentMethods: updatedMethods });

          setSavedMethods(updatedMethods);
          if (selectedMethod === savedMethods[index]) {
            setSelectedMethod(updatedMethods.length > 0 ? updatedMethods[0] : null);
          }

          setToastMessage(t('purchase.method_deleted_toast'));
          setToastType('success');
          setToastVisible(true);
        } catch (err) {
          setToastMessage(t('purchase.method_delete_error'));
          setToastType('error');
          setToastVisible(true);
        }
      }
    });
  };

  const saveNewMethod = async () => {
    if (!validateForm()) return;
    setProcessing(true);
    try {
      let displayName = '';
      let details = {};
      if (addingMethodType === 'card') {
        const last4 = paymentData.cardNumber.slice(-4);
        displayName = `${t('purchase.card')} ****${last4}`;
        details = { last4, cardholder: paymentData.cardholderName };
      } else if (addingMethodType === 'paypal') {
        displayName = `PayPal: ${paymentData.paypalEmail}`;
        details = { email: paymentData.paypalEmail };
      } else if (addingMethodType === 'crypto') {
        displayName = `${paymentData.selectedCrypto}: ${paymentData.cryptoWallet.slice(0, 6)}...`;
        details = { wallet: paymentData.cryptoWallet, type: paymentData.selectedCrypto };
      }

      const newMethod = {
        type: addingMethodType,
        displayName,
        details,
        addedAt: new Date().toISOString()
      };

      const userRef = doc(db, 'users', userProfile.uid);
      await updateDoc(userRef, {
        savedPaymentMethods: [...savedMethods, newMethod]
      });

      setSavedMethods([...savedMethods, newMethod]);
      setSelectedMethod(newMethod);
      setStep('packages');
      setAddingMethodType(null);
      setPaymentData({
        cardNumber: '',
        cardholderName: '',
        expiryDate: '',
        cvv: '',
        paypalEmail: '',
        cryptoWallet: '',
        selectedCrypto: 'BTC'
      });
    } catch (e) {
      console.error('Save method error:', e);
    } finally {
      setProcessing(false);
    }
  };

  const renderContent = () => {
    try {
      if (step === 'packages') {
        return (
          <View style={styles.modalBody}>
            <View style={styles.balanceContainer}>
              <Text style={styles.balanceLabel}>{t('purchase.current_balance')}</Text>
              <Text style={styles.balanceValue}>
                {userProfile?.minutesBalance || 0} {t('purchase.minutes_unit')}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>{t('purchase.choose_package')}</Text>

            <View style={styles.packagesVerticalList}>
              {packages.map((pkg) => (
                <TouchableOpacity
                  key={pkg.id}
                  style={[
                    styles.packageCardWide,
                    selectedPackage?.id === pkg.id && styles.packageCardWideSelected
                  ]}
                  onPress={() => setSelectedPackage(pkg)}
                >
                  <View style={styles.pkgInfoSide}>
                    <View style={styles.pkgIconRing}>
                      <IconSymbol
                        name="timer"
                        size={20}
                        color={selectedPackage?.id === pkg.id ? '#fff' : '#0d8bd1'}
                      />
                    </View>
                    <Text style={styles.pkgMinutesWide}>
                      {pkg.minutes} <Text style={styles.pkgUnitText}>{t('purchase.minutes_unit')}</Text>
                    </Text>
                  </View>
                  <View style={[styles.pkgPriceTag, selectedPackage?.id === pkg.id && styles.pkgPriceTagSelected]}>
                    <Text style={[styles.pkgPriceText, selectedPackage?.id === pkg.id && { color: '#fff' }]}>
                      ${pkg.price.toFixed(0)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {selectedPackage && (
              <TouchableOpacity
                style={styles.methodSelectorRow}
                onPress={() => setStep('methods')}
              >
                <View style={styles.methodSelectorLeft}>
                  <IconSymbol
                    name={selectedMethod?.type === 'card' ? 'creditcard.fill' : 'ion:wallet'}
                    size={18}
                    color="#bdc3c7"
                  />
                  <Text style={styles.methodSelectorText}>
                    {selectedMethod ? selectedMethod.displayName : t('purchase.method_selector_placeholder')}
                  </Text>
                </View>
                <IconSymbol name="chevron.right" size={14} color="rgba(255,255,255,0.3)" />
              </TouchableOpacity>
            )}

            <View style={{ height: 15 }} />

            <TouchableOpacity
              style={[styles.mainBtn, !selectedPackage && styles.btnDisabled]}
              onPress={() => {
                if (selectedMethod) {
                  handleManualPurchase(selectedPackage);
                } else {
                  setToastMessage(t('purchase.error_select_method'));
                  setToastType('error');
                  setToastVisible(true);
                }
              }}
              disabled={!selectedPackage || processing}
            >
              <LinearGradient
                colors={['#0d8bd1', '#0a7ea4']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.mainBtnGradient}
              >
                {processing ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.mainBtnText}>
                    {t('purchase.buy_btn')}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        );
      }

      if (step === 'methods') {
        return (
          <View style={styles.modalBody}>
            <TouchableOpacity style={styles.backBtn} onPress={() => setStep('packages')}>
              <IconSymbol name="chevron.left" size={20} color="#fff" />
              <Text style={styles.backBtnText}>{t('purchase.back')}</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>{t('purchase.choose_payment')}</Text>

            <ScrollView style={styles.methodsList} showsVerticalScrollIndicator={false}>
              {savedMethods.map((m, i) => (
                <View key={i} style={[styles.methodItem, { padding: 0 }]}>
                  <TouchableOpacity
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 15 }}
                    onPress={() => {
                      setSelectedMethod(m);
                      setStep('packages');
                    }}
                  >
                    <IconSymbol name={m.type === 'card' ? 'creditcard' : 'ion:wallet'} size={24} color="#fff" />
                    <Text style={styles.methodName}>{m.displayName}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={{ padding: 16 }} onPress={() => handleDeleteMethod(i)}>
                    <IconSymbol name="trash.fill" size={20} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              ))}

              <TouchableOpacity style={[styles.methodItem, styles.addNewItem]} onPress={() => setStep('add_details')}>
                <IconSymbol name="plus.circle.fill" size={24} color="#0ef0ff" />
                <Text style={[styles.methodName, { color: '#0ef0ff' }]}>{t('purchase.add_new_payment')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        );
      }

      if (step === 'add_details') {
        return (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ flex: 1 }}
          >
            <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => {
                  if (addingMethodType) {
                    setAddingMethodType(null);
                    setPaymentData({
                      cardNumber: '',
                      cardholderName: '',
                      expiryDate: '',
                      cvv: '',
                      paypalEmail: '',
                      cryptoWallet: '',
                      selectedCrypto: 'BTC'
                    });
                    setErrors({});
                  } else {
                    setStep('methods');
                  }
                }}
              >
                <IconSymbol name="chevron.left" size={20} color="#fff" />
                <Text style={styles.backBtnText}>{t('purchase.back')}</Text>
              </TouchableOpacity>

              {!addingMethodType ? (
                <>
                  <Text style={styles.sectionTitle}>{t('purchase.select_method_title')}</Text>
                  <View style={styles.methodsChoiceList}>
                    <TouchableOpacity style={styles.choiceItem} onPress={() => setAddingMethodType('card')}>
                      <View style={styles.choiceIcon}>
                        <IconSymbol name="creditcard.fill" size={24} color="#0ef0ff" />
                      </View>
                      <View style={styles.choiceInfo}>
                        <Text style={styles.choiceTitle}>{t('purchase.card')}</Text>
                        <Text style={styles.choiceDesc}>{t('purchase.card_desc')}</Text>
                      </View>
                      <IconSymbol name="chevron.right" size={16} color="#7f8c8d" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.choiceItem} onPress={() => setAddingMethodType('paypal')}>
                      <View style={styles.choiceIcon}>
                        <IconSymbol name="ion:logo-paypal" size={24} color="#0ef0ff" />
                      </View>
                      <View style={styles.choiceInfo}>
                        <Text style={styles.choiceTitle}>{t('purchase.paypal')}</Text>
                        <Text style={styles.choiceDesc}>{t('purchase.paypal_desc')}</Text>
                      </View>
                      <IconSymbol name="chevron.right" size={16} color="#7f8c8d" />
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.choiceItem} onPress={() => setAddingMethodType('crypto')}>
                      <View style={styles.choiceIcon}>
                        <IconSymbol name="bitcoinsign.circle.fill" size={24} color="#0ef0ff" />
                      </View>
                      <View style={styles.choiceInfo}>
                        <Text style={styles.choiceTitle}>{t('purchase.crypto')}</Text>
                        <Text style={styles.choiceDesc}>{t('purchase.crypto_instructions')}</Text>
                      </View>
                      <IconSymbol name="chevron.right" size={16} color="#7f8c8d" />
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={styles.form}>
                  {addingMethodType === 'card' && (
                    <>
                      <TextInput
                        style={[styles.input, errors.cardholderName && styles.inputError]}
                        placeholder={t('payment.cardholder_name')}
                        placeholderTextColor="#7f8c8d"
                        autoCorrect={false}
                        spellCheck={false}
                        autoCapitalize="characters"
                        value={paymentData.cardholderName}
                        onChangeText={v => {
                          const sanitized = v.replace(/[0-9]/g, '').toUpperCase();
                          setPaymentData({ ...paymentData, cardholderName: sanitized });
                          if (errors.cardholderName) setErrors({ ...errors, cardholderName: null });
                        }}
                      />
                      {errors.cardholderName ? <Text style={styles.errorText}>{errors.cardholderName}</Text> : null}
                      <TextInput
                        style={[styles.input, errors.cardNumber && styles.inputError]}
                        placeholder={t('payment.card_number')}
                        placeholderTextColor="#7f8c8d"
                        keyboardType="numeric"
                        maxLength={19}
                        value={paymentData.cardNumber}
                        onChangeText={v => {
                          const clean = v.replace(/\D/g, '');
                          const formatted = clean.replace(/(.{4})/g, '$1 ').trim();
                          setPaymentData({ ...paymentData, cardNumber: formatted });
                          if (errors.cardNumber) setErrors({ ...errors, cardNumber: null });
                        }}
                      />
                      {errors.cardNumber ? <Text style={styles.errorText}>{errors.cardNumber}</Text> : null}
                      <View style={styles.row}>
                        <View style={{ flex: 1 }}>
                          <TextInput
                            style={[styles.input, { marginBottom: 0 }, errors.expiryDate && styles.inputError]}
                            placeholder="MM/YY"
                            placeholderTextColor="#7f8c8d"
                            maxLength={5}
                            value={paymentData.expiryDate}
                            onChangeText={v => {
                              let clean = v.replace(/\D/g, '');
                              if (clean.length > 2) clean = clean.slice(0, 2) + '/' + clean.slice(2, 4);
                              setPaymentData({ ...paymentData, expiryDate: clean });
                              if (errors.expiryDate) setErrors({ ...errors, expiryDate: null });
                            }}
                          />
                          {errors.expiryDate ? <Text style={[styles.errorText, { marginTop: 4 }]}>{errors.expiryDate}</Text> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <TextInput
                            style={[styles.input, { marginBottom: 0 }, errors.cvv && styles.inputError]}
                            placeholder="CVV"
                            placeholderTextColor="#7f8c8d"
                            keyboardType="numeric"
                            maxLength={4}
                            secureTextEntry
                            autoCorrect={false}
                            value={paymentData.cvv}
                            onChangeText={v => {
                              setPaymentData({ ...paymentData, cvv: v });
                              if (errors.cvv) setErrors({ ...errors, cvv: null });
                            }}
                          />
                          {errors.cvv ? <Text style={[styles.errorText, { marginTop: 4 }]}>{errors.cvv}</Text> : null}
                        </View>
                      </View>
                    </>
                  )}

                  {addingMethodType === 'paypal' && (
                    <>
                      <TextInput
                        style={[styles.input, errors.paypalEmail && styles.inputError]}
                        placeholder={t('payment.paypal_email')}
                        placeholderTextColor="#7f8c8d"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        spellCheck={false}
                        value={paymentData.paypalEmail}
                        onChangeText={v => {
                          setPaymentData({ ...paymentData, paypalEmail: v });
                          if (errors.paypalEmail) setErrors({ ...errors, paypalEmail: null });
                        }}
                      />
                      {errors.paypalEmail ? <Text style={styles.errorText}>{errors.paypalEmail}</Text> : null}
                    </>
                  )}

                  {addingMethodType === 'crypto' && (
                    <>
                      <View style={styles.cryptoSelect}>
                        {['BTC', 'ETH', 'USDT'].map(c => {
                          const isActive = paymentData.selectedCrypto === c;
                          const activeColor = c === 'BTC' ? '#F7931A' : c === 'ETH' ? '#627EEA' : '#26A17B';
                          return (
                            <TouchableOpacity
                              key={c}
                              style={[
                                styles.cryptoBtn,
                                isActive && { backgroundColor: activeColor, borderColor: activeColor }
                              ]}
                              onPress={() => setPaymentData({ ...paymentData, selectedCrypto: c })}
                            >
                              <Text style={[styles.cryptoBtnText, isActive && { color: '#fff' }]}>{c}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      <TextInput
                        style={[styles.input, errors.cryptoWallet && styles.inputError]}
                        placeholder={t('payment.wallet_address')}
                        placeholderTextColor="#7f8c8d"
                        value={paymentData.cryptoWallet}
                        onChangeText={v => setPaymentData({ ...paymentData, cryptoWallet: v })}
                      />
                      {errors.cryptoWallet ? <Text style={styles.errorText}>{errors.cryptoWallet}</Text> : null}
                    </>
                  )}

                  <TouchableOpacity style={styles.mainBtn} onPress={saveNewMethod} disabled={processing}>
                    <LinearGradient
                      colors={['#0d8bd1', '#0a7ea4']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.mainBtnGradient}
                    >
                      {processing ? <ActivityIndicator color="#fff" /> : <Text style={styles.mainBtnText}>{t('common.save')}</Text>}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        );
      }
    } catch (err) {
      console.error('Modal render error:', err);
    }

    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color="#0d8bd1" />
      </View>
    );
  };

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        statusBarTranslucent={true}
        onRequestClose={onClose}
      >
        <View style={styles.container}>
          <View style={styles.overlayWrapper}>
            <TouchableOpacity
              style={styles.overlay}
              activeOpacity={1}
              onPress={onClose}
            />
          </View>
  
          <View style={styles.modalContent}>
            <LinearGradient
              colors={['rgba(30, 45, 75, 0.98)', 'rgba(11, 18, 32, 1)']}
              style={styles.gradient}
            >
              <View style={styles.header}>
                <View style={styles.headerTitleContainer}>
                  <IconSymbol name="timer" size={28} color="#0d8bd1" style={{ marginBottom: -2 }} />
                  <Text style={styles.title}>{t('purchase.title')}</Text>
                </View>
                <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                  <IconSymbol name="xmark.circle.fill" size={32} color="rgba(255, 255, 255, 0.4)" />
                </TouchableOpacity>
              </View>
  
              {renderContent()}
            </LinearGradient>
          </View>
  
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

      <Toast
        visible={toastVisible}
        title={toastTitle}
        message={toastMessage}
        type={toastType}
        onHide={() => setToastVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  overlayWrapper: {
    ...StyleSheet.absoluteFillObject,
  },
  overlay: {
    flex: 1,
  },
  modalContent: {
    width: width * 0.94,
    maxWidth: 420,
    height: Platform.OS === 'ios' ? 580 : 600,
    backgroundColor: '#0a1220',
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(14, 240, 255, 0.3)',
    elevation: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
  },
  gradient: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 25,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
    minHeight: 40,
    position: 'relative',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    padding: 5,
  },
  modalBody: {
    flex: 1,
  },
  balanceContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    padding: 16,
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  balanceLabel: {
    color: '#bdc3c7',
    fontSize: 13,
    marginBottom: 4,
  },
  balanceValue: {
    color: '#0d8bd1',
    fontSize: 26,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    textAlign: 'center',
  },
  packagesVerticalList: {
    gap: 10,
    marginBottom: 12,
  },
  packageCardWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 18,
    padding: 12,
    paddingHorizontal: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    minHeight: 65,
  },
  packageCardWideSelected: {
    backgroundColor: 'rgba(13, 139, 209, 0.12)',
    borderColor: '#0d8bd1',
  },
  pkgInfoSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  pkgIconRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(13, 139, 209, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pkgMinutesWide: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  pkgUnitText: {
    fontSize: 14,
    color: '#bdc3c7',
    fontWeight: '400',
  },
  pkgPriceTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 12,
    minWidth: 64,
    alignItems: 'center',
  },
  pkgPriceTagSelected: {
    backgroundColor: '#0d8bd1',
  },
  pkgPriceText: {
    color: '#0d8bd1',
    fontSize: 18,
    fontWeight: '800',
  },
  mainBtn: {
    height: 54,
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 5,
  },
  mainBtnGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  backBtnText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  methodsList: {
    flex: 1,
  },
  methodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    gap: 15,
  },
  addNewItem: {
    marginTop: 10,
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: '#0ef0ff',
  },
  methodName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  methodsChoiceList: {
    gap: 12,
    marginTop: 10,
  },
  choiceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 18,
    padding: 16,
    gap: 16,
  },
  choiceIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(14, 240, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  choiceInfo: {
    flex: 1,
  },
  choiceTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  choiceDesc: {
    color: '#7f8c8d',
    fontSize: 12,
  },
  form: {
    marginTop: 10,
    gap: 15,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 15,
    height: 55,
    paddingHorizontal: 15,
    color: '#fff',
    fontSize: 16,
  },
  inputError: {
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  errorText: {
    color: '#ff4d4d',
    fontSize: 12,
    marginTop: -10,
    marginBottom: 12,
    marginLeft: 5,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: 15,
  },
  halfInput: {
    flex: 1,
  },
  cryptoSelect: {
    flexDirection: 'row',
    gap: 10,
  },
  cryptoBtn: {
    flex: 1,
    height: 45,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cryptoBtnActive: {
    backgroundColor: '#0ef0ff',
  },
  cryptoBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  methodSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 14,
    padding: 12,
    marginTop: -8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  methodSelectorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  methodSelectorText: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: '600',
  },
});
