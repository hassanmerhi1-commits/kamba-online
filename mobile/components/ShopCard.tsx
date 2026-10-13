import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';

import { Colors, Radius, Shadow } from '@/constants/theme';
import { openMaps, openPhone } from '@/lib/helpers';
import type { ShopLocation } from '@/types';

interface Props {
  shop: ShopLocation;
}

export function ShopCard({ shop }: Props) {
  const { t } = useTranslation();

  return (
    <View style={styles.card}>
      <View style={styles.iconBox}>
        <Ionicons name="storefront-outline" size={28} color={Colors.secondary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.name}>{shop.name}</Text>
        <Text style={styles.address}>{shop.address}</Text>
        <Text style={styles.phone}>{shop.phone}</Text>
        <View style={styles.actions}>
          <TouchableOpacity style={styles.actionBtn} onPress={() => openPhone(shop.phone)}>
            <Ionicons name="call-outline" size={16} color={Colors.secondary} />
            <Text style={styles.actionText}>{t('locations.call')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => openMaps(shop.latitude, shop.longitude, shop.name, shop.address)}>
            <Ionicons name="navigate-outline" size={16} color={Colors.secondary} />
            <Text style={styles.actionText}>{t('locations.directions')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    backgroundColor: Colors.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  content: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  address: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },
  phone: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 10,
    gap: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  actionText: {
    fontSize: 13,
    color: Colors.secondary,
    fontWeight: '700',
  },
});
