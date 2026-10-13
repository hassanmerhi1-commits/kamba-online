import { API_URL } from '@/constants/config';
import type { Category, Order, Product, ShopLocation, UserProfile } from '@/types';

export class ApiError extends Error {
  status: number;
  code: string;
  data: Record<string, unknown>;

  constructor(status: number, code: string, data: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; token?: string | null } = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Server not running / no connection.
    throw new ApiError(0, 'network');
  }

  const raw = await res.text();
  const data = raw ? JSON.parse(raw) : null;
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data ?? {});
  return data as T;
}

// ---------- catalog ----------

export const fetchCategories = () => request<Category[]>('/api/categories');

/** Photos uploaded in the admin are stored as "/uploads/…" on the server. */
const withPhoto = (p: Product): Product => ({
  ...p,
  image_url: p.image_url && !p.image_url.startsWith('http') ? `${API_URL}${p.image_url}` : p.image_url,
});

export const fetchProducts = async (categoryId?: string) =>
  (
    await request<Product[]>(categoryId ? `/api/products?category=${encodeURIComponent(categoryId)}` : '/api/products')
  ).map(withPhoto);

export interface PublicSettings {
  whatsapp_number: string;
  main_office_phone: string;
}

export const fetchSettings = () => request<PublicSettings>('/api/settings');

export async function fetchProduct(id: string): Promise<Product | null> {
  try {
    return withPhoto(await request<Product>(`/api/products/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const fetchShops = () => request<ShopLocation[]>('/api/shops');

// ---------- orders ----------

export interface NewOrder {
  customer_name: string;
  customer_phone: string;
  items: { product_id: string; quantity: number }[];
  payment_method: string;
  fulfillment_type: string;
  delivery_address: string | null;
  notes: string | null;
}

export const placeOrder = (order: NewOrder, token?: string | null) =>
  request<{ id: string; total: number }>('/api/orders', { method: 'POST', body: order, token });

export const fetchMyOrders = (token: string) => request<Order[]>('/api/orders/mine', { token });

// ---------- accounts ----------

type AuthResult = { token: string; user: { id: string; email: string; full_name: string; phone: string } };

export const loginRequest = (email: string, password: string) =>
  request<AuthResult>('/api/auth/login', { method: 'POST', body: { email, password } });

export const registerRequest = (email: string, password: string, full_name: string, phone: string) =>
  request<AuthResult>('/api/auth/register', { method: 'POST', body: { email, password, full_name, phone } });

export const fetchMe = (token: string) =>
  request<Omit<UserProfile, 'is_guest'>>('/api/auth/me', { token });
