import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { ShopCard } from '@/components/ShopCard';
import { WaveHeader } from '@/components/WaveHeader';
import { Colors, Radius } from '@/constants/theme';
import { fetchShops } from '@/lib/api';
import { openPhone } from '@/lib/helpers';
import { useSettingsStore } from '@/stores/settingsStore';
import type { ShopLocation } from '@/types';

export default function LocationsScreen() {
  const { t } = useTranslation();
  const officePhone = useSettingsStore((s) => s.officePhone);
  const [shops, setShops] = useState<ShopLocation[]>([]);

  useEffect(() => {
    fetchShops().then(setShops);
  }, []);

  return (
    <FlatList
      style={styles.container}
      data={shops}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <WaveHeader>
          <Text style={styles.headerTitle}>{t('locations.title')}</Text>
          <Text style={styles.headerSub}>{t('locations.subtitle')}</Text>
          {officePhone ? (
            <TouchableOpacity style={styles.callBtn} onPress={() => openPhone(officePhone)}>
              <Ionicons name="call-outline" size={18} color={Colors.primary} />
              <Text style={styles.callText}>{t('locations.callOffice')}</Text>
            </TouchableOpacity>
          ) : null}
        </WaveHeader>
      }
      renderItem={({ item }) => <ShopCard shop={item} />}
      contentContainerStyle={styles.content}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    paddingBottom: 24,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  headerSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 6,
    lineHeight: 20,
  },
  callBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 14,
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Radius.pill,
  },
  callText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 14,
  },
});
