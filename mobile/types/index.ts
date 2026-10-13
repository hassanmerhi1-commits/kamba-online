export type Language = 'pt' | 'en';

export type PaymentMethod = 'cash' | 'transfer' | 'multicaixa' | 'other';

export type FulfillmentType = 'delivery' | 'pickup';

export type OrderStatus = 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';

export interface Category {
  id: string;
  name_pt: string;
  name_en: string;
  icon?: string;
}

export interface Product {
  id: string;
  sku: string;
  name_pt: string;
  name_en: string;
  description_pt: string;
  description_en: string;
  price: number;
  category_id: string;
  image_url: string | null;
  unit: string;
  is_active: boolean;
  /** Customers only see available / not available, never a quantity. */
  in_stock: boolean;
}

export interface ShopLocation {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export interface StockEntry {
  product_id: string;
  shop_id: string;
  quantity: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string;
  phone: string;
  is_guest: boolean;
}

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: string;
  user_id: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  items: OrderItem[];
  total: number;
  payment_method: PaymentMethod;
  fulfillment_type: FulfillmentType;
  delivery_address: string | null;
  status: OrderStatus;
  notes: string | null;
  created_at: string;
}
