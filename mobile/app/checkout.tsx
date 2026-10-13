import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/Button';
import { Colors } from '@/constants/theme';
import { useCartStore } from '@/stores/cartStore';
import { useAuthStore } from '@/stores/authStore';
import { Alert } from '@/lib/alert';
import { ApiError, placeOrder } from '@/lib/api';
import { formatPrice } from '@/lib/helpers';
import { getLanguage } from '@/i18n';
import type { FulfillmentType, PaymentMethod } from '@/types';

const PAYMENTS: PaymentMethod[] = ['cash', 'transfer', 'multicaixa', 'other'];

export default function CheckoutScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { items, getTotal, clearCart } = useCartStore();
  const { user, token, setGuest } = useAuthStore();
  const lang = getLanguage();

  const [fulfillment, setFulfillment] = useState<FulfillmentType>('delivery');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [guestName, setGuestName] = useState(user?.full_name ?? '');
  const [guestPhone, setGuestPhone] = useState(user?.phone ?? '');
  const [loading, setLoading] = useState(false);

  const total = getTotal();

  const handlePlaceOrder = async () => {
    if (items.length === 0) {
      router.back();
      return;
    }

    const name = user?.full_name || guestName.trim();
    const phone = user?.phone || guestPhone.trim();

    if (!name || !phone) {
      Alert.alert(t('common.error'), t('checkout.errorNamePhone'));
      return;
    }

    if (fulfillment === 'delivery' && !address.trim()) {
      Alert.alert(t('common.error'), t('checkout.errorAddress'));
      return;
    }

    if (!user) setGuest(name, phone);

    setLoading(true);
    try {
      // Prices and stock are checked by the server — we only send what the customer chose.
      await placeOrder(
        {
          customer_name: name,
          customer_phone: phone,
          items: items.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
          payment_method: payment,
          fulfillment_type: fulfillment,
          delivery_address: fulfillment === 'delivery' ? address.trim() : null,
          notes: notes.trim() || null,
        },
        token
      );

      clearCart();
      Alert.alert(t('checkout.success'), t('checkout.successMessage'), [
        { text: 'OK', onPress: () => router.replace('/(tabs)') },
      ]);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'out_of_stock') {
        const names = ((err.data.items as { name_pt: string; name_en: string }[]) ?? [])
          .map((i) => (lang === 'en' ? i.name_en : i.name_pt))
          .join(', ');
        Alert.alert(t('common.outOfStock'), names);
      } else if (err instanceof ApiError && err.code === 'network') {
        Alert.alert(t('common.error'), t('common.serverUnreachable'));
      } else {
        Alert.alert(t('common.error'));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      {(!user || !user.phone) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('checkout.guestInfo')}</Text>
          <TextInput
            style={styles.input}
            placeholder={t('checkout.fullName')}
            value={guestName}
            onChangeText={setGuestName}
          />
          <TextInput
            style={styles.input}
            placeholder={t('checkout.phone')}
            value={guestPhone}
            onChangeText={setGuestPhone}
            keyboardType="phone-pad"
          />
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('checkout.fulfillment')}</Text>
        <View style={styles.row}>
          {(['delivery', 'pickup'] as FulfillmentType[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.chip, fulfillment === f && styles.chipActive]}
              onPress={() => setFulfillment(f)}>
              <Text style={[styles.chipText, fulfillment === f && styles.chipTextActive]}>
                {t(`checkout.${f}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {fulfillment === 'delivery' && (
          <TextInput
            style={styles.input}
            placeholder={t('checkout.deliveryAddress')}
            value={address}
            onChangeText={setAddress}
            multiline
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('checkout.payment')}</Text>
        <View style={styles.paymentGrid}>
          {PAYMENTS.map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.chip, payment === p && styles.chipActive]}
              onPress={() => setPayment(p)}>
              <Text style={[styles.chipText, payment === p && styles.chipTextActive]}>
                {t(`checkout.${p}`)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <TextInput
          style={[styles.input, styles.notes]}
          placeholder={t('checkout.notes')}
          value={notes}
          onChangeText={setNotes}
          multiline
        />
      </View>

      <View style={styles.totalBox}>
        <Text style={styles.totalLabel}>{t('cart.total')}</Text>
        <Text style={styles.totalValue}>{formatPrice(total)}</Text>
      </View>

      <Button
        title={t('checkout.placeOrder')}
        onPress={handlePlaceOrder}
        loading={loading}
        style={styles.submitBtn}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  section: {
    padding: 16,
    paddingBottom: 0,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: Colors.text,
    marginBottom: 10,
  },
  notes: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  paymentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  chipTextActive: {
    color: '#fff',
  },
  totalBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.primary,
  },
  submitBtn: {
    margin: 16,
    marginTop: 0,
  },
});
