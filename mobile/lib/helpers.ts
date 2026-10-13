import { Linking } from 'react-native';

import { useSettingsStore } from '@/stores/settingsStore';
import type { CartItem } from '@/types';
import type { Language } from '@/types';

export function formatPrice(amount: number, lang: Language = 'pt'): string {
  const locale = lang === 'en' ? 'en-US' : 'pt-AO';
  return `${amount.toLocaleString(locale)} Kz`;
}

export function buildWhatsAppOrderMessage(
  items: CartItem[],
  total: number,
  customerName: string,
  customerPhone: string,
  fulfillment: string,
  payment: string,
  address?: string,
  lang: Language = 'pt'
): string {
  const lines = items.map((i) => {
    const name = lang === 'en' ? i.product.name_en : i.product.name_pt;
    return `• ${name} x${i.quantity} — ${formatPrice(i.product.price * i.quantity, lang)}`;
  });

  const isEn = lang === 'en';

  return [
    isEn ? '🛒 *New Order — Kamba Online*' : '🛒 *Nova Encomenda — Kamba Online*',
    '',
    `👤 ${customerName}`,
    `📞 ${customerPhone}`,
    '',
    isEn ? '*Items:*' : '*Itens:*',
    ...lines,
    '',
    `💰 *Total: ${formatPrice(total, lang)}*`,
    `📦 ${fulfillment}`,
    payment ? `💳 ${payment}` : '',
    address ? `📍 ${address}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function openWhatsAppOrder(message: string): Promise<void> {
  const number = useSettingsStore.getState().whatsappNumber;
  if (!number) throw new Error('WhatsApp number not set');
  const encoded = encodeURIComponent(message);
  const url = `https://wa.me/${number}?text=${encoded}`;
  const canOpen = await Linking.canOpenURL(url);
  if (canOpen) {
    await Linking.openURL(url);
  } else {
    throw new Error('WhatsApp not available');
  }
}

export function openMaps(lat: number, lng: number, label: string, address?: string): void {
  // Shops added without coordinates are found by their address instead.
  const query = lat === 0 && lng === 0 ? `${label}, ${address ?? ''}` : `${lat},${lng}`;
  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
}

export function openPhone(phone: string): void {
  Linking.openURL(`tel:${phone.replace(/\s/g, '')}`);
}
