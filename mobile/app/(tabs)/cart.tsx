import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import { Button } from '@/components/Button';
import { Alert } from '@/lib/alert';
import { Colors } from '@/constants/theme';
import { useCartStore } from '@/stores/cartStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { formatPrice, buildWhatsAppOrderMessage, openWhatsAppOrder } from '@/lib/helpers';
import { getLanguage } from '@/i18n';

export default function CartScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { items, removeItem, updateQuantity, getTotal } = useCartStore();
  const whatsappNumber = useSettingsStore((s) => s.whatsappNumber);
  const lang = getLanguage();
  const total = getTotal();

  const handleWhatsApp = async () => {
    try {
      const msg = buildWhatsAppOrderMessage(
        items,
        total,
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

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons name="cart-outline" size={64} color={Colors.textMuted} />
        <Text style={styles.emptyText}>{t('cart.empty')}</Text>
        <Button
          title={t('cart.continueShopping')}
          onPress={() => router.push('/(tabs)/shop')}
          style={styles.emptyBtn}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.product.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const name = lang === 'en' ? item.product.name_en : item.product.name_pt;
          return (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text style={styles.name}>{name}</Text>
                <Text style={styles.price}>{formatPrice(item.product.price)}</Text>
              </View>
              <View style={styles.qtyRow}>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateQuantity(item.product.id, item.quantity - 1)}>
                  <Ionicons name="remove" size={18} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.qty}>{item.quantity}</Text>
                <TouchableOpacity
                  style={styles.qtyBtn}
                  onPress={() => updateQuantity(item.product.id, item.quantity + 1)}>
                  <Ionicons name="add" size={18} color={Colors.text} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={() => removeItem(item.product.id)}>
                <Ionicons name="trash-outline" size={20} color={Colors.error} />
              </TouchableOpacity>
            </View>
          );
        }}
      />

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>{t('cart.total')}</Text>
          <Text style={styles.totalValue}>{formatPrice(total)}</Text>
        </View>
        <Button title={t('cart.checkout')} onPress={() => router.push('/checkout')} />
        {whatsappNumber ? (
          <Button
            title={t('cart.orderWhatsApp')}
            variant="whatsapp"
            onPress={handleWhatsApp}
            style={styles.whatsappBtn}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: Colors.background,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textMuted,
    marginTop: 16,
    marginBottom: 24,
  },
  emptyBtn: {
    minWidth: 200,
  },
  list: {
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowInfo: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  price: {
    fontSize: 13,
    color: Colors.primary,
    marginTop: 4,
    fontWeight: '600',
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  qtyBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qty: {
    fontSize: 16,
    fontWeight: '600',
    marginHorizontal: 10,
    minWidth: 24,
    textAlign: 'center',
  },
  footer: {
    padding: 16,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },
  whatsappBtn: {
    marginTop: 10,
  },
});
