import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';

let server;
let base;
let db;
let owner; // owner token
let uploadsDir;

const call = async (method, urlPath, { body, token, raw } = {}) => {
  const res = await fetch(base + urlPath, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
};

const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 7)]);

/** Create a staff member and return { id, token }. */
async function makeStaff(permissions, username = 'ana') {
  const created = await call('POST', '/api/admin/staff', {
    token: owner,
    body: { username, password: 'secret123', full_name: 'Ana Staff', permissions },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const login = await call('POST', '/api/admin/login', { body: { username, password: 'secret123' } });
  assert.equal(login.status, 200);
  return { id: created.data.id, token: login.data.token };
}

before(async () => {
  db = openDb(':memory:');
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamba-uploads-'));
  server = createApp({ db, adminUser: 'boss', adminPassword: 'boss-pass', uploadsDir });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

beforeEach(async () => {
  db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM sessions; DELETE FROM users;');
  db.exec("DELETE FROM staff WHERE role != 'owner'; DELETE FROM settings;");
  db.exec('DELETE FROM stock; DELETE FROM products; DELETE FROM shops; DELETE FROM categories;');
  seed(db);
  const login = await call('POST', '/api/admin/login', { body: { username: 'boss', password: 'boss-pass' } });
  owner = login.data.token;
});

after(() => server.close());

// ---------- settings (WhatsApp number, office phone) ----------

test('admin registers the WhatsApp number and the customer app can read it', async () => {
  assert.deepEqual((await call('GET', '/api/settings')).data, { whatsapp_number: '', main_office_phone: '' });

  const saved = await call('PUT', '/api/admin/settings', {
    token: owner,
    body: { whatsapp_number: '+244 923 456 789', main_office_phone: '+244 923 456 000' },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.whatsapp_number, '244923456789'); // digits only, ready for wa.me

  const pub = await call('GET', '/api/settings'); // no login needed
  assert.equal(pub.data.whatsapp_number, '244923456789');
  assert.equal(pub.data.main_office_phone, '+244 923 456 000');

  assert.equal((await call('PUT', '/api/admin/settings', { token: owner, body: { whatsapp_number: 'abc' } })).status, 400);
  assert.equal((await call('PUT', '/api/admin/settings', { token: owner, body: { whatsapp_number: '123' } })).status, 400);

  // Clearing it is allowed (the customer app then hides the WhatsApp buttons).
  await call('PUT', '/api/admin/settings', { token: owner, body: { whatsapp_number: '' } });
  assert.equal((await call('GET', '/api/settings')).data.whatsapp_number, '');
});

test('only people with the settings permission can change settings', async () => {
  const noPerm = await makeStaff(['stock']);
  assert.equal((await call('PUT', '/api/admin/settings', { token: noPerm.token, body: { whatsapp_number: '244900000001' } })).status, 403);
  assert.equal((await call('PUT', '/api/admin/settings', { body: { whatsapp_number: '244900000001' } })).status, 401);

  const withPerm = await makeStaff(['settings'], 'bia');
  assert.equal((await call('PUT', '/api/admin/settings', { token: withPerm.token, body: { whatsapp_number: '244900000001' } })).status, 200);
});

// ---------- staff accounts and permissions ----------

test('owner creates staff who can only do what they are allowed to', async () => {
  const ana = await makeStaff(['stock']);

  const me = await call('GET', '/api/admin/me', { token: ana.token });
  assert.equal(me.data.role, 'staff');
  assert.deepEqual(me.data.permissions, ['stock']);

  assert.equal((await call('GET', '/api/admin/stock', { token: ana.token })).status, 200);
  assert.equal((await call('GET', '/api/admin/summary', { token: ana.token })).status, 200); // any staff
  assert.equal((await call('GET', '/api/admin/products', { token: ana.token })).status, 403);
  assert.equal((await call('GET', '/api/admin/orders', { token: ana.token })).status, 403);
  assert.equal((await call('GET', '/api/admin/shops', { token: ana.token })).status, 403);
  assert.equal((await call('GET', '/api/admin/staff', { token: ana.token })).status, 403);
  assert.equal(
    (await call('POST', '/api/admin/staff', { token: ana.token, body: { username: 'evil', password: 'secret123', full_name: 'E', permissions: [] } })).status,
    403
  );

  // Owner can do everything.
  const meOwner = await call('GET', '/api/admin/me', { token: owner });
  assert.equal(meOwner.data.role, 'owner');
  assert.ok(meOwner.data.permissions.includes('users'));
});

test('staff list never exposes password hashes', async () => {
  await makeStaff(['orders']);
  const list = await call('GET', '/api/admin/staff', { token: owner });
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 2);
  assert.ok(!JSON.stringify(list.data).includes('password'));
});

test('staff account validation', async () => {
  const mk = (body) => call('POST', '/api/admin/staff', { token: owner, body: { full_name: 'X', permissions: [], ...body } });
  assert.equal((await mk({ username: 'ab', password: 'secret123' })).status, 400); // too short
  assert.equal((await mk({ username: 'has space', password: 'secret123' })).status, 400);
  assert.equal((await mk({ username: 'okname', password: '123' })).status, 400);
  assert.equal((await mk({ username: 'okname', password: 'secret123', permissions: ['everything'] })).status, 400);
  assert.equal((await mk({ username: 'okname', password: 'secret123', permissions: ['users'] })).status, 400); // owner-only
  assert.equal((await mk({ username: 'okname', password: 'secret123' })).status, 201);
  assert.equal((await mk({ username: 'OKNAME', password: 'secret123' })).status, 409); // not case sensitive
  assert.equal((await mk({ username: 'boss', password: 'secret123' })).status, 409);
});

test('changing permissions takes effect immediately', async () => {
  const ana = await makeStaff([]);
  assert.equal((await call('GET', '/api/admin/stock', { token: ana.token })).status, 403);
  const upd = await call('PUT', `/api/admin/staff/${ana.id}`, { token: owner, body: { permissions: ['stock', 'orders'] } });
  assert.equal(upd.status, 200);
  assert.equal((await call('GET', '/api/admin/stock', { token: ana.token })).status, 200);
  assert.equal((await call('GET', '/api/admin/orders', { token: ana.token })).status, 200);
});

test('switching a staff member off signs them out and blocks login', async () => {
  const ana = await makeStaff(['stock']);
  await call('PUT', `/api/admin/staff/${ana.id}`, { token: owner, body: { is_active: false } });
  assert.equal((await call('GET', '/api/admin/stock', { token: ana.token })).status, 401);
  assert.equal((await call('POST', '/api/admin/login', { body: { username: 'ana', password: 'secret123' } })).status, 401);

  await call('PUT', `/api/admin/staff/${ana.id}`, { token: owner, body: { is_active: true } });
  assert.equal((await call('POST', '/api/admin/login', { body: { username: 'ana', password: 'secret123' } })).status, 200);
});

test('owner can reset a staff password; old password and sessions stop working', async () => {
  const ana = await makeStaff(['stock']);
  await call('PUT', `/api/admin/staff/${ana.id}`, { token: owner, body: { password: 'brand-new-1' } });
  assert.equal((await call('GET', '/api/admin/stock', { token: ana.token })).status, 401);
  assert.equal((await call('POST', '/api/admin/login', { body: { username: 'ana', password: 'secret123' } })).status, 401);
  assert.equal((await call('POST', '/api/admin/login', { body: { username: 'ana', password: 'brand-new-1' } })).status, 200);
});

test('the owner account is protected', async () => {
  const list = await call('GET', '/api/admin/staff', { token: owner });
  const ownerRow = list.data.find((s) => s.role === 'owner');
  assert.equal((await call('PUT', `/api/admin/staff/${ownerRow.id}`, { token: owner, body: { is_active: false } })).status, 400);
  assert.equal((await call('PUT', `/api/admin/staff/${ownerRow.id}`, { token: owner, body: { permissions: [] } })).status, 400);
  assert.equal((await call('GET', '/api/admin/stock', { token: owner })).status, 200);
});

test('anyone can change their own password, but must know the current one', async () => {
  const ana = await makeStaff(['stock']);
  const wrong = await call('POST', '/api/admin/password', { token: ana.token, body: { current_password: 'nope-nope', new_password: 'another-1' } });
  assert.equal(wrong.status, 400);
  const short = await call('POST', '/api/admin/password', { token: ana.token, body: { current_password: 'secret123', new_password: '123' } });
  assert.equal(short.status, 400);
  const ok = await call('POST', '/api/admin/password', { token: ana.token, body: { current_password: 'secret123', new_password: 'another-1' } });
  assert.equal(ok.status, 200);
  assert.equal((await call('POST', '/api/admin/login', { body: { username: 'ana', password: 'another-1' } })).status, 200);
  assert.equal((await call('POST', '/api/admin/login', { body: { username: 'ana', password: 'secret123' } })).status, 401);
});

test('a customer token never unlocks admin', async () => {
  const reg = await call('POST', '/api/auth/register', { body: { email: 'c@d.co', password: 'secret123', full_name: 'C' } });
  assert.equal((await call('GET', '/api/admin/me', { token: reg.data.token })).status, 401);
});

// ---------- shop locations ----------

test('admin adds, edits and switches off shop locations', async () => {
  const created = await call('POST', '/api/admin/shops', {
    token: owner,
    body: { name: 'Loja Nova', address: 'Rua 1, Soyo', phone: '+244 900 000 777' },
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(created.data.latitude, 0);

  let pub = await call('GET', '/api/shops');
  assert.equal(pub.data.length, 7);
  assert.ok(pub.data.some((s) => s.name === 'Loja Nova'));

  const edited = await call('PUT', `/api/admin/shops/${id}`, { token: owner, body: { name: 'Loja Nova 2', latitude: -6.13, longitude: 12.36 } });
  assert.equal(edited.data.name, 'Loja Nova 2');
  assert.equal(edited.data.latitude, -6.13);

  await call('PUT', `/api/admin/shops/${id}`, { token: owner, body: { is_active: false } });
  pub = await call('GET', '/api/shops');
  assert.equal(pub.data.length, 6);
  const adminList = await call('GET', '/api/admin/shops', { token: owner });
  assert.equal(adminList.data.length, 7); // admin still sees switched-off shops

  assert.equal((await call('POST', '/api/admin/shops', { token: owner, body: { name: '', address: 'x' } })).status, 400);
  assert.equal((await call('POST', '/api/admin/shops', { token: owner, body: { name: 'A', address: 'B', latitude: 500 } })).status, 400);
  assert.equal((await call('PUT', '/api/admin/shops/nope', { token: owner, body: { name: 'A' } })).status, 404);
});

test('a new shop shows up on the stock page, and a switched-off shop stops counting as stock', async () => {
  const created = await call('POST', '/api/admin/shops', { token: owner, body: { name: 'Loja Extra', address: 'Rua 2' } });
  const rows = (await call('GET', '/api/admin/stock', { token: owner })).data;
  assert.ok(rows.some((r) => r.shop_id === created.data.id));

  // p5 (rice 25kg) is only stocked at the main office s6. Switching it off makes it unavailable.
  assert.equal((await call('GET', '/api/products/p5')).data.in_stock, true);
  await call('PUT', '/api/admin/shops/s6', { token: owner, body: { is_active: false } });
  assert.equal((await call('GET', '/api/products/p5')).data.in_stock, false);
  const order = await call('POST', '/api/orders', {
    body: { customer_name: 'A', customer_phone: '1', payment_method: 'cash', fulfillment_type: 'pickup', items: [{ product_id: 'p5', quantity: 1 }] },
  });
  assert.equal(order.status, 409);

  await call('PUT', '/api/admin/shops/s6', { token: owner, body: { is_active: true } });
  assert.equal((await call('GET', '/api/products/p5')).data.in_stock, true);
});

test('shop permission is required to manage shops', async () => {
  const ana = await makeStaff(['products']);
  assert.equal((await call('POST', '/api/admin/shops', { token: ana.token, body: { name: 'A', address: 'B' } })).status, 403);
  const bia = await makeStaff(['shops'], 'bia');
  assert.equal((await call('POST', '/api/admin/shops', { token: bia.token, body: { name: 'A', address: 'B' } })).status, 201);
});

// ---------- cancelled orders return to stock ----------

const stockOf = (productId, shopId) =>
  db.prepare('SELECT COALESCE(quantity, 0) AS q FROM stock WHERE product_id = ? AND shop_id = ?').get(productId, shopId)?.q ?? 0;

const order = (items) =>
  call('POST', '/api/orders', {
    body: { customer_name: 'Maria', customer_phone: '+244 900', payment_method: 'cash', fulfillment_type: 'pickup', items },
  });

test('cancelling an order puts the items back in the shops they came from', async () => {
  // p1: s1 has 50, s2 has 30. Ordering 60 takes 50 from s1 and 10 from s2.
  const placed = await order([{ product_id: 'p1', quantity: 60 }]);
  assert.equal(placed.status, 201);
  assert.equal(stockOf('p1', 's1'), 0);
  assert.equal(stockOf('p1', 's2'), 20);

  const cancelled = await call('PATCH', `/api/admin/orders/${placed.data.id}`, { token: owner, body: { status: 'cancelled' } });
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.data.status, 'cancelled');
  assert.equal(stockOf('p1', 's1'), 50);
  assert.equal(stockOf('p1', 's2'), 30);
});

test('stock is returned only once, and a cancelled order cannot be reopened', async () => {
  const placed = await order([{ product_id: 'p3', quantity: 5 }]);
  const url = `/api/admin/orders/${placed.data.id}`;
  await call('PATCH', url, { token: owner, body: { status: 'cancelled' } });
  assert.equal(stockOf('p3', 's1'), 100);

  const again = await call('PATCH', url, { token: owner, body: { status: 'cancelled' } });
  assert.equal(again.status, 200);
  assert.equal(stockOf('p3', 's1'), 100); // not 105

  const reopen = await call('PATCH', url, { token: owner, body: { status: 'pending' } });
  assert.equal(reopen.status, 409);
  assert.equal(stockOf('p3', 's1'), 100);
});

test('a delivered order cannot be cancelled', async () => {
  const placed = await order([{ product_id: 'p3', quantity: 5 }]);
  const url = `/api/admin/orders/${placed.data.id}`;
  await call('PATCH', url, { token: owner, body: { status: 'delivered' } });
  const res = await call('PATCH', url, { token: owner, body: { status: 'cancelled' } });
  assert.equal(res.status, 409);
  assert.equal(stockOf('p3', 's1'), 95);
});

test('cancelling works through every pre-delivery status', async () => {
  for (const status of ['confirmed', 'preparing', 'ready']) {
    const placed = await order([{ product_id: 'p3', quantity: 1 }]);
    const url = `/api/admin/orders/${placed.data.id}`;
    await call('PATCH', url, { token: owner, body: { status } });
    const before = stockOf('p3', 's1');
    await call('PATCH', url, { token: owner, body: { status: 'cancelled' } });
    assert.equal(stockOf('p3', 's1'), before + 1, `cancel from ${status}`);
  }
});

test('old orders with no recorded shop go back to the first active shop', async () => {
  const placed = await order([{ product_id: 'p3', quantity: 4 }]);
  db.prepare('DELETE FROM order_allocations WHERE order_id = ?').run(placed.data.id); // simulate an older order
  await call('PATCH', `/api/admin/orders/${placed.data.id}`, { token: owner, body: { status: 'cancelled' } });
  assert.equal(stockOf('p3', 's1'), 100);
});

test('a cancelled order makes a sold-out product orderable again', async () => {
  // p5 has 15 at s6. Buy them all, then cancel.
  const placed = await order([{ product_id: 'p5', quantity: 15 }]);
  assert.equal((await call('GET', '/api/products/p5')).data.in_stock, false);
  await call('PATCH', `/api/admin/orders/${placed.data.id}`, { token: owner, body: { status: 'cancelled' } });
  assert.equal((await call('GET', '/api/products/p5')).data.in_stock, true);
});

test('cancelled orders do not count in sales today', async () => {
  const placed = await order([{ product_id: 'p3', quantity: 2 }]);
  assert.equal((await call('GET', '/api/admin/summary', { token: owner })).data.sales_today, 3600);
  await call('PATCH', `/api/admin/orders/${placed.data.id}`, { token: owner, body: { status: 'cancelled' } });
  assert.equal((await call('GET', '/api/admin/summary', { token: owner })).data.sales_today, 0);
});

// ---------- product photos ----------

test('admin uploads a product photo and customers can see it', async () => {
  const up = await call('POST', '/api/admin/uploads', { token: owner, raw: png() });
  assert.equal(up.status, 201);
  assert.match(up.data.url, /^\/uploads\/[a-f0-9]+\.png$/);

  const file = await fetch(base + up.data.url); // public, no login
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await file.arrayBuffer()).length, png().length);

  const upd = await call('PUT', '/api/admin/products/p1', { token: owner, body: { image_url: up.data.url } });
  assert.equal(upd.data.image_url, up.data.url);
  assert.equal((await call('GET', '/api/products/p1')).data.image_url, up.data.url);
});

test('photo upload rejects non-images, oversized files and missing permission', async () => {
  const fake = await call('POST', '/api/admin/uploads', { token: owner, raw: Buffer.from('<script>alert(1)</script>') });
  assert.equal(fake.status, 400);
  const empty = await call('POST', '/api/admin/uploads', { token: owner, raw: Buffer.alloc(0) });
  assert.equal(empty.status, 400);

  const big = Buffer.concat([png(), Buffer.alloc(6 * 1024 * 1024)]);
  assert.equal((await call('POST', '/api/admin/uploads', { token: owner, raw: big })).status, 413);

  assert.equal((await call('POST', '/api/admin/uploads', { raw: png() })).status, 401);
  const ana = await makeStaff(['stock']);
  assert.equal((await call('POST', '/api/admin/uploads', { token: ana.token, raw: png() })).status, 403);
  const bia = await makeStaff(['products'], 'bia');
  assert.equal((await call('POST', '/api/admin/uploads', { token: bia.token, raw: png() })).status, 201);
});

test('uploads cannot be used to read other files', async () => {
  fs.writeFileSync(path.join(uploadsDir, '..', 'secret-test.txt'), 'secret');
  for (const p of ['/uploads/../secret-test.txt', '/uploads/..%2Fsecret-test.txt', '/uploads/%2e%2e/secret-test.txt']) {
    const res = await fetch(base + p);
    assert.notEqual(res.status, 200, p);
  }
  fs.rmSync(path.join(uploadsDir, '..', 'secret-test.txt'), { force: true });
});

// ---------- products and categories ----------

test('products permission controls products and categories', async () => {
  const ana = await makeStaff(['stock']);
  assert.equal((await call('POST', '/api/admin/categories', { token: ana.token, body: { name_pt: 'X', name_en: 'X' } })).status, 403);
  assert.equal((await call('DELETE', '/api/admin/products/p1', { token: ana.token })).status, 403);

  const bia = await makeStaff(['products'], 'bia');
  const cat = await call('POST', '/api/admin/categories', { token: bia.token, body: { name_pt: 'Bebidas', name_en: 'Drinks' } });
  assert.equal(cat.status, 201);
  const renamed = await call('PUT', `/api/admin/categories/${cat.data.id}`, { token: bia.token, body: { name_pt: 'Sumos', name_en: 'Juices' } });
  assert.equal(renamed.data.name_pt, 'Sumos');
  assert.ok((await call('GET', '/api/categories')).data.some((c) => c.name_en === 'Juices'));
});

test('deleting a category keeps its products, which become uncategorised', async () => {
  const res = await call('DELETE', '/api/admin/categories/1', { token: owner }); // Detergentes
  assert.equal(res.status, 200);
  const p = (await call('GET', '/api/products/p1')).data;
  assert.equal(p.category_id, null);
  assert.equal((await call('DELETE', '/api/admin/categories/nope', { token: owner })).status, 404);
});

test('deleting a product removes it from the shop but keeps order history', async () => {
  const placed = await order([{ product_id: 'p3', quantity: 2 }]);
  assert.equal((await call('DELETE', '/api/admin/products/p3', { token: owner })).status, 200);
  assert.equal((await call('GET', '/api/products/p3')).status, 404);
  assert.equal((await call('GET', '/api/products')).data.length, 5);

  const orders = (await call('GET', '/api/admin/orders', { token: owner })).data;
  const mine = orders.find((o) => o.id === placed.data.id);
  assert.equal(mine.items[0].product_name, 'Lava Loiça Fairy 500ml');

  // Cancelling that order later must not crash even though the product is gone.
  const res = await call('PATCH', `/api/admin/orders/${placed.data.id}`, { token: owner, body: { status: 'cancelled' } });
  assert.equal(res.status, 200);
  assert.equal((await call('DELETE', '/api/admin/products/p3', { token: owner })).status, 404);
});

// ---------- starting clean and upgrading ----------

test('a new database can start empty, and stays empty after reopening', async () => {
  const file = path.join(os.tmpdir(), `kamba-empty-${Date.now()}.db`);
  const first = openDb(file, { demo: false });
  assert.equal(first.prepare('SELECT COUNT(*) AS c FROM products').get().c, 0);
  first.close();
  const second = openDb(file); // demo allowed, but already initialised
  assert.equal(second.prepare('SELECT COUNT(*) AS c FROM products').get().c, 0);
  second.close();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(file + s, { force: true });
});

test('an existing database from the earlier version is upgraded without losing data', async () => {
  const file = path.join(os.tmpdir(), `kamba-old-${Date.now()}.db`);
  const first = openDb(file);
  // Pretend this is the earlier version: no staff column on sessions, no marker, an order exists.
  first.exec("DELETE FROM settings; DROP TABLE sessions;");
  first.exec("CREATE TABLE sessions (token TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('admin','customer')), user_id TEXT REFERENCES users(id) ON DELETE CASCADE);");
  first.close();

  const upgraded = openDb(file);
  assert.equal(upgraded.prepare('SELECT COUNT(*) AS c FROM products').get().c, 6); // kept, not re-seeded twice
  const cols = upgraded.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  assert.ok(cols.includes('staff_id'));

  // And the server starts on it with a working owner login.
  const s = createApp({ db: upgraded, adminUser: 'boss', adminPassword: 'boss-pass', uploadsDir });
  await new Promise((resolve) => s.listen(0, resolve));
  const res = await fetch(`http://localhost:${s.address().port}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'boss', password: 'boss-pass' }),
  });
  assert.equal(res.status, 200);
  s.close();
  upgraded.close();
  for (const x of ['', '-wal', '-shm']) fs.rmSync(file + x, { force: true });
});
