// Built admin is served by the Kamba server itself, so the API is on the same address.
export const API_URL =
  import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001');
const TOKEN_KEY = 'kamba_admin_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, code: string, detail = '') {
    super(code);
    this.status = status;
    this.detail = detail;
  }
}

async function send<T>(path: string, init: { method: string; headers?: Record<string, string>; body?: BodyInit }) {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: init.method,
      headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: init.body,
    });
  } catch {
    throw new ApiError(0, 'network');
  }

  const raw = await res.text();
  let data: { error?: string; detail?: string } | null = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (res.status === 401 && path !== '/api/admin/login') {
    clearToken();
    window.dispatchEvent(new Event('kamba-unauthorized'));
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.detail ?? '');
  return data as T;
}

export function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  return send<T>(path, {
    method: options.method ?? 'GET',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

/** Upload a product photo. Returns the address to save as the product's image_url. */
export async function uploadImage(file: Blob): Promise<string> {
  const { url } = await send<{ url: string }>('/api/admin/uploads', { method: 'POST', body: file });
  return url;
}

/** Product photos are stored as "/uploads/…" on the server. */
export const imageSrc = (url: string | null) => (url ? (url.startsWith('http') ? url : `${API_URL}${url}`) : null);

const MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to do that. Ask the owner.",
  invalid_credentials: 'Wrong username or password.',
  invalid_whatsapp_number: 'Enter the WhatsApp number with country code, digits only (8 to 15 digits), e.g. 244923456789.',
  invalid_image: 'That file is not a picture. Use a JPG, PNG or WebP photo.',
  payload_too_large: 'That file is too big.',
  username_taken: 'That username is already used. Choose another.',
  invalid_username: 'Username: 3 to 40 letters, numbers, dot, dash or underscore (no spaces).',
  invalid_password: 'Password must have at least 6 characters.',
  invalid_new_password: 'The new password must have at least 6 characters.',
  wrong_password: 'The current password is wrong.',
  sku_taken: 'That SKU is already used by another product.',
  order_cancelled: 'A cancelled order cannot be reopened. Create a new order instead.',
  cannot_cancel_delivered: 'A delivered order cannot be cancelled.',
  cannot_modify_owner: 'The owner account cannot be changed this way.',
  printer_not_set: 'No printer chosen yet. Go to Printer, pick your Xprinter and save.',
  invalid_copies: 'Copies must be 1, 2 or 3.',
  invalid_auto_print: 'Invalid auto-print value.',
  invalid_latitude: 'Latitude must be a number between -90 and 90.',
  invalid_longitude: 'Longitude must be a number between -180 and 180.',
};

export const errorText = (err: unknown) => {
  if (err instanceof ApiError) {
    if (err.status === 0) return 'Cannot reach the server. Is Kamba Online running?';
    if (err.message === 'print_failed') {
      return `The printer did not print${err.detail ? ` (${err.detail})` : ''}. Check that it is on, has paper, is connected by USB, and is the right one in Printer.`;
    }
    return MESSAGES[err.message] ?? `Error: ${err.message}`;
  }
  return 'Something went wrong.';
};

// ---------- types ----------

export type Permission = 'orders' | 'products' | 'stock' | 'shops' | 'settings' | 'users';

export interface Me {
  id: string;
  username: string;
  full_name: string;
  role: 'owner' | 'staff';
  is_active: boolean;
  permissions: Permission[];
}

export interface Summary {
  products: number;
  pending_orders: number;
  low_stock_products: number;
  shops: number;
  sales_today: number;
}

export interface Category {
  id: string;
  name_pt: string;
  name_en: string;
}

export interface AdminProduct {
  id: string;
  sku: string;
  name_pt: string;
  name_en: string;
  description_pt: string;
  description_en: string;
  price: number;
  category_id: string | null;
  image_url: string | null;
  unit: string;
  is_active: boolean;
  total_stock: number;
}

export interface StockRow {
  product_id: string;
  product: string;
  sku: string;
  shop_id: string;
  shop: string;
  quantity: number;
}

export interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  total: number;
  payment_method: string;
  fulfillment_type: string;
  delivery_address: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  printed_at?: string | null;
  items: { product_id: string; product_name: string; quantity: number; unit_price: number }[];
}

export interface Shop {
  id: string;
  name: string;
  address: string;
  phone: string;
  latitude: number;
  longitude: number;
  is_active: boolean;
}

export interface Settings {
  whatsapp_number: string;
  main_office_phone: string;
}

export interface PrinterState {
  printer_name: string;
  auto_print: boolean;
  copies: number;
  slip_title: string;
  printers: { name: string; driver: string; port: string; isDefault: boolean; offline?: boolean }[];
  list_error: string | null;
  last_result: { at: string; order_id: string; ok: boolean; error?: string } | null;
}

export const formatKz = (n: number) => `${n.toLocaleString('en-US')} Kz`;
