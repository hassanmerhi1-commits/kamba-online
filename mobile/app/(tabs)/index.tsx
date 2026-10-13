import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { ProductCard } from '@/components/ProductCard';
import { Button } from '@/components/Button';
import { Alert } from '@/lib/alert';
import { WaveHeader } from '@/components/WaveHeader';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { Colors, Radius } from '@/constants/theme';
import { fetchCategories, fetchProducts } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { buildWhatsAppOrderMessage, openWhatsAppOrder } from '@/lib/helpers';
import type { Category, Product } from '@/types';

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const addItem = useCartStore((s) => s.addItem);
  const cartItems = useCartStore((s) => s.items);
  const getTotal = useCartStore((s) => s.getTotal);
  const whatsappNumber = useSettingsStore((s) => s.whatsappNumber);
  const lang = i18n.language === 'en' ? 'en' : 'pt';

  const [categories, setCategories] = useState<Category[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);

  useEffect(() => {
    fetchCategories().then(setCategories);
    fetchProducts().then((p) => setFeatured(p.slice(0, 4)));
  }, []);

  const handleAdd = useCallback(
    (product: Product) => {
      const result = addItem(product);
      if (result === 'out_of_stock') {
        Alert.alert(t('common.outOfStock'));
      }
    },
    [addItem, t]
  );

  const handleWhatsApp = async () => {
    if (cartItems.length === 0) {
      router.push('/(tabs)/shop');
      return;
    }
    try {
      const msg = buildWhatsAppOrderMessage(
        cartItems,
        getTotal(),
        lang === 'en' ? 'Customer' : 'Cliente',
        '',
        lang === 'en' ? 'TBD' : 'A definir',
        lang === 'en' ? 'TBD' : 'A definir',
        undefined,
        lang
      );
      await openWhatsAppOrder(msg);
    } catch {
      Alert.alert(t('common.error'), 'WhatsApp not available');
    }
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <WaveHeader tall>
        <LanguageSwitch />
        <Text style={styles.heroLabel}>{t('home.title')}</Text>
        <Text style={styles.heroTitle}>{t('home.brandName')}</Text>
        <View style={styles.heroAccent} />
        <Text style={styles.heroSub}>{t('home.subtitle')}</Text>
        {whatsappNumber ? (
          <Button
            title={t('home.orderViaWhatsApp')}
            variant="whatsapp"
            onPress={handleWhatsApp}
            style={styles.whatsappBtn}
          />
        ) : null}
      </WaveHeader>

      <Text style={styles.sectionTitle}>{t('home.categories')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll}>
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={styles.catChip}
            onPress={() => router.push({ pathname: '/(tabs)/shop', params: { category: cat.id } })}>
            <Text style={styles.catText}>
              {lang === 'en' ? cat.name_en : cat.name_pt}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('home.featured')}</Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)/shop')}>
          <Text style={styles.viewAll}>{t('common.viewAll')}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.grid}>
        {featured.map((product) => (
          <View key={product.id} style={styles.gridItem}>
            <ProductCard
              product={product}
              onPress={() => router.push(`/product/${product.id}`)}
              onAdd={() => handleAdd(product)}
            />
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  heroLabel: {
    color: Colors.accentLight,
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  heroTitle: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 4,
  },
  heroAccent: {
    width: 48,
    height: 4,
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    marginTop: 10,
    marginBottom: 10,
  },
  heroSub: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 14,
    lineHeight: 21,
  },
  whatsappBtn: {
    marginTop: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.earth,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
  },
  sectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginRight: 16,
  },
  viewAll: {
    color: Colors.secondary,
    fontWeight: '700',
    fontSize: 14,
  },
  catScroll: {
    paddingLeft: 16,
    marginBottom: 4,
  },
  catChip: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  catText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.earth,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    paddingBottom: 24,
  },
  gridItem: {
    width: '50%',
  },
});
