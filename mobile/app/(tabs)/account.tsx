import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';
import { ScreenHeader } from '@/components/ScreenHeader';
import { Colors } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';

export default function AccountScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user, logout } = useAuthStore();

  if (!user) {
    return (
      <View style={styles.container}>
        <ScreenHeader title={t('account.title')} />
        <View style={styles.authBox}>
          <Button title={t('account.login')} onPress={() => router.push('/auth/login')} />
          <Button
            title={t('account.register')}
            variant="outline"
            onPress={() => router.push('/auth/register')}
            style={styles.gap}
          />
          <Text style={styles.orText}>—</Text>
          <Button
            title={t('account.guest')}
            variant="secondary"
            onPress={() => router.push('/checkout')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('account.title')} />
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Ionicons name="person" size={32} color={Colors.primary} />
        </View>
        <Text style={styles.name}>{user.full_name}</Text>
        {user.email ? <Text style={styles.detail}>{user.email}</Text> : null}
        {user.phone ? <Text style={styles.detail}>{user.phone}</Text> : null}
        {user.is_guest ? (
          <Text style={styles.guestBadge}>{t('account.guestMode')}</Text>
        ) : null}
      </View>

      <Button
        title={t('account.logout')}
        variant="outline"
        onPress={logout}
        style={styles.logoutBtn}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  authBox: {
    padding: 16,
  },
  gap: {
    marginTop: 12,
  },
  orText: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginVertical: 16,
    fontSize: 16,
  },
  profileCard: {
    backgroundColor: Colors.surface,
    margin: 16,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  name: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  detail: {
    fontSize: 14,
    color: Colors.textMuted,
    marginTop: 4,
  },
  guestBadge: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.warning,
    fontWeight: '600',
  },
  logoutBtn: {
    margin: 16,
  },
});
