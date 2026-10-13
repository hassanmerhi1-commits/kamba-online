import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';
import { Alert } from '@/lib/alert';
import { Colors } from '@/constants/theme';
import { fetchProduct } from '@/lib/api';
import { formatPrice } from '@/lib/helpers';
import { useCartStore } from '@/stores/cartStore';
import { getLanguage } from '@/i18n';
import type { Product } from '@/types';

export default function ProductScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const lang = getLanguage();

  const [product, setProduct] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (id) fetchProduct(id).then(setProduct);
  }, [id]);

  if (!product) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  const name = lang === 'en' ? product.name_en : product.name_pt;
  const desc = lang === 'en' ? product.description_en : product.description_pt;
  const inStock = product.in_stock;

  const handleAdd = () => {
    const result = addItem(product, qty);
    if (result === 'out_of_stock') {
      Alert.alert(t('common.outOfStock'));
    } else {
      Alert.alert('✓', t('common.addToCart'), [
        { text: t('cart.continueShopping'), style: 'cancel' },
        { text: t('tabs.cart'), onPress: () => router.push('/(tabs)/cart') },
      ]);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageBox}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Ionicons name="image-outline" size={48} color={Colors.textMuted} />
            <Text style={styles.placeholderText}>{t('shop.placeholderImage')}</Text>
          </View>
        )}
      </View>

      <View style={styles.content}>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.price}>{formatPrice(product.price)}</Text>
        <Text style={styles.unit}>
          {t('product.unit')}: {product.unit} · SKU: {product.sku}
        </Text>

        <Text style={styles.section}>{t('product.description')}</Text>
        <Text style={styles.desc}>{desc}</Text>

        <Text style={styles.section}>{t('product.quantity')}</Text>
        <View style={styles.qtyRow}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => setQty((q) => Math.max(1, q - 1))}>
            <Ionicons name="remove" size={20} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.qty}>{qty}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty((q) => q + 1)}>
            <Ionicons name="add" size={20} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {!inStock && (
          <Text style={styles.outOfStock}>{t('common.outOfStock')}</Text>
        )}

        <Button
          title={inStock ? t('common.addToCart') : t('common.outOfStock')}
          onPress={handleAdd}
          disabled={!inStock}
          style={styles.addBtn}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: Colors.textMuted,
  },
  imageBox: {
    height: 260,
    backgroundColor: '#EEE',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: Colors.textMuted,
    marginTop: 8,
  },
  content: {
    padding: 16,
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
  },
  price: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.primary,
    marginTop: 8,
  },
  unit: {
    fontSize: 13,
    color: Colors.textMuted,
    marginTop: 4,
  },
  section: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 20,
    marginBottom: 8,
  },
  desc: {
    fontSize: 14,
    color: Colors.textMuted,
    lineHeight: 22,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  qtyBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    fontSize: 20,
    fontWeight: '700',
    minWidth: 32,
    textAlign: 'center',
  },
  outOfStock: {
    color: Colors.error,
    fontWeight: '600',
    marginTop: 12,
  },
  addBtn: {
    marginTop: 24,
  },
});
