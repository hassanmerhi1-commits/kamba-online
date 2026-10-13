import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { ProductCard } from '@/components/ProductCard';
import { Alert } from '@/lib/alert';
import { Colors, Radius } from '@/constants/theme';
import { fetchCategories, fetchProducts } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { getLanguage } from '@/i18n';
import type { Category, Product } from '@/types';

export default function ShopScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string }>();
  const addItem = useCartStore((s) => s.addItem);
  const lang = getLanguage();

  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(
    params.category
  );
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchCategories().then(setCategories);
  }, []);

  useEffect(() => {
    fetchProducts(selectedCategory).then(setProducts);
  }, [selectedCategory]);

  useEffect(() => {
    if (params.category) setSelectedCategory(params.category);
  }, [params.category]);

  const filtered = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.name_pt.toLowerCase().includes(q) ||
      p.name_en.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q)
    );
  });

  const handleAdd = useCallback(
    (product: Product) => {
      const result = addItem(product);
      if (result === 'out_of_stock') Alert.alert(t('common.outOfStock'));
    },
    [addItem, t]
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder={t('common.search')}
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <FlatList
        horizontal
        data={[{ id: 'all', name_pt: t('shop.allCategories'), name_en: t('shop.allCategories') }, ...categories]}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        style={styles.catList}
        contentContainerStyle={styles.catContent}
        renderItem={({ item }) => {
          const active = item.id === 'all' ? !selectedCategory : selectedCategory === item.id;
          return (
            <TouchableOpacity
              style={[styles.catChip, active && styles.catChipActive]}
              onPress={() => setSelectedCategory(item.id === 'all' ? undefined : item.id)}>
              <Text style={[styles.catText, active && styles.catTextActive]}>
                {lang === 'en' ? item.name_en : item.name_pt}
              </Text>
            </TouchableOpacity>
          );
        }}
      />

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.empty}>{t('shop.noProducts')}</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.gridItem}>
            <ProductCard
              product={item}
              onPress={() => router.push(`/product/${item.id}`)}
              onAdd={() => handleAdd(item)}
            />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    margin: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
  },
  catList: {
    maxHeight: 44,
    marginBottom: 8,
  },
  catContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
    marginRight: 8,
  },
  catChipActive: {
    backgroundColor: Colors.secondary,
    borderColor: Colors.secondary,
  },
  catText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.earth,
  },
  catTextActive: {
    color: Colors.accentLight,
  },
  list: {
    paddingHorizontal: 10,
    paddingBottom: 24,
  },
  gridItem: {
    width: '50%',
  },
  empty: {
    textAlign: 'center',
    color: Colors.textMuted,
    marginTop: 40,
    fontSize: 15,
  },
});
