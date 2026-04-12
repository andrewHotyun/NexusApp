import React, { useState } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform,
  ActivityIndicator,
  Image,
  SafeAreaView,
  Alert,
  Modal,
  StatusBar
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { signInWithEmailAndPassword, updateProfile, sendPasswordResetEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { Colors } from '../../constants/theme';
import { useRouter } from 'expo-router';
import { IconSymbol } from '../../components/ui/icon-symbol';
import { ActionModal } from '../../components/ui/ActionModal';

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [actionModal, setActionModal] = useState({ 
    visible: false, title: '', message: '', confirmText: 'OK', onConfirm: () => {}, isDestructive: false, showCancel: true 
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [userToRecover, setUserToRecover] = useState(null);

  // Full Firebase error code handling matching web version
  const getErrorMessage = (errorCode) => {
    switch (errorCode) {
      case 'auth/invalid-email':
        return t('auth.invalidEmail', 'Invalid email format');
      case 'auth/user-disabled':
        return t('auth.userDisabled', 'This account has been disabled');
      case 'auth/user-not-found':
        return t('auth.userNotFound', 'User with this email not found');
      case 'auth/wrong-password':
        return t('auth.wrongPassword', 'Incorrect password');
      case 'auth/invalid-credential':
        return t('auth.invalidCredential', 'Incorrect email or password');
      case 'auth/too-many-requests':
        return t('auth.tooManyRequests', 'Too many login attempts. Please try again later');
      case 'auth/network-request-failed':
        return t('auth.networkError', 'Network connection error');
      case 'auth/weak-password':
        return t('auth.weakPassword', 'Password is too weak');
      default:
        return t('auth.loginError', 'Sign In error. Please check your email and password');
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError(t('auth.fillAllFields', 'Please fill in all fields'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const user = userCredential.user;

      // Fetch Firestore user doc to check status & sync displayName
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      // Sync displayName if missing
      if (userDoc.exists() && !user.displayName) {
        const userData = userDoc.data();
        if (userData.name) {
          await updateProfile(user, { displayName: userData.name });
        }
      }

      // Check for pending deletion
      if (userDoc.exists() && userDoc.data().deletionInfo?.status === 'pending_deletion') {
        setActionModal({
          visible: true,
          title: t('auth.accountRecovery', 'Account Recovery'),
          message: t('auth.accountRecoveryDesc', 'Your account is scheduled for deletion. Do you want to recover it?'),
          confirmText: t('auth.recoverAccount', 'Recover Account'),
          showCancel: true,
          onConfirm: async () => {
            try {
              const userDocRef = doc(db, 'users', user.uid);
              await updateDoc(userDocRef, { deletionInfo: null });
              // Success automatically navigates via _layout
            } catch (error) {
              console.log("Recovery error:", error);
              setActionModal({
                visible: true,
                title: t('common.error'),
                message: t('auth.recoverFailed', 'Failed to recover account. Please try again'),
                showCancel: false
              });
            }
          }
        });
        setLoading(false);
        return;
      }

      // Check for blocked account
      if (userDoc.exists() && userDoc.data().status === 'blocked') {
        await auth.signOut();
        setError(t('auth.accountBlocked', 'This account has been blocked'));
        setLoading(false);
        return;
      }

      // Check for deleted account
      if (userDoc.exists() && userDoc.data().status === 'deleted') {
        await auth.signOut();
        setError(t('auth.accountDeleted', 'This account has been deleted'));
        setLoading(false);
        return;
      }

      // Success — _layout.js will handle redirect
    } catch (err) {
      console.log('Sign In error:', err);
      const errorMessage = getErrorMessage(err.code);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoverAccount = async () => {
    if (!userToRecover) return;
    try {
      const userDocRef = doc(db, 'users', userToRecover.uid);
      await updateDoc(userDocRef, { deletionInfo: null });
      setShowRecoveryModal(false);
      // _layout.js will handle redirect
    } catch (error) {
      setError(t('auth.recoverFailed', 'Failed to recover account. Please try again'));
      setShowRecoveryModal(false);
    }
  };

  const handleLogoutAndCancel = async () => {
    await auth.signOut();
    setShowRecoveryModal(false);
    setUserToRecover(null);
  };

  const handleForgotPassword = () => {
    if (!email.trim()) {
      setActionModal({
        visible: true,
        title: t('auth.forgotPassword', 'Forgot Password'),
        message: t('auth.enterEmailFirst', 'Please enter your email address first'),
        showCancel: false
      });
      return;
    }

    setActionModal({
      visible: true,
      title: t('auth.forgotPassword', 'Forgot Password'),
      message: t('auth.resetConfirm', 'Send password reset link to {{email}}?', { email: email.trim() }),
      confirmText: t('common.send', 'Send'),
      showCancel: true,
      onConfirm: async () => {
        try {
          await sendPasswordResetEmail(auth, email.trim());
          setActionModal({
            visible: true,
            title: t('common.success', 'Success'),
            message: t('auth.resetSent', 'Password reset link sent to your email'),
            showCancel: false
          });
        } catch (err) {
          setActionModal({
            visible: true,
            title: t('common.error', 'Error'),
            message: getErrorMessage(err.code),
            showCancel: false
          });
        }
      }
    });
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.content}>
        <View style={styles.backButtonContainer}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
            <IconSymbol name="chevron.left" size={24} color="#fff" />
          </TouchableOpacity>
        </View>

        <View style={styles.logoContainer}>
          <Image 
            source={require('../../assets/images/logo.png')} 
            style={styles.logo} 
            resizeMode="contain"
          />
        </View>

        <View style={styles.formContainer}>
          <Text style={styles.subtitle}>{t('auth.subtitle', 'Communication without boundaries')}</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.inputGroup}>
            <Text style={styles.label}>{t('auth.email', 'Email')}</Text>
            <View style={styles.inputContainer}>
              <IconSymbol name="envelope.fill" size={20} color="#7f8c8d" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={t('auth.emailPlaceholder', 'Enter your email...')}
                placeholderTextColor="#7f8c8d"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <View style={styles.passwordLabelRow}>
              <Text style={styles.label}>{t('auth.password', 'Password')}</Text>
              <TouchableOpacity onPress={handleForgotPassword}>
                <Text style={styles.forgotText}>{t('auth.forgotPassword', 'Forgot password?')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inputContainer}>
              <IconSymbol name="lock.fill" size={20} color="#7f8c8d" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor="#7f8c8d"
                value={password}
                onChangeText={setPassword}
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
          </View>

          <TouchableOpacity 
            style={styles.loginButton} 
            onPress={handleLogin}
            disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginButtonText}>{t('auth.login', 'Sign In')}</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.noAccount', "Don't have an account?")}</Text>
            <TouchableOpacity onPress={() => router.push('/auth/register')}>
              <Text style={[styles.signUpText, { color: '#e5566f' }]}>{t('auth.signUp', 'Sign Up')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

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
  content: {
    padding: 24,
    flex: 1,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 20,
    marginTop: -20,
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
    width: 320,
    height: 130,
  },
  formContainer: {
    width: '100%',
  },
  subtitle: {
    fontSize: 17,
    color: '#bdc3c7',
    textAlign: 'center',
    marginBottom: 32,
  },
  errorText: {
    color: '#e74c3c',
    textAlign: 'center',
    marginBottom: 16,
    padding: 10,
    backgroundColor: 'rgba(231, 76, 60, 0.1)',
    borderRadius: 8,
  },
  inputGroup: {
    marginBottom: 20,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: '#ecf0f1',
    fontSize: 14,
    fontWeight: '500',
  },
  forgotText: {
    color: '#0ef0ff',
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
  },
  inputIcon: {
    marginRight: 6,
  },
  input: {
    flex: 1,
    padding: 16,
    paddingLeft: 0,
    color: '#fff',
    fontSize: 16,
  },
  eyeButton: {
    padding: 8,
  },
  loginButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  loginButtonText: {
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
  },
  signUpText: {
    color: Colors.dark.primary,
    fontWeight: '600',
  },
  // Recovery Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    backgroundColor: '#1a2332',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 16,
    zIndex: 1,
  },
  modalCloseText: {
    color: '#7f8c8d',
    fontSize: 20,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
  },
  modalDescription: {
    color: '#bdc3c7',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  recoverButton: {
    backgroundColor: '#27ae60',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  recoverButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
