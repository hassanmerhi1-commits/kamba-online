import { useState } from 'react';
import { View, StyleSheet, TextInput, TouchableOpacity, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/Button';
import { Alert } from '@/lib/alert';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const register = useAuthStore((s) => s.register);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password) {
      Alert.alert(t('common.error'), 'Fill all fields');
      return;
    }
    setLoading(true);
    const ok = await register(email.trim(), password, fullName.trim(), phone.trim());
    setLoading(false);
    if (ok) {
      router.back();
    } else {
      Alert.alert(t('auth.registerError'));
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder={t('checkout.fullName')}
        value={fullName}
        onChangeText={setFullName}
      />
      <TextInput
        style={styles.input}
        placeholder={t('checkout.phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder={t('account.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder={t('account.password')}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      <Button title={t('account.register')} onPress={handleRegister} loading={loading} />
      <TouchableOpacity onPress={() => router.replace('/auth/login')} style={styles.link}>
        <Text style={styles.linkText}>{t('account.hasAccount')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: Colors.background,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    marginBottom: 12,
    color: Colors.text,
  },
  link: {
    marginTop: 20,
    alignItems: 'center',
  },
  linkText: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
