import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';

import { Colors, Radius, Shadow } from '@/constants/theme';
import { formatPrice } from '@/lib/helpers';
import type { Product } from '@/types';
import { getLanguage } from '@/i18n';

interface Props {
  product: Product;
  onPress: () => void;
  onAdd: () => void;
}

export function ProductCard({ product, onPress, onAdd }: Props) {
  const { t } = useTranslation();
  const lang = getLanguage();
  const name = lang === 'en' ? product.name_en : product.name_pt;
  const inStock = product.in_stock;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.imageBox}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{t('shop.placeholderImage')}</Text>
          </View>
        )}
        {!inStock && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{t('common.outOfStock')}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {name}
        </Text>
        <Text style={styles.price}>{formatPrice(product.price)}</Text>
        <TouchableOpacity
          style={[styles.addBtn, !inStock && styles.addBtnDisabled]}
          onPress={(e) => {
            e.stopPropagation?.();
            if (inStock) onAdd();
          }}
          disabled={!inStock}>
          <Text style={styles.addBtnText}>
            {inStock ? t('common.addToCart') : t('common.outOfStock')}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    overflow: 'hidden',
    margin: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.card,
  },
  imageBox: {
    height: 120,
    backgroundColor: Colors.accentLight,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.accentLight,
  },
  placeholderText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  badge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: Colors.error,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  info: {
    padding: 10,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    minHeight: 36,
  },
  price: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.secondary,
    marginVertical: 6,
  },
  addBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    alignItems: 'center',
  },
  addBtnDisabled: {
    backgroundColor: Colors.textMuted,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
});
