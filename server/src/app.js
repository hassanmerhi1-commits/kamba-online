import { createServer } from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createStaticHandler } from './static.js';
import { windowsPrinter } from './printer.js';
import { buildSlip, toEscPos } from './slip.js';

// What a staff member can be allowed to do. Managing staff is owner-only.
const PERMISSIONS = ['orders', 'products', 'stock', 'shops', 'settings'];
const MAX_UPLOAD = 5 * 1024 * 1024;
const PAYMENTS = new Set(['cash', 'transfer', 'multicaixa', 'other']);
const FULFILLMENTS = new Set(['delivery', 'pickup']);
const STATUSES = new Set(['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled']);
const LOW_STOCK_THRESHOLD = 10;

class HttpError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

// ---------- helpers ----------

const newId = (prefix) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;

const verifyPassword = (password, stored) => {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

function text(body, field, { max = 200, required = true } = {}) {
  const value = body[field];
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, `invalid_${field}`);
    return null;
  }
  if (typeof value !== 'string' || value.length > max) throw new HttpError(400, `invalid_${field}`);
  const trimmed = value.trim();
  if (!trimmed && required) throw new HttpError(400, `invalid_${field}`);
  return trimmed || null;
}

function number(body, field, { integer = false, min = 0 } = {}) {
  const value = body[field];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    throw new HttpError(400, `invalid_${field}`);
  }
  if (integer && !Number.isInteger(value)) throw new HttpError(400, `invalid_${field}`);
  return value;
}

async function readBody(req) {
  const raw = await readRaw(req, 1_000_000);
  if (!raw.length) return {};
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    return parsed;
  } catch {
    throw new HttpError(400, 'invalid_json');
  }
}

const DRAIN_LIMIT = 50 * 1024 * 1024;

/**
 * Read the whole request body. If it is too big we still read (and throw away) the rest, so the
 * sender gets a clean "too large" answer instead of a dropped connection.
 */
async function readRaw(req, max) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > DRAIN_LIMIT) {
      req.destroy();
      break;
    }
    if (size <= max) chunks.push(chunk);
  }
  if (size > max) throw new HttpError(413, 'payload_too_large');
  return Buffer.concat(chunks);
}

/** Work out the image type from the file's first bytes (never trust the file name). */
function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 6 && buf.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const cleanPhone = (value) => {
  const digits = String(value).replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) throw new HttpError(400, 'invalid_whatsapp_number');
  return digits;
};

// ---------- app ----------

/**
 * Build the HTTP server (not listening yet).
 * @param {{ db: import('node:sqlite').DatabaseSync, adminUser?: string, adminPassword?: string }} opts
 */
export function createApp({
  db,
  adminUser = 'admin',
  adminPassword = 'kamba2026',
  customerDir,
  adminDir,
  uploadsDir = path.resolve('uploads'),
  printer = windowsPrinter, // anything with list() and printRaw(name, bytes); tests pass a fake
}) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  const serveStatic = createStaticHandler({ customerDir, adminDir, uploadsDir });

  // The first owner account comes from adminUser / adminPassword. After that it is managed in the admin.
  if (!db.prepare("SELECT 1 FROM staff WHERE role = 'owner'").get()) {
    db.prepare(
      `INSERT INTO staff (id, username, password_hash, full_name, role, permissions, is_active, created_at)
       VALUES (?, ?, ?, 'Owner', 'owner', '[]', 1, ?)`
    ).run(newId('st'), adminUser, hashPassword(adminPassword), new Date().toISOString());
  }

  // Stock only counts in shops that are switched on.
  const PRODUCT_SELECT = `
    SELECT p.*, COALESCE((
      SELECT SUM(st.quantity) FROM stock st
      JOIN shops sh ON sh.id = st.shop_id AND sh.is_active = 1
      WHERE st.product_id = p.id), 0) AS total_stock
    FROM products p`;

  const getSetting = (key) => db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? '';
  const setSetting = (key, value) =>
    db
      .prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
      .run(key, value);
  const publicSettings = () => ({
    whatsapp_number: getSetting('whatsapp_number'),
    main_office_phone: getSetting('main_office_phone'),
  });

  // ---------- office printer (order slips) ----------

  const printerConfig = () => ({
    printer_name: getSetting('printer_name'),
    auto_print: getSetting('printer_auto') === '1',
    copies: Math.min(3, Math.max(1, Number(getSetting('printer_copies')) || 1)),
    slip_title: getSetting('slip_title') || 'Kamba Online',
  });

  const lastPrintResult = () => {
    try {
      return JSON.parse(getSetting('printer_last_result'));
    } catch {
      return null;
    }
  };

  // One slip at a time, so two orders arriving together never mix on the paper.
  let printQueue = Promise.resolve();
  const enqueuePrint = (job) => {
    const run = printQueue.then(job);
    printQueue = run.catch(() => undefined);
    return run;
  };

  const TEST_ORDER = () => ({
    id: 'TESTE-0001',
    created_at: new Date().toISOString(),
    customer_name: 'Cliente de Teste',
    customer_phone: '+244 900 000 000',
    fulfillment_type: 'pickup',
    payment_method: 'cash',
    delivery_address: null,
    notes: 'Acentos: ação, coração, é, ô, ç',
    total: 5000,
    items: [{ product_id: 'teste', product_name: 'Produto de teste', quantity: 2, unit_price: 2500 }],
  });

  /** Print an order's slip (or a test slip). Throws HttpError if it cannot. */
  async function printSlip({ orderId, test = false }) {
    const cfg = printerConfig();
    if (!cfg.printer_name) throw new HttpError(400, 'printer_not_set');

    let order;
    let skus = {};
    let allocations = [];
    if (test) {
      order = TEST_ORDER();
    } else {
      const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!row) throw new HttpError(404, 'not_found');
      order = orderWithItems(row);
      for (const i of order.items) {
        const p = db.prepare('SELECT sku FROM products WHERE id = ?').get(i.product_id);
        if (p) skus[i.product_id] = p.sku;
      }
      allocations = db
        .prepare(
          `SELECT a.product_id, s.name AS shop_name, a.quantity
           FROM order_allocations a JOIN shops s ON s.id = a.shop_id WHERE a.order_id = ?`
        )
        .all(orderId);
    }

    const slip = toEscPos(buildSlip(order, { title: cfg.slip_title, skus, allocations, test }));
    const data = Buffer.concat(Array.from({ length: cfg.copies }, () => slip));

    return enqueuePrint(async () => {
      const at = new Date().toISOString();
      try {
        await printer.printRaw(cfg.printer_name, data);
        if (!test) db.prepare('UPDATE orders SET printed_at = ? WHERE id = ?').run(at, orderId);
        setSetting('printer_last_result', JSON.stringify({ at, order_id: test ? 'TEST' : orderId, ok: true }));
        return { ok: true, printed_at: at };
      } catch (err) {
        const detail = String(err?.message ?? err).slice(0, 300);
        setSetting('printer_last_result', JSON.stringify({ at, order_id: test ? 'TEST' : orderId, ok: false, error: detail }));
        throw new HttpError(502, 'print_failed', { detail });
      }
    });
  }

  const staffPayload = (st) => ({
    id: st.id,
    username: st.username,
    full_name: st.full_name,
    role: st.role,
    is_active: !!st.is_active,
    permissions: st.role === 'owner' ? [...PERMISSIONS, 'users'] : JSON.parse(st.permissions),
  });

  const publicProduct = (r) => ({
    id: r.id,
    sku: r.sku,
    name_pt: r.name_pt,
    name_en: r.name_en,
    description_pt: r.description_pt,
    description_en: r.description_en,
    price: r.price,
    category_id: r.category_id,
    image_url: r.image_url,
    unit: r.unit,
    is_active: !!r.is_active,
    // Customers only ever learn "available or not" — never a quantity.
    in_stock: r.total_stock > 0,
  });
  const adminProduct = (r) => ({ ...publicProduct(r), total_stock: r.total_stock });

  const orderWithItems = (row) => ({
    ...row,
    items: db
      .prepare('SELECT product_id, product_name, quantity, unit_price FROM order_items WHERE order_id = ?')
      .all(row.id),
  });

  const createSession = (kind, { userId = null, staffId = null } = {}) => {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO sessions (token, kind, user_id, staff_id) VALUES (?, ?, ?, ?)').run(
      token,
      kind,
      userId,
      staffId
    );
    return token;
  };

  const sessionFrom = (req) => {
    const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
    if (!match) return null;
    const row = db.prepare('SELECT kind, user_id, staff_id FROM sessions WHERE token = ?').get(match[1]);
    if (!row) return null;

    if (row.kind === 'admin') {
      // A switched-off or removed staff member loses access straight away.
      const st = row.staff_id && db.prepare('SELECT * FROM staff WHERE id = ? AND is_active = 1').get(row.staff_id);
      return st ? { kind: 'admin', staff: staffPayload(st) } : null;
    }
    const u = db.prepare('SELECT id, email, full_name, phone FROM users WHERE id = ?').get(row.user_id);
    return u ? { kind: 'customer', user_id: u.id, email: u.email, full_name: u.full_name, phone: u.phone } : null;
  };

  const userPayload = (s) => ({ id: s.user_id, email: s.email, full_name: s.full_name, phone: s.phone });

  // ---------- routes ----------

  /**
   * auth: null (public) | 'optional' | 'customer' | 'admin' (any staff)
   *       | 'admin:<permission>' | 'owner'
   */
  const routes = [];
  const route = (method, pathPattern, auth, handler, opts = {}) => {
    const pattern = new RegExp('^' + pathPattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$');
    routes.push({ method, pattern, auth, handler, ...opts });
  };

  // --- public catalog
  route('GET', '/api/health', null, () => ({ ok: true }));

  route('GET', '/api/categories', null, () =>
    db.prepare('SELECT id, name_pt, name_en FROM categories ORDER BY name_pt').all()
  );

  route('GET', '/api/products', null, ({ query }) => {
    const category = query.get('category');
    const rows = category
      ? db.prepare(`${PRODUCT_SELECT} WHERE p.is_active = 1 AND p.category_id = ? ORDER BY p.name_pt`).all(category)
      : db.prepare(`${PRODUCT_SELECT} WHERE p.is_active = 1 ORDER BY p.name_pt`).all();
    return rows.map(publicProduct);
  });

  route('GET', '/api/products/:id', null, ({ params }) => {
    const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ? AND p.is_active = 1`).get(params.id);
    if (!row) throw new HttpError(404, 'not_found');
    return publicProduct(row);
  });

  route('GET', '/api/shops', null, () =>
    db
      .prepare('SELECT id, name, address, phone, latitude, longitude, is_active FROM shops WHERE is_active = 1 ORDER BY id')
      .all()
      .map((s) => ({ ...s, is_active: !!s.is_active }))
  );

  route('GET', '/api/settings', null, () => publicSettings());

  // --- customer accounts
  route('POST', '/api/auth/register', null, ({ body }) => {
    const email = text(body, 'email').toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'invalid_email');
    const password = text(body, 'password', { max: 200 });
    if (password.length < 6) throw new HttpError(400, 'invalid_password');
    const fullName = text(body, 'full_name');
    const phone = text(body, 'phone', { required: false }) ?? '';

    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'email_taken');

    const id = newId('u');
    db.prepare(
      'INSERT INTO users (id, email, password_hash, full_name, phone, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, email, hashPassword(password), fullName, phone, new Date().toISOString());

    return {
      status: 201,
      data: { token: createSession('customer', { userId: id }), user: { id, email, full_name: fullName, phone } },
    };
  });

  route('POST', '/api/auth/login', null, ({ body }) => {
    const email = text(body, 'email').toLowerCase();
    const password = text(body, 'password');
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(password, user.password_hash)) throw new HttpError(401, 'invalid_credentials');
    return {
      token: createSession('customer', { userId: user.id }),
      user: { id: user.id, email: user.email, full_name: user.full_name, phone: user.phone },
    };
  });

  route('GET', '/api/auth/me', 'customer', ({ session }) => userPayload(session));

  // --- orders
  route('POST', '/api/orders', 'optional', ({ body, session }) => {
    const customerName = text(body, 'customer_name');
    const customerPhone = text(body, 'customer_phone', { max: 40 });

    if (!PAYMENTS.has(body.payment_method)) throw new HttpError(400, 'invalid_payment_method');
    if (!FULFILLMENTS.has(body.fulfillment_type)) throw new HttpError(400, 'invalid_fulfillment_type');
    const address = text(body, 'delivery_address', { max: 400, required: body.fulfillment_type === 'delivery' });
    const notes = text(body, 'notes', { max: 500, required: false });

    if (!Array.isArray(body.items) || body.items.length === 0) throw new HttpError(400, 'invalid_items');
    // Merge duplicate lines so stock is checked against the real total.
    const wanted = new Map();
    for (const item of body.items) {
      if (!item || typeof item.product_id !== 'string') throw new HttpError(400, 'invalid_items');
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10_000) {
        throw new HttpError(400, 'invalid_items');
      }
      wanted.set(item.product_id, (wanted.get(item.product_id) ?? 0) + item.quantity);
    }

    const orderId = `KO-${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    db.exec('BEGIN IMMEDIATE');
    try {
      const lines = [];
      const shortages = [];
      for (const [productId, quantity] of wanted) {
        const row = db.prepare(`${PRODUCT_SELECT} WHERE p.id = ? AND p.is_active = 1`).get(productId);
        if (!row) throw new HttpError(400, 'unknown_product', { product_id: productId });
        if (row.total_stock < quantity) {
          // No quantities in the response: customers only learn which items are unavailable.
          shortages.push({ product_id: row.id, name_pt: row.name_pt, name_en: row.name_en });
        }
        lines.push({ row, quantity });
      }
      if (shortages.length) throw new HttpError(409, 'out_of_stock', { items: shortages });

      // Take stock from the shops that hold the most of it first (only shops that are switched on).
      const allocations = [];
      for (const { row, quantity } of lines) {
        let remaining = quantity;
        const holders = db
          .prepare(
            `SELECT st.shop_id, st.quantity FROM stock st
             JOIN shops sh ON sh.id = st.shop_id AND sh.is_active = 1
             WHERE st.product_id = ? AND st.quantity > 0 ORDER BY st.quantity DESC`
          )
          .all(row.id);
        for (const h of holders) {
          const take = Math.min(h.quantity, remaining);
          db.prepare('UPDATE stock SET quantity = quantity - ? WHERE product_id = ? AND shop_id = ?').run(
            take,
            row.id,
            h.shop_id
          );
          allocations.push({ product_id: row.id, shop_id: h.shop_id, quantity: take });
          remaining -= take;
          if (remaining === 0) break;
        }
      }

      // Prices always come from the database, never from the client.
      const total = lines.reduce((sum, { row, quantity }) => sum + row.price * quantity, 0);

      db.prepare(
        `INSERT INTO orders (id, user_id, customer_name, customer_phone, total, payment_method,
                             fulfillment_type, delivery_address, status, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
      ).run(
        orderId,
        session?.kind === 'customer' ? session.user_id : null,
        customerName,
        customerPhone,
        total,
        body.payment_method,
        body.fulfillment_type,
        body.fulfillment_type === 'delivery' ? address : null,
        notes,
        new Date().toISOString()
      );

      const insertItem = db.prepare(
        'INSERT INTO order_items (order_id, product_id, product_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)'
      );
      for (const { row, quantity } of lines) insertItem.run(orderId, row.id, row.name_pt, quantity, row.price);

      const insertAllocation = db.prepare(
        'INSERT INTO order_allocations (order_id, product_id, shop_id, quantity) VALUES (?, ?, ?, ?)'
      );
      for (const a of allocations) insertAllocation.run(orderId, a.product_id, a.shop_id, a.quantity);

      db.exec('COMMIT');

      // The office slip prints in the background. A printer problem never blocks the customer's order;
      // it shows as "not printed" in the admin so staff can reprint.
      const cfg = printerConfig();
      if (cfg.auto_print && cfg.printer_name) printSlip({ orderId }).catch(() => undefined);

      return { status: 201, data: { id: orderId, total } };
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  });

  route('GET', '/api/orders/mine', 'customer', ({ session }) =>
    db
      .prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, rowid DESC')
      .all(session.user_id)
      .map(orderWithItems)
      .map(({ printed_at: _internal, ...order }) => order)
  );

  // --- admin
  // Same work whether or not the username exists, so the answer time does not reveal it.
  const DUMMY_HASH = hashPassword('not-a-real-password');

  route('POST', '/api/admin/login', null, ({ body }) => {
    const username = text(body, 'username');
    const password = text(body, 'password');
    const st = db.prepare('SELECT * FROM staff WHERE username = ? AND is_active = 1').get(username);
    const ok = verifyPassword(password, st ? st.password_hash : DUMMY_HASH);
    if (!st || !ok) throw new HttpError(401, 'invalid_credentials');
    return { token: createSession('admin', { staffId: st.id }), user: staffPayload(st) };
  });

  route('GET', '/api/admin/me', 'admin', ({ session }) => session.staff);

  route('POST', '/api/admin/password', 'admin', ({ body, session }) => {
    const current = text(body, 'current_password', { max: 200 });
    const next = text(body, 'new_password', { max: 200 });
    if (next.length < 6) throw new HttpError(400, 'invalid_new_password');
    const st = db.prepare('SELECT * FROM staff WHERE id = ?').get(session.staff.id);
    if (!verifyPassword(current, st.password_hash)) throw new HttpError(400, 'wrong_password');
    db.prepare('UPDATE staff SET password_hash = ? WHERE id = ?').run(hashPassword(next), st.id);
    return { ok: true };
  });

  // --- staff accounts (owner only)
  const parsePermissions = (value) => {
    if (!Array.isArray(value) || value.some((p) => !PERMISSIONS.includes(p))) {
      throw new HttpError(400, 'invalid_permissions');
    }
    return [...new Set(value)];
  };

  route('GET', '/api/admin/staff', 'owner', () =>
    db.prepare('SELECT * FROM staff ORDER BY role DESC, full_name').all().map(staffPayload)
  );

  route('POST', '/api/admin/staff', 'owner', ({ body }) => {
    const username = text(body, 'username', { max: 40 });
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw new HttpError(400, 'invalid_username');
    const password = text(body, 'password', { max: 200 });
    if (password.length < 6) throw new HttpError(400, 'invalid_password');
    const permissions = parsePermissions(body.permissions ?? []);
    if (db.prepare('SELECT 1 FROM staff WHERE username = ?').get(username)) throw new HttpError(409, 'username_taken');

    const id = newId('st');
    db.prepare(
      `INSERT INTO staff (id, username, password_hash, full_name, role, permissions, is_active, created_at)
       VALUES (?, ?, ?, ?, 'staff', ?, 1, ?)`
    ).run(id, username, hashPassword(password), text(body, 'full_name'), JSON.stringify(permissions), new Date().toISOString());
    return { status: 201, data: staffPayload(db.prepare('SELECT * FROM staff WHERE id = ?').get(id)) };
  });

  route('PUT', '/api/admin/staff/:id', 'owner', ({ params, body }) => {
    const st = db.prepare('SELECT * FROM staff WHERE id = ?').get(params.id);
    if (!st) throw new HttpError(404, 'not_found');
    const isOwner = st.role === 'owner';

    const updates = {};
    if ('full_name' in body) updates.full_name = text(body, 'full_name');
    if ('permissions' in body) {
      if (isOwner) throw new HttpError(400, 'cannot_modify_owner');
      updates.permissions = JSON.stringify(parsePermissions(body.permissions));
    }
    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'invalid_is_active');
      if (isOwner && !body.is_active) throw new HttpError(400, 'cannot_modify_owner');
      updates.is_active = body.is_active ? 1 : 0;
    }
    if ('password' in body) {
      const password = text(body, 'password', { max: 200 });
      if (password.length < 6) throw new HttpError(400, 'invalid_password');
      updates.password_hash = hashPassword(password);
    }

    const keys = Object.keys(updates);
    if (keys.length) {
      db.prepare(`UPDATE staff SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...keys.map((k) => updates[k]),
        st.id
      );
      // Switching someone off or resetting their password signs them out everywhere.
      if ('is_active' in updates || 'password_hash' in updates) {
        db.prepare('DELETE FROM sessions WHERE staff_id = ?').run(st.id);
      }
    }
    return staffPayload(db.prepare('SELECT * FROM staff WHERE id = ?').get(st.id));
  });

  // --- business settings
  route('GET', '/api/admin/settings', 'admin:settings', () => publicSettings());

  route('PUT', '/api/admin/settings', 'admin:settings', ({ body }) => {
    if ('whatsapp_number' in body) {
      const raw = typeof body.whatsapp_number === 'string' ? body.whatsapp_number.trim() : null;
      if (raw === null) throw new HttpError(400, 'invalid_whatsapp_number');
      setSetting('whatsapp_number', raw === '' ? '' : cleanPhone(raw));
    }
    if ('main_office_phone' in body) {
      setSetting('main_office_phone', text(body, 'main_office_phone', { max: 40, required: false }) ?? '');
    }
    return publicSettings();
  });

  // --- office printer
  route('GET', '/api/admin/printer', 'admin:settings', async () => {
    let printers = [];
    let listError = null;
    try {
      printers = await printer.list();
    } catch (err) {
      listError = String(err?.message ?? err).slice(0, 300);
    }
    return { ...printerConfig(), printers, list_error: listError, last_result: lastPrintResult() };
  });

  route('PUT', '/api/admin/printer', 'admin:settings', ({ body }) => {
    if ('printer_name' in body) setSetting('printer_name', text(body, 'printer_name', { max: 200, required: false }) ?? '');
    if ('auto_print' in body) {
      if (typeof body.auto_print !== 'boolean') throw new HttpError(400, 'invalid_auto_print');
      setSetting('printer_auto', body.auto_print ? '1' : '0');
    }
    if ('copies' in body) {
      if (!Number.isInteger(body.copies) || body.copies < 1 || body.copies > 3) throw new HttpError(400, 'invalid_copies');
      setSetting('printer_copies', String(body.copies));
    }
    if ('slip_title' in body) setSetting('slip_title', text(body, 'slip_title', { max: 40, required: false }) ?? '');
    return printerConfig();
  });

  route('POST', '/api/admin/printer/test', 'admin:settings', () => printSlip({ test: true }));

  // --- shop locations
  const shopPayload = (s) => ({ ...s, is_active: !!s.is_active });
  const coordinate = (body, field, limit) => {
    if (body[field] === undefined || body[field] === null || body[field] === '') return 0;
    const v = body[field];
    if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > limit) throw new HttpError(400, `invalid_${field}`);
    return v;
  };

  route('GET', '/api/admin/shops', 'admin:shops', () =>
    db.prepare('SELECT * FROM shops ORDER BY id').all().map(shopPayload)
  );

  route('POST', '/api/admin/shops', 'admin:shops', ({ body }) => {
    const id = newId('s');
    db.prepare('INSERT INTO shops (id, name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)').run(
      id,
      text(body, 'name'),
      text(body, 'address', { max: 400 }),
      text(body, 'phone', { max: 40, required: false }) ?? '',
      coordinate(body, 'latitude', 90),
      coordinate(body, 'longitude', 180)
    );
    return { status: 201, data: shopPayload(db.prepare('SELECT * FROM shops WHERE id = ?').get(id)) };
  });

  route('PUT', '/api/admin/shops/:id', 'admin:shops', ({ params, body }) => {
    if (!db.prepare('SELECT 1 FROM shops WHERE id = ?').get(params.id)) throw new HttpError(404, 'not_found');
    const updates = {};
    if ('name' in body) updates.name = text(body, 'name');
    if ('address' in body) updates.address = text(body, 'address', { max: 400 });
    if ('phone' in body) updates.phone = text(body, 'phone', { max: 40, required: false }) ?? '';
    if ('latitude' in body) updates.latitude = coordinate(body, 'latitude', 90);
    if ('longitude' in body) updates.longitude = coordinate(body, 'longitude', 180);
    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'invalid_is_active');
      updates.is_active = body.is_active ? 1 : 0;
    }
    const keys = Object.keys(updates);
    if (keys.length) {
      db.prepare(`UPDATE shops SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...keys.map((k) => updates[k]),
        params.id
      );
    }
    return shopPayload(db.prepare('SELECT * FROM shops WHERE id = ?').get(params.id));
  });

  // --- categories
  route('POST', '/api/admin/categories', 'admin:products', ({ body }) => {
    const id = newId('c');
    db.prepare('INSERT INTO categories (id, name_pt, name_en) VALUES (?, ?, ?)').run(
      id,
      text(body, 'name_pt'),
      text(body, 'name_en')
    );
    return { status: 201, data: db.prepare('SELECT id, name_pt, name_en FROM categories WHERE id = ?').get(id) };
  });

  route('PUT', '/api/admin/categories/:id', 'admin:products', ({ params, body }) => {
    if (!db.prepare('SELECT 1 FROM categories WHERE id = ?').get(params.id)) throw new HttpError(404, 'not_found');
    db.prepare('UPDATE categories SET name_pt = ?, name_en = ? WHERE id = ?').run(
      text(body, 'name_pt'),
      text(body, 'name_en'),
      params.id
    );
    return db.prepare('SELECT id, name_pt, name_en FROM categories WHERE id = ?').get(params.id);
  });

  // Products in a deleted category simply become "no category".
  route('DELETE', '/api/admin/categories/:id', 'admin:products', ({ params }) => {
    const result = db.prepare('DELETE FROM categories WHERE id = ?').run(params.id);
    if (!result.changes) throw new HttpError(404, 'not_found');
    return { ok: true };
  });

  // --- product photos
  route(
    'POST',
    '/api/admin/uploads',
    'admin:products',
    ({ body }) => {
      const ext = sniffImage(body);
      if (!ext) throw new HttpError(400, 'invalid_image');
      const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(uploadsDir, name), body);
      return { status: 201, data: { url: `/uploads/${name}` } };
    },
    { raw: true }
  );

  route('GET', '/api/admin/summary', 'admin', () => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return {
      products: db.prepare('SELECT COUNT(*) AS c FROM products WHERE is_active = 1').get().c,
      pending_orders: db.prepare("SELECT COUNT(*) AS c FROM orders WHERE status = 'pending'").get().c,
      low_stock_products: db
        .prepare(
          `SELECT COUNT(*) AS c FROM (${PRODUCT_SELECT} WHERE p.is_active = 1) WHERE total_stock < ?`
        )
        .get(LOW_STOCK_THRESHOLD).c,
      shops: db.prepare('SELECT COUNT(*) AS c FROM shops WHERE is_active = 1').get().c,
      sales_today: db
        .prepare("SELECT COALESCE(SUM(total), 0) AS t FROM orders WHERE status != 'cancelled' AND created_at >= ?")
        .get(startOfDay.toISOString()).t,
    };
  });

  route('GET', '/api/admin/products', 'admin:products', () =>
    db.prepare(`${PRODUCT_SELECT} ORDER BY p.name_pt`).all().map(adminProduct)
  );

  route('POST', '/api/admin/products', 'admin:products', ({ body }) => {
    const sku = text(body, 'sku', { max: 60 });
    if (db.prepare('SELECT 1 FROM products WHERE sku = ?').get(sku)) throw new HttpError(409, 'sku_taken');
    const categoryId = text(body, 'category_id', { required: false });
    if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(categoryId)) {
      throw new HttpError(400, 'invalid_category_id');
    }
    const id = newId('p');
    db.prepare(
      `INSERT INTO products (id, sku, name_pt, name_en, description_pt, description_en, price, category_id, image_url, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      sku,
      text(body, 'name_pt'),
      text(body, 'name_en'),
      text(body, 'description_pt', { max: 2000, required: false }) ?? '',
      text(body, 'description_en', { max: 2000, required: false }) ?? '',
      number(body, 'price'),
      categoryId,
      text(body, 'image_url', { max: 500, required: false }),
      text(body, 'unit', { max: 20, required: false }) ?? 'un'
    );
    return { status: 201, data: adminProduct(db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(id)) };
  });

  route('DELETE', '/api/admin/products/:id', 'admin:products', ({ params }) => {
    // Past orders keep their own copy of the product name and price, so history is not affected.
    const result = db.prepare('DELETE FROM products WHERE id = ?').run(params.id);
    if (!result.changes) throw new HttpError(404, 'not_found');
    return { ok: true };
  });

  route('PUT', '/api/admin/products/:id', 'admin:products', ({ params, body }) => {
    if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(params.id)) throw new HttpError(404, 'not_found');

    const updates = {};
    for (const f of ['name_pt', 'name_en']) if (f in body) updates[f] = text(body, f);
    for (const f of ['description_pt', 'description_en']) {
      if (f in body) updates[f] = text(body, f, { max: 2000, required: false }) ?? '';
    }
    if ('price' in body) updates.price = number(body, 'price');
    if ('unit' in body) updates.unit = text(body, 'unit', { max: 20 });
    if ('image_url' in body) updates.image_url = text(body, 'image_url', { max: 500, required: false });
    if ('category_id' in body) {
      const c = text(body, 'category_id', { required: false });
      if (c && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(c)) throw new HttpError(400, 'invalid_category_id');
      updates.category_id = c;
    }
    if ('is_active' in body) {
      if (typeof body.is_active !== 'boolean') throw new HttpError(400, 'invalid_is_active');
      updates.is_active = body.is_active ? 1 : 0;
    }

    const keys = Object.keys(updates);
    if (keys.length) {
      db.prepare(`UPDATE products SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
        ...keys.map((k) => updates[k]),
        params.id
      );
    }
    return adminProduct(db.prepare(`${PRODUCT_SELECT} WHERE p.id = ?`).get(params.id));
  });

  route('GET', '/api/admin/stock', 'admin:stock', () =>
    db
      .prepare(
        `SELECT p.id AS product_id, p.name_pt AS product, p.sku, s.id AS shop_id, s.name AS shop,
                COALESCE(st.quantity, 0) AS quantity
         FROM products p
         CROSS JOIN shops s
         LEFT JOIN stock st ON st.product_id = p.id AND st.shop_id = s.id
         WHERE s.is_active = 1
         ORDER BY p.name_pt, s.id`
      )
      .all()
  );

  route('PUT', '/api/admin/stock', 'admin:stock', ({ body }) => {
    const productId = text(body, 'product_id');
    const shopId = text(body, 'shop_id');
    const quantity = number(body, 'quantity', { integer: true });
    if (!db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId)) throw new HttpError(404, 'product_not_found');
    if (!db.prepare('SELECT 1 FROM shops WHERE id = ?').get(shopId)) throw new HttpError(404, 'shop_not_found');
    db.prepare(
      `INSERT INTO stock (product_id, shop_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT (product_id, shop_id) DO UPDATE SET quantity = excluded.quantity`
    ).run(productId, shopId, quantity);
    return { product_id: productId, shop_id: shopId, quantity };
  });

  route('GET', '/api/admin/orders', 'admin:orders', ({ query }) => {
    const status = query.get('status');
    if (status && !STATUSES.has(status)) throw new HttpError(400, 'invalid_status');
    const rows = status
      ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC, rowid DESC').all(status)
      : db.prepare('SELECT * FROM orders ORDER BY created_at DESC, rowid DESC').all();
    return rows.map(orderWithItems);
  });

  // Put an order's items back on the shelves they came from.
  const returnStock = (order) => {
    const addBack = db.prepare(
      `INSERT INTO stock (product_id, shop_id, quantity) VALUES (?, ?, ?)
       ON CONFLICT (product_id, shop_id) DO UPDATE SET quantity = quantity + excluded.quantity`
    );
    const allocations = db
      .prepare('SELECT product_id, shop_id, quantity FROM order_allocations WHERE order_id = ?')
      .all(order.id);
    if (allocations.length) {
      for (const a of allocations) {
        // Skip anything that was deleted since the order was placed.
        const stillThere =
          db.prepare('SELECT 1 FROM products WHERE id = ?').get(a.product_id) &&
          db.prepare('SELECT 1 FROM shops WHERE id = ?').get(a.shop_id);
        if (stillThere) addBack.run(a.product_id, a.shop_id, a.quantity);
      }
      return;
    }
    // Orders made before shops were recorded: return to the first active shop.
    const shop = db.prepare('SELECT id FROM shops WHERE is_active = 1 ORDER BY id LIMIT 1').get();
    if (!shop) return;
    const items = db.prepare('SELECT product_id, quantity FROM order_items WHERE order_id = ?').all(order.id);
    for (const i of items) {
      if (db.prepare('SELECT 1 FROM products WHERE id = ?').get(i.product_id)) addBack.run(i.product_id, shop.id, i.quantity);
    }
  };

  route('POST', '/api/admin/orders/:id/print', 'admin:orders', ({ params }) => printSlip({ orderId: params.id }));

  route('PATCH', '/api/admin/orders/:id', 'admin:orders', ({ params, body }) => {
    if (!STATUSES.has(body.status)) throw new HttpError(400, 'invalid_status');

    db.exec('BEGIN IMMEDIATE');
    try {
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(params.id);
      if (!order) throw new HttpError(404, 'not_found');

      if (order.status !== body.status) {
        // A cancelled order has already given its stock back, so it cannot be reopened (make a new order instead).
        if (order.status === 'cancelled') throw new HttpError(409, 'order_cancelled');
        if (body.status === 'cancelled') {
          if (order.status === 'delivered') throw new HttpError(409, 'cannot_cancel_delivered');
          returnStock(order);
        }
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(body.status, params.id);
      }
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return orderWithItems(db.prepare('SELECT * FROM orders WHERE id = ?').get(params.id));
  });

  // ---------- dispatch ----------

  const send = (res, status, data) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    });
    res.end(data === undefined ? '' : JSON.stringify(data));
  };

  return createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') return send(res, 204);

      const url = new URL(req.url, 'http://localhost');
      if (serveStatic && !url.pathname.startsWith('/api/') && serveStatic(req, res, url.pathname)) return;
      let params = null;
      const match = routes.find((r) => {
        if (r.method !== req.method) return false;
        const m = r.pattern.exec(url.pathname);
        if (m) params = m.groups ?? {};
        return !!m;
      });

      if (!match) {
        const pathKnown = routes.some((r) => r.pattern.test(url.pathname));
        throw new HttpError(pathKnown ? 405 : 404, pathKnown ? 'method_not_allowed' : 'not_found');
      }

      const session = sessionFrom(req);
      const auth = match.auth;
      if (auth === 'customer' && session?.kind !== 'customer') throw new HttpError(401, 'unauthorized');
      if (auth === 'admin' || auth === 'owner' || auth?.startsWith('admin:')) {
        if (session?.kind !== 'admin') throw new HttpError(401, 'unauthorized');
        const { role, permissions } = session.staff;
        if (auth === 'owner' && role !== 'owner') throw new HttpError(403, 'forbidden');
        if (auth.startsWith('admin:') && !permissions.includes(auth.slice(6))) throw new HttpError(403, 'forbidden');
      }

      let body = {};
      if (match.raw) body = await readRaw(req, MAX_UPLOAD);
      else if (['POST', 'PUT', 'PATCH'].includes(req.method)) body = await readBody(req);
      const result = await match.handler({ body, params, query: url.searchParams, session });

      if (result && typeof result === 'object' && 'status' in result && 'data' in result) {
        send(res, result.status, result.data);
      } else {
        send(res, 200, result);
      }
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.code, ...err.extra });
      console.error(err);
      send(res, 500, { error: 'server_error' });
    }
  });
}
