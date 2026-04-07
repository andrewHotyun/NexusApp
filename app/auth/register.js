import { IconSymbol } from '../../components/ui/icon-symbol';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Country, City, State } from 'country-state-city';
import { deduplicateCities } from '../../utils/locationUtils';
import { SearchablePicker } from '../../components/ui/SearchablePicker';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  StatusBar
} from 'react-native';
import { Colors } from '../../constants/theme';
import { auth, db } from '../../utils/firebase';
import { ActionModal } from '../../components/ui/ActionModal';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  // Basic fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [gender, setGender] = useState('man');

  // New fields from web parity
  const [age, setAge] = useState('');
  const [country, setCountry] = useState('');
  const [countryIso, setCountryIso] = useState('');
  const [city, setCity] = useState('');
  const [chatType, setChatType] = useState('normal');
  const [avatar, setAvatar] = useState(null);

  const [showCountryPicker, setShowCountryPicker] = useState(false);
  const [showCityPicker, setShowCityPicker] = useState(false);

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [actionModal, setActionModal] = useState({ 
    visible: false, title: '', message: '', confirmText: 'OK', onConfirm: () => {}, isDestructive: false, showCancel: true 
  });

  // Memoized country data for the picker
  const allCountries = useMemo(() => {
    return Country.getAllCountries().map(c => ({
      label: `${c.flag} ${c.name}`,
      value: c.name,
      isoCode: c.isoCode
    }));
  }, []);

  // Memoized city data based on selected country
  const allCities = useMemo(() => {
    if (!countryIso) return [];
    const cities = City.getCitiesOfCountry(countryIso);
    return deduplicateCities(cities).map(c => ({
      label: c.name,
      value: c.name
    }));
  }, [countryIso]);

  // Firebase error code handling matching web version
  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/email-already-in-use':
        return t('auth.emailInUse', 'This email is already registered. Try logging in.');
      case 'auth/invalid-email':
        return t('auth.invalidEmail', 'Please enter a valid email address.');
      case 'auth/operation-not-allowed':
        return t('auth.operationNotAllowed', 'Email registration is currently disabled.');
      case 'auth/weak-password':
        return t('auth.weakPassword', 'Password is too weak. Use at least 6 characters.');
      case 'auth/network-request-failed':
        return t('auth.networkError', 'Network error. Please check your internet connection.');
      default:
        return t('auth.registerError', 'Something went wrong. Please check the fields and try again.');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      setActionModal({
        visible: true,
        title: t('auth.permissionDenied'),
        message: t('auth.permissionDenied', 'Sorry, we need camera roll permissions to make this work!'),
        confirmText: t('common.ok'),
        showCancel: false
      });
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1.0,
      base64: true,
    });

    if (!result.canceled) {
      setAvatar(result.assets[0]);
    }
  };

  const handleRegister = async () => {
    const errors = {};

    // Validation matching web logic
    const nameTrimmed = name.trim();
    
    // Name: minimum 4 characters
    if (!nameTrimmed || nameTrimmed.length < 4) {
      errors.name = t('auth.errorNameLong', 'Name must be at least 4 characters');
    } else {
      // Name must contain at least one letter (any language) — matching web
      const nameHasLetters = /\p{L}/u.test(nameTrimmed);
      if (!nameHasLetters) {
        errors.name = t('auth.errorNameLetters', 'Name must contain letters');
      }
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email.trim())) {
      errors.email = t('auth.errorEmailInvalid', 'Please enter a valid email address');
    }

    // Password validation
    if (!password || password.length < 6) {
      errors.password = t('auth.errorPasswordShort', 'Min 6 characters required');
    }

    // Age validation
    if (!age || parseInt(age) < 18) {
      errors.age = t('auth.errorAge', 'You must be 18+ years old');
    }

    // Location validation
    if (!country.trim()) {
      errors.country = t('auth.errorCountry', 'Please specify your country');
    }
    if (!city.trim()) {
      errors.city = t('auth.errorCity', 'Please specify your city');
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      setError(t('auth.correctFields', 'Please correct the highlighted fields'));
      return;
    }

    setLoading(true);
    setError('');
    setFieldErrors({});

    try {
      // 1. Create Auth Account
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Update Profile Name
      await updateProfile(user, { displayName: nameTrimmed });

      // 3. Create Firestore User Document — avatar starts empty, updated in background
      const userData = {
        uid: user.uid,
        name: nameTrimmed,
        displayName: nameTrimmed,
        email: email.trim(),
        gender: gender,
        age: parseInt(age),
        country: country.trim(),
        city: city.trim(),
        chatType: chatType,
        avatar: '',  // Start empty, will be updated with compressed version
        isVerified: gender === 'woman' ? false : null,
        verificationSubmitted: false,
        role: 'user',
        balance: 0,
        minutesBalance: 0,
        createdAt: serverTimestamp(),
        lastSeen: serverTimestamp(),
        isOnline: true,
      };

      await setDoc(doc(db, 'users', user.uid), userData);

      // 4. Background Upload of avatar (compressed, matching web)
      if (avatar?.uri && Platform.OS !== 'web') {
        (async () => {
          try {
            const { getStorage, ref, uploadBytes, getDownloadURL } = require('firebase/storage');
            const { updateDoc, doc: docRef } = require('firebase/firestore');
            const storage = getStorage();

            // Upload original to Storage
            const response = await fetch(avatar.uri);
            const blob = await response.blob();
            const avatarRef = ref(storage, `avatars/${user.uid}/original.jpg`);
            await uploadBytes(avatarRef, blob);
            const downloadURL = await getDownloadURL(avatarRef);

            // Save compressed base64 to Firestore (matching web behavior)
            // The base64 from ImagePicker is already compressed by quality: 0.7
            const compressedBase64 = avatar.base64 
              ? `data:image/jpeg;base64,${avatar.base64}` 
              : '';

            await updateDoc(docRef(db, 'users', user.uid), {
              avatar: compressedBase64,
              originalAvatarUrl: downloadURL
            });
          } catch (uploadErr) {
            console.warn('Background avatar upload failed:', uploadErr);
          }
        })();
      }

      // 5. Gender-based redirection
      if (gender === 'woman') {
        router.push({
          pathname: '/auth/verification',
          params: { userId: user.uid }
        });
      } else {
        router.replace('/(tabs)');
      }
    } catch (err) {
      console.error('Registration error:', err);
      const errorMessage = getErrorMessage(err.code);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const clearFieldError = (field) => {
    if (fieldErrors[field]) {
      setFieldErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.backButtonContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
          <IconSymbol name="chevron.left" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>{t('auth.register', 'Create Account')}</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity style={styles.avatarPicker} onPress={pickImage}>
            {avatar ? (
              <Image source={{ uri: avatar.uri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <IconSymbol name="person.fill" size={40} color="#11a0f1" />
                <Text style={styles.avatarText}>{t('auth.uploadPhoto', 'Photo')}</Text>
              </View>
            )}
          </TouchableOpacity>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.name', 'Your Name')}</Text>
            <View style={[styles.inputContainer, fieldErrors.name && styles.inputError]}>
              <IconSymbol name="person.fill" size={20} color="#7f8c8d" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.namePlaceholder', 'Full Name')}
                placeholderTextColor="#7f8c8d"
                value={name}
                onChangeText={(v) => { setName(v); clearFieldError('name'); }}
              />
            </View>
            {fieldErrors.name && <Text style={styles.fieldError}>{fieldErrors.name}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.email', 'Email')}</Text>
            <View style={[styles.inputContainer, fieldErrors.email && styles.inputError]}>
              <IconSymbol name="envelope.fill" size={20} color="#7f8c8d" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#7f8c8d"
                value={email}
                onChangeText={(v) => { setEmail(v); clearFieldError('email'); }}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            {fieldErrors.email && <Text style={styles.fieldError}>{fieldErrors.email}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.password', 'Password')}</Text>
            <View style={[styles.inputContainer, fieldErrors.password && styles.inputError]}>
              <IconSymbol name="lock.fill" size={20} color="#7f8c8d" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#7f8c8d"
                value={password}
                onChangeText={(v) => { setPassword(v); clearFieldError('password'); }}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeButton}>
                <IconSymbol 
                  name={showPassword ? "eye.slash.fill" : "eye.fill"} 
                  size={20} 
                  color="#7f8c8d" 
                />
              </TouchableOpacity>
            </View>
            {fieldErrors.password && <Text style={styles.fieldError}>{fieldErrors.password}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.age', 'Age')}</Text>
            <View style={[styles.inputContainer, fieldErrors.age && styles.inputError]}>
              <IconSymbol name="gift.fill" size={18} color="#7f8c8d" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="18+"
                placeholderTextColor="#7f8c8d"
                value={age}
                onChangeText={(v) => { setAge(v); clearFieldError('age'); }}
                keyboardType="numeric"
                maxLength={3}
              />
            </View>
            {fieldErrors.age && <Text style={styles.fieldError}>{fieldErrors.age}</Text>}
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.gender', 'Gender')}</Text>
            <View style={styles.genderButtons}>
              <TouchableOpacity
                style={[styles.genderButton, gender === 'man' && styles.genderButtonActive]}
                onPress={() => setGender('man')}>
                <Text style={[styles.genderButtonText, gender === 'man' && styles.genderButtonTextActive]}>
                  {t('auth.male', 'Man')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.genderButton, gender === 'woman' && styles.genderButtonActive]}
                onPress={() => setGender('woman')}>
                <Text style={[styles.genderButtonText, gender === 'woman' && styles.genderButtonTextActive]}>
                  {t('auth.female', 'Woman')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Row for Country & City */}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Text style={styles.label}>{t('auth.country', 'Country')}</Text>
              <TouchableOpacity 
                style={[styles.inputContainer, fieldErrors.country && styles.inputError]}
                onPress={() => setShowCountryPicker(true)}>
                <IconSymbol name="flag.fill" size={18} color="#7f8c8d" style={styles.inputIcon} />
                <Text style={[styles.pickerValueText, !country && styles.pickerPlaceholderText]}>
                  {country || t('auth.countryPlaceholder', 'Select...')}
                </Text>
                <IconSymbol name="chevron.down" size={14} color="#7f8c8d" />
              </TouchableOpacity>
              {fieldErrors.country && <Text style={styles.fieldError}>{fieldErrors.country}</Text>}
            </View>

            <View style={styles.rowItem}>
              <Text style={styles.label}>{t('auth.city', 'City')}</Text>
              <TouchableOpacity 
                style={[styles.inputContainer, fieldErrors.city && styles.inputError]}
                onPress={() => {
                  if (!countryIso) {
                    setActionModal({
                      visible: true,
                      title: t('common.attention'),
                      message: t('auth.errorSelectCountryFirst', 'Please select a country first'),
                      confirmText: t('common.ok'),
                      showCancel: false
                    });
                    return;
                  }
                  setShowCityPicker(true);
                }}>
                <IconSymbol name="flag.fill" size={18} color="#7f8c8d" style={styles.inputIcon} />
                <Text style={[styles.pickerValueText, !city && styles.pickerPlaceholderText, !countryIso && styles.pickerDisabledText]}>
                  {city || t('auth.cityPlaceholder', 'Select...')}
                </Text>
                <IconSymbol name="chevron.down" size={14} color="#7f8c8d" />
              </TouchableOpacity>
              {fieldErrors.city && <Text style={styles.fieldError}>{fieldErrors.city}</Text>}
            </View>
          </View>

          {/* Location Pickers */}
          <SearchablePicker
            visible={showCountryPicker}
            onClose={() => setShowCountryPicker(false)}
            title={t('auth.selectCountry', 'Select Country')}
            data={allCountries}
            selectedValue={country}
            onSelect={(item) => {
              setCountry(item.value);
              setCountryIso(item.isoCode);
              setCity(''); // Reset city when country changes
              clearFieldError('country');
            }}
          />

          <SearchablePicker
            visible={showCityPicker}
            onClose={() => setShowCityPicker(false)}
            title={t('auth.selectCity', 'Select City')}
            data={allCities}
            selectedValue={city}
            onSelect={(item) => {
              setCity(item.value);
              clearFieldError('city');
            }}
          />

          {/* Chat Type Selection */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.chatType', 'Communication Type')}</Text>
            <View style={styles.typeButtons}>
              <TouchableOpacity
                style={[styles.typeButton, chatType === 'normal' && styles.typeButtonActive]}
                onPress={() => setChatType('normal')}>
                <IconSymbol name="message.fill" size={18} color={chatType === 'normal' ? '#fff' : '#7f8c8d'} style={{ marginRight: 8 }} />
                <Text style={[styles.typeButtonText, chatType === 'normal' && styles.typeButtonTextActive]}>
                  {t('auth.normal', 'Normal')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeButton, chatType === '18+' && styles.typeButtonActive]}
                onPress={() => setChatType('18+')}>
                <IconSymbol name="message.fill" size={18} color={chatType === '18+' ? '#fff' : '#7f8c8d'} style={{ marginRight: 8 }} />
                <Text style={[styles.typeButtonText, chatType === '18+' && styles.typeButtonTextActive]}>
                  {t('auth.erotic', '18+')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.registerButton}
            onPress={handleRegister}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.registerButtonText}>{t('auth.signUp', 'Create Account')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.haveAccount', 'Already have an account?')}</Text>
            <TouchableOpacity onPress={() => router.push('/auth/login')}>
              <Text style={styles.loginText}>{t('auth.login', 'Sign In')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      <ActionModal
        visible={actionModal.visible}
        title={actionModal.title}
        message={actionModal.message}
        confirmText={actionModal.confirmText}
        cancelText={t('common.cancel')}
        isDestructive={actionModal.isDestructive}
        showCancel={actionModal.showCancel}
        onConfirm={actionModal.onConfirm}
        onClose={() => setActionModal(prev => ({ ...prev, visible: false }))}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    padding: 24,
    paddingTop: 40,
    paddingBottom: 40,
  },
  backButtonContainer: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : StatusBar.currentHeight + 15,
    left: 20,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logo: {
    width: 280,
    height: 100,
    alignSelf: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 17,
    color: '#bdc3c7',
    textAlign: 'center',
    marginBottom: 24,
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 16,
    padding: 10,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 8,
  },
  avatarPicker: {
    alignSelf: 'center',
    marginBottom: 24,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(52, 73, 94, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#11a0f1',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#11a0f1',
  },
  avatarText: {
    color: '#11a0f1',
    fontSize: 12,
    marginTop: 4,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 0,
    gap: 12,
  },
  rowItem: {
    flex: 1,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: '#ecf0f1',
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(52, 73, 94, 0.6)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#34495e',
    paddingHorizontal: 12,
    height: 54,
  },
  inputError: {
    borderColor: '#e74c3c',
    borderWidth: 1.5,
  },
  fieldError: {
    color: '#e74c3c',
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  inputIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    height: '100%',
    color: '#fff',
    fontSize: 15,
    paddingLeft: 0,
  },
  eyeButton: {
    padding: 8,
  },
  genderButtons: {
    flexDirection: 'row',
    gap: 12,
    height: 54,
  },
  genderButton: {
    flex: 1,
    backgroundColor: 'rgba(52, 73, 94, 0.6)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#34495e',
  },
  genderButtonActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  genderButtonText: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: '600',
  },
  genderButtonTextActive: {
    color: '#fff',
  },
  pickerValueText: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
  },
  pickerPlaceholderText: {
    color: '#7f8c8d',
  },
  pickerDisabledText: {
    opacity: 0.5,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 12,
    height: 54,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'rgba(52, 73, 94, 0.6)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#34495e',
  },
  typeButtonActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  typeButtonText: {
    color: '#bdc3c7',
    fontSize: 14,
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  registerButton: {
    backgroundColor: '#e5566f',
    borderRadius: 12,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  registerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    color: '#bdc3c7',
    marginRight: 6,
    fontSize: 14,
  },
  loginText: {
    color: Colors.dark.primary,
    fontWeight: '600',
    fontSize: 14,
  },
});
