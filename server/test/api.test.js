import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

let server;
let base;
let db;
let adminToken;
let uploadsDir;

const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : null };
};

const validOrder = (overrides = {}) => ({
  customer_name: 'Maria Silva',
  customer_phone: '+244 923 000 000',
  payment_method: 'cash',
  fulfillment_type: 'pickup',
  items: [{ product_id: 'p1', quantity: 2 }],
  ...overrides,
});

const totalStock = (productId) =>
  db.prepare('SELECT COALESCE(SUM(quantity), 0) AS t FROM stock WHERE product_id = ?').get(productId).t;

before(async () => {
  // Fresh in-memory database for every test (see beforeEach), same server.
  db = openDb(':memory:');
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamba-uploads-'));
  server = createApp({ db, adminUser: 'admin', adminPassword: 'test-pass', uploadsDir });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

beforeEach(async () => {
  // Reset mutable data back to the seed between tests.
  db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM sessions; DELETE FROM users;');
  db.exec("DELETE FROM staff WHERE role != 'owner'; DELETE FROM settings;");
  db.exec('DELETE FROM stock; DELETE FROM products; DELETE FROM shops; DELETE FROM categories;');
  const { seed } = await import('../src/seed.js');
  seed(db);
  const login = await call('POST', '/api/admin/login', { body: { username: 'admin', password: 'test-pass' } });
  adminToken = login.data.token;
});

after(() => server.close());

// ---------- catalog & stock privacy ----------

test('public catalog lists active products in both languages', async () => {
  const { status, data } = await call('GET', '/api/products');
  assert.equal(status, 200);
  assert.equal(data.length, 6);
  const omo = data.find((p) => p.id === 'p1');
  assert.equal(omo.name_pt, 'Detergente Omo 1kg');
  assert.equal(omo.name_en, 'Omo Detergent 1kg');
});

test('customers never see stock quantities, only in_stock', async () => {
  const list = await call('GET', '/api/products');
  for (const p of list.data) {
    assert.equal(typeof p.in_stock, 'boolean');
    assert.ok(!('total_stock' in p), 'total_stock leaked');
    assert.ok(!('quantity' in p), 'quantity leaked');
  }
  const single = await call('GET', '/api/products/p1');
  assert.ok(!('total_stock' in single.data));
});

test('product with no stock is reported as out of stock', async () => {
  const { data } = await call('GET', '/api/products/p2');
  assert.equal(data.in_stock, false);
  const omo = await call('GET', '/api/products/p1');
  assert.equal(omo.data.in_stock, true);
});

test('hidden products are not visible to customers', async () => {
  await call('PUT', '/api/admin/products/p1', { token: adminToken, body: { is_active: false } });
  const list = await call('GET', '/api/products');
  assert.ok(!list.data.some((p) => p.id === 'p1'));
  assert.equal((await call('GET', '/api/products/p1')).status, 404);
});

test('category filter works', async () => {
  const { data } = await call('GET', '/api/products?category=3');
  assert.deepEqual(data.map((p) => p.id).sort(), ['p4', 'p5']);
});

test('six shop locations are listed', async () => {
  const { data } = await call('GET', '/api/shops');
  assert.equal(data.length, 6);
});

// ---------- orders ----------

test('placing an order reduces stock and charges database prices', async () => {
  const before = totalStock('p1'); // 80
  const { status, data } = await call('POST', '/api/orders', {
    body: validOrder({ items: [{ product_id: 'p1', quantity: 2, unit_price: 1 }] }), // tampered price ignored
  });
  assert.equal(status, 201);
  assert.equal(data.total, 5000); // 2 x 2500, not 2 x 1
  assert.match(data.id, /^KO-/);
  assert.equal(totalStock('p1'), before - 2);
});

test('an order can span several shops when no single shop has enough', async () => {
  // p1 has 50 in s1 and 30 in s2 -> ordering 70 must drain across both.
  const { status } = await call('POST', '/api/orders', { body: validOrder({ items: [{ product_id: 'p1', quantity: 70 }] }) });
  assert.equal(status, 201);
  assert.equal(totalStock('p1'), 10);
  const rows = db.prepare('SELECT quantity FROM stock WHERE product_id = ?').all('p1');
  assert.ok(rows.every((r) => r.quantity >= 0));
});

test('ordering an out-of-stock item is rejected without leaking quantities', async () => {
  const { status, data } = await call('POST', '/api/orders', { body: validOrder({ items: [{ product_id: 'p2', quantity: 1 }] }) });
  assert.equal(status, 409);
  assert.equal(data.error, 'out_of_stock');
  assert.equal(data.items[0].product_id, 'p2');
  assert.ok(!JSON.stringify(data).match(/quantity|available|stock":/), 'response leaks stock info');
});

test('a rejected order changes nothing (all-or-nothing)', async () => {
  const before = totalStock('p1');
  const { status } = await call('POST', '/api/orders', {
    body: validOrder({
      items: [
        { product_id: 'p1', quantity: 5 },
        { product_id: 'p2', quantity: 1 }, // out of stock -> whole order fails
      ],
    }),
  });
  assert.equal(status, 409);
  assert.equal(totalStock('p1'), before);
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c, 0);
});

test('duplicate lines are merged before checking stock', async () => {
  // p5 has 15 in total. 10 + 10 = 20 must fail even though each line alone would pass.
  const { status } = await call('POST', '/api/orders', {
    body: validOrder({ items: [{ product_id: 'p5', quantity: 10 }, { product_id: 'p5', quantity: 10 }] }),
  });
  assert.equal(status, 409);
  assert.equal(totalStock('p5'), 15);
});

test('cannot order more than exists, then stock hits zero', async () => {
  assert.equal((await call('POST', '/api/orders', { body: validOrder({ items: [{ product_id: 'p5', quantity: 15 }] }) })).status, 201);
  assert.equal(totalStock('p5'), 0);
  assert.equal((await call('GET', '/api/products/p5')).data.in_stock, false);
  assert.equal((await call('POST', '/api/orders', { body: validOrder({ items: [{ product_id: 'p5', quantity: 1 }] }) })).status, 409);
});

test('order validation', async () => {
  const bad = async (overrides) => (await call('POST', '/api/orders', { body: validOrder(overrides) })).status;
  assert.equal(await bad({ customer_name: '' }), 400);
  assert.equal(await bad({ customer_phone: undefined }), 400);
  assert.equal(await bad({ payment_method: 'bitcoin' }), 400);
  assert.equal(await bad({ fulfillment_type: 'teleport' }), 400);
  assert.equal(await bad({ fulfillment_type: 'delivery' }), 400); // delivery needs an address
  assert.equal(await bad({ items: [] }), 400);
  assert.equal(await bad({ items: [{ product_id: 'p1', quantity: 0 }] }), 400);
  assert.equal(await bad({ items: [{ product_id: 'p1', quantity: 1.5 }] }), 400);
  assert.equal(await bad({ items: [{ product_id: 'nope', quantity: 1 }] }), 400);
  assert.equal(await bad({ fulfillment_type: 'delivery', delivery_address: 'Rua 1, Soyo' }), 201);
});

// ---------- accounts ----------

test('customer can register, log in and see only their own orders', async () => {
  const reg = await call('POST', '/api/auth/register', {
    body: { email: 'Ana@Example.com', password: 'secret123', full_name: 'Ana', phone: '+244 900' },
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.email, 'ana@example.com');

  assert.equal((await call('POST', '/api/auth/register', { body: { email: 'ana@example.com', password: 'secret123', full_name: 'Ana' } })).status, 409);
  assert.equal((await call('POST', '/api/auth/login', { body: { email: 'ana@example.com', password: 'wrong-pass' } })).status, 401);

  const login = await call('POST', '/api/auth/login', { body: { email: 'ana@example.com', password: 'secret123' } });
  assert.equal(login.status, 200);
  const token = login.data.token;

  await call('POST', '/api/orders', { token, body: validOrder() }); // logged-in order
  await call('POST', '/api/orders', { body: validOrder() }); // guest order

  const mine = await call('GET', '/api/orders/mine', { token });
  assert.equal(mine.data.length, 1);
  assert.equal(mine.data[0].items[0].product_id, 'p1');
  assert.equal((await call('GET', '/api/orders/mine')).status, 401);
});

test('short passwords and bad emails are rejected', async () => {
  assert.equal((await call('POST', '/api/auth/register', { body: { email: 'a@b.co', password: '123', full_name: 'A' } })).status, 400);
  assert.equal((await call('POST', '/api/auth/register', { body: { email: 'not-an-email', password: '123456', full_name: 'A' } })).status, 400);
});

// ---------- admin ----------

test('admin routes require an admin login', async () => {
  for (const [method, path] of [
    ['GET', '/api/admin/summary'],
    ['GET', '/api/admin/products'],
    ['GET', '/api/admin/stock'],
    ['GET', '/api/admin/orders'],
    ['PUT', '/api/admin/stock'],
  ]) {
    assert.equal((await call(method, path)).status, 401, `${method} ${path} should need login`);
  }
  assert.equal((await call('POST', '/api/admin/login', { body: { username: 'admin', password: 'nope' } })).status, 401);

  // A customer token must not unlock admin.
  const reg = await call('POST', '/api/auth/register', { body: { email: 'c@d.co', password: 'secret123', full_name: 'C' } });
  assert.equal((await call('GET', '/api/admin/orders', { token: reg.data.token })).status, 401);
});

test('admin sees real stock numbers', async () => {
  const { data } = await call('GET', '/api/admin/products', { token: adminToken });
  const omo = data.find((p) => p.id === 'p1');
  assert.equal(omo.total_stock, 80);
  const stock = await call('GET', '/api/admin/stock', { token: adminToken });
  assert.equal(stock.data.filter((r) => r.product_id === 'p1').length, 6); // one row per shop
});

test('admin restocking makes an out-of-stock product orderable', async () => {
  assert.equal((await call('GET', '/api/products/p2')).data.in_stock, false);
  const put = await call('PUT', '/api/admin/stock', { token: adminToken, body: { product_id: 'p2', shop_id: 's3', quantity: 25 } });
  assert.equal(put.status, 200);
  assert.equal((await call('GET', '/api/products/p2')).data.in_stock, true);
  assert.equal((await call('POST', '/api/orders', { body: validOrder({ items: [{ product_id: 'p2', quantity: 3 }] }) })).status, 201);
  assert.equal(totalStock('p2'), 22);
});

test('stock updates are validated', async () => {
  const put = (body) => call('PUT', '/api/admin/stock', { token: adminToken, body });
  assert.equal((await put({ product_id: 'p1', shop_id: 's1', quantity: -5 })).status, 400);
  assert.equal((await put({ product_id: 'p1', shop_id: 's1', quantity: 2.5 })).status, 400);
  assert.equal((await put({ product_id: 'nope', shop_id: 's1', quantity: 1 })).status, 404);
  assert.equal((await put({ product_id: 'p1', shop_id: 'nope', quantity: 1 })).status, 404);
});

test('admin can add and edit products', async () => {
  const created = await call('POST', '/api/admin/products', {
    token: adminToken,
    body: { sku: 'OLE-001', name_pt: 'Óleo Vegetal 5L', name_en: 'Vegetable Oil 5L', price: 9500, category_id: '5' },
  });
  assert.equal(created.status, 201);
  const id = created.data.id;
  assert.equal(created.data.in_stock, false); // new products start with no stock

  assert.equal(
    (await call('POST', '/api/admin/products', { token: adminToken, body: { sku: 'OLE-001', name_pt: 'x', name_en: 'x', price: 1 } })).status,
    409
  );

  const edited = await call('PUT', '/api/admin/products/' + id, { token: adminToken, body: { price: 9900 } });
  assert.equal(edited.data.price, 9900);
  assert.equal((await call('PUT', '/api/admin/products/' + id, { token: adminToken, body: { price: -1 } })).status, 400);
  assert.equal((await call('PUT', '/api/admin/products/missing', { token: adminToken, body: { price: 1 } })).status, 404);
});

test('admin sees orders and can move them through statuses', async () => {
  const order = await call('POST', '/api/orders', { body: validOrder() });
  const list = await call('GET', '/api/admin/orders', { token: adminToken });
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].id, order.data.id);
  assert.equal(list.data[0].status, 'pending');
  assert.equal(list.data[0].items[0].quantity, 2);

  const summary = await call('GET', '/api/admin/summary', { token: adminToken });
  assert.equal(summary.data.pending_orders, 1);
  assert.equal(summary.data.sales_today, 5000);

  const patched = await call('PATCH', '/api/admin/orders/' + order.data.id, { token: adminToken, body: { status: 'confirmed' } });
  assert.equal(patched.data.status, 'confirmed');
  assert.equal((await call('PATCH', '/api/admin/orders/' + order.data.id, { token: adminToken, body: { status: 'lost' } })).status, 400);
  assert.equal((await call('PATCH', '/api/admin/orders/NOPE', { token: adminToken, body: { status: 'ready' } })).status, 404);
  assert.equal((await call('GET', '/api/admin/orders?status=pending', { token: adminToken })).data.length, 0);
});

// ---------- robustness ----------

test('unknown routes and bad JSON are handled cleanly', async () => {
  assert.equal((await call('GET', '/api/nope')).status, 404);
  assert.equal((await call('DELETE', '/api/products')).status, 405);
  const res = await fetch(base + '/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' });
  assert.equal(res.status, 400);
});
