import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';
import { seed } from '../src/seed.js';
import { buildSlip, slipToText, toEscPos, encode850, money, wrap, row, SLIP_WIDTH } from '../src/slip.js';

let server;
let base;
let db;
let owner;
let jobs; // what the fake printer received
let failNext; // make the fake printer fail

const fakePrinter = {
  async list() {
    return [{ name: 'XP-80C', driver: 'XP-80C', port: 'USB018', isDefault: false }];
  },
  async printRaw(name, bytes) {
    if (failNext) {
      const message = failNext;
      failNext = null;
      throw new Error(message);
    }
    jobs.push({ name, bytes });
  },
};

const call = async (method, urlPath, { body, token } = {}) => {
  const res = await fetch(base + urlPath, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  return { status: res.status, data: t ? JSON.parse(t) : null };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 60)); // let the background print finish

const placeOrder = (overrides = {}) =>
  call('POST', '/api/orders', {
    body: {
      customer_name: 'Maria da Conceição',
      customer_phone: '+244 923 000 000',
      payment_method: 'multicaixa',
      fulfillment_type: 'delivery',
      delivery_address: 'Bairro Kuito, Rua 5, casa 12, Soyo',
      notes: 'Ligar antes de entregar',
      items: [{ product_id: 'p1', quantity: 60 }],
      ...overrides,
    },
  });

const configurePrinter = (extra = {}) =>
  call('PUT', '/api/admin/printer', { token: owner, body: { printer_name: 'XP-80C', auto_print: true, ...extra } });

before(async () => {
  db = openDb(':memory:');
  const uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kamba-uploads-'));
  server = createApp({ db, adminUser: 'boss', adminPassword: 'boss-pass', uploadsDir, printer: fakePrinter });
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

beforeEach(async () => {
  jobs = [];
  failNext = null;
  db.exec('DELETE FROM order_items; DELETE FROM orders; DELETE FROM sessions; DELETE FROM users;');
  db.exec("DELETE FROM staff WHERE role != 'owner'; DELETE FROM settings;");
  db.exec('DELETE FROM stock; DELETE FROM products; DELETE FROM shops; DELETE FROM categories;');
  seed(db);
  const login = await call('POST', '/api/admin/login', { body: { username: 'boss', password: 'boss-pass' } });
  owner = login.data.token;
});

after(() => server.close());

const textOf = (bytes) => bytes.toString('latin1');

// ---------- the slip itself ----------

const sampleOrder = () => ({
  id: 'KO-ABC123',
  created_at: new Date(2026, 9, 13, 14, 5).toISOString(),
  customer_name: 'Maria da Conceição',
  customer_phone: '+244 923 000 000',
  fulfillment_type: 'delivery',
  delivery_address: 'Bairro Kuito, Rua 5, casa 12, Soyo',
  payment_method: 'transfer',
  notes: 'Ligar antes de entregar',
  total: 153_000,
  items: [
    { product_id: 'p1', product_name: 'Detergente Omo 1kg', quantity: 60, unit_price: 2500 },
    { product_id: 'p5', product_name: 'Arroz Agulha 25kg com um nome muito comprido para caber numa linha', quantity: 1, unit_price: 3000 },
  ],
});

test('slip has everything the office needs and fits an 80 mm roll', () => {
  const slip = buildSlip(sampleOrder(), {
    title: 'Kamba Online',
    skus: { p1: 'DET-001' },
    allocations: [
      { product_id: 'p1', shop_name: 'Loja Centro', quantity: 50 },
      { product_id: 'p1', shop_name: 'Loja Mercado', quantity: 10 },
    ],
  });
  const text = slipToText(slip);
  for (const needle of [
    'KAMBA ONLINE', 'NOVA ENCOMENDA', 'KO-ABC123', '13/10/2026 14:05', 'Maria da Conceição', '+244 923 000 000',
    'ENTREGA', 'Bairro Kuito, Rua 5, casa 12, Soyo', 'Transferência bancária', '60 x Detergente Omo 1kg', 'DET-001',
    '2 500 Kz', '150 000 Kz', 'TOTAL', '153 000 Kz', 'STOCK TIRADO DE', 'Loja Centro', '50 un', 'Loja Mercado', '10 un',
    'NOTAS', 'Ligar antes de entregar', 'sem valor fiscal',
  ]) {
    assert.ok(text.includes(needle), `slip is missing: ${needle}\n${text}`);
  }
  for (const line of text.split('\n')) assert.ok(line.length <= SLIP_WIDTH, `line too long (${line.length}): ${line}`);
});

test('pickup orders say pickup and have no address', () => {
  const order = { ...sampleOrder(), fulfillment_type: 'pickup', delivery_address: null };
  const text = slipToText(buildSlip(order));
  assert.ok(text.includes('LEVANTAMENTO'));
  assert.ok(!text.includes('ENTREGA'));
});

test('test slip is clearly marked as a test', () => {
  assert.ok(slipToText(buildSlip(sampleOrder(), { test: true })).includes('TESTE DE IMPRESSAO'));
});

test('money, wrap and row helpers', () => {
  assert.equal(money(2500), '2 500 Kz');
  assert.equal(money(1234567), '1 234 567 Kz');
  assert.equal(money(0), '0 Kz');
  assert.equal(money(1999.5), '1 999,50 Kz');
  assert.deepEqual(wrap('um dois três quatro', 9), ['um dois', 'três', 'quatro']);
  assert.deepEqual(wrap('abcdefghij', 4), ['abcd', 'efgh', 'ij']);
  assert.equal(row('A', 'B', 6), 'A    B');
  assert.equal(row('muito comprido mesmo', '99 Kz', 12).length <= 12, true);
});

test('Portuguese accents are encoded for the printer (code page 850)', () => {
  assert.deepEqual([...encode850('ação')], [0x61, 0xc7 === 0 ? 0 : 0x87, 0xc6, 0x6f]); // a ç ã o
  assert.deepEqual([...encode850('É é Ç ô õ')], [0x90, 0x20, 0x82, 0x20, 0x80, 0x20, 0x93, 0x20, 0xe4]);
  assert.deepEqual([...encode850('a—b×c')], [0x61, 0x2d, 0x62, 0x78, 0x63]); // dashes and × turn into plain characters
  assert.deepEqual([...encode850('😀')], [0x3f]); // anything unknown becomes ?
});

test('ESC/POS output starts with reset, chooses the code page and ends with a paper cut', () => {
  const bytes = toEscPos(buildSlip(sampleOrder()));
  assert.deepEqual([...bytes.subarray(0, 2)], [0x1b, 0x40]); // ESC @
  assert.deepEqual([...bytes.subarray(2, 5)], [0x1b, 0x74, 0x02]); // ESC t 2 (PC850)
  assert.deepEqual([...bytes.subarray(-4)], [0x1d, 0x56, 0x42, 0x00]); // GS V B 0 (cut)
  assert.ok(textOf(bytes).includes('KO-ABC123'));
  assert.equal(toEscPos(buildSlip(sampleOrder()), { cut: false }).subarray(-4).equals(Buffer.from([0x1d, 0x56, 0x42, 0x00])), false);
});

// ---------- automatic printing when a customer orders ----------

test('a new order prints its slip automatically once the printer is set up', async () => {
  assert.equal((await configurePrinter()).status, 200);
  const placed = await placeOrder();
  assert.equal(placed.status, 201);
  await settle();

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].name, 'XP-80C');
  const printed = textOf(jobs[0].bytes);
  assert.ok(printed.includes(placed.data.id));
  assert.ok(printed.includes('Detergente Omo 1kg'));
  assert.ok(/Loja Centro\s+50 un/.test(printed)); // which shops the stock came from
  assert.ok(/Loja Mercado\s+10 un/.test(printed));
  assert.ok(printed.includes('DET-001'));

  const orders = (await call('GET', '/api/admin/orders', { token: owner })).data;
  assert.ok(orders[0].printed_at, 'order is marked as printed');
});

test('nothing prints if auto-print is off or no printer is chosen', async () => {
  await placeOrder(); // nothing configured at all
  await settle();
  assert.equal(jobs.length, 0);

  await call('PUT', '/api/admin/printer', { token: owner, body: { printer_name: 'XP-80C', auto_print: false } });
  await placeOrder({ items: [{ product_id: 'p3', quantity: 1 }] });
  await settle();
  assert.equal(jobs.length, 0);

  await call('PUT', '/api/admin/printer', { token: owner, body: { printer_name: '', auto_print: true } });
  await placeOrder({ items: [{ product_id: 'p3', quantity: 1 }] });
  await settle();
  assert.equal(jobs.length, 0);
});

test('a printer failure never blocks the order; it stays "not printed" and can be reprinted', async () => {
  await configurePrinter();
  failNext = 'Cannot open printer (error 1801)';
  const placed = await placeOrder();
  assert.equal(placed.status, 201); // the customer still gets their order
  await settle();
  assert.equal(jobs.length, 0);

  const orders = (await call('GET', '/api/admin/orders', { token: owner })).data;
  assert.equal(orders[0].printed_at, null);
  const state = (await call('GET', '/api/admin/printer', { token: owner })).data;
  assert.equal(state.last_result.ok, false);
  assert.match(state.last_result.error, /Cannot open printer/);

  // Staff reprint once the printer is fixed.
  const again = await call('POST', `/api/admin/orders/${placed.data.id}/print`, { token: owner });
  assert.equal(again.status, 200);
  assert.equal(jobs.length, 1);
  assert.ok((await call('GET', '/api/admin/orders', { token: owner })).data[0].printed_at);
  assert.equal((await call('GET', '/api/admin/printer', { token: owner })).data.last_result.ok, true);
});

test('a rejected order (out of stock) prints nothing', async () => {
  await configurePrinter();
  const res = await placeOrder({ items: [{ product_id: 'p2', quantity: 1 }] }); // Ariel is out of stock
  assert.equal(res.status, 409);
  await settle();
  assert.equal(jobs.length, 0);
});

test('several orders at once each get their own complete slip, one after the other', async () => {
  await configurePrinter();
  const results = await Promise.all([
    placeOrder({ items: [{ product_id: 'p3', quantity: 1 }], customer_name: 'Cliente Um' }),
    placeOrder({ items: [{ product_id: 'p3', quantity: 2 }], customer_name: 'Cliente Dois' }),
    placeOrder({ items: [{ product_id: 'p3', quantity: 3 }], customer_name: 'Cliente Tres' }),
  ]);
  assert.ok(results.every((r) => r.status === 201));
  await settle();
  await settle();
  assert.equal(jobs.length, 3);
  const names = jobs.map((j) => ['Cliente Um', 'Cliente Dois', 'Cliente Tres'].filter((n) => textOf(j.bytes).includes(n)));
  assert.ok(names.every((n) => n.length === 1), 'each slip contains exactly one customer');
});

test('copies setting prints the slip more than once', async () => {
  await configurePrinter({ copies: 2 });
  await placeOrder({ items: [{ product_id: 'p3', quantity: 1 }] });
  await settle();
  assert.equal(jobs.length, 1);
  const cuts = [...jobs[0].bytes.toString('latin1').matchAll(/\x1dVB\x00/g)].length;
  assert.equal(cuts, 2);
});

test('the slip title is configurable', async () => {
  await configurePrinter({ slip_title: 'Bens Alimentar Lda' });
  await placeOrder({ items: [{ product_id: 'p3', quantity: 1 }] });
  await settle();
  assert.ok(textOf(jobs[0].bytes).includes('BENS ALIMENTAR LDA'));
});

// ---------- admin controls ----------

test('admin can see the printers and print a test slip', async () => {
  const noPrinter = await call('POST', '/api/admin/printer/test', { token: owner });
  assert.equal(noPrinter.status, 400);
  assert.equal(noPrinter.data.error, 'printer_not_set');

  await configurePrinter();
  const state = (await call('GET', '/api/admin/printer', { token: owner })).data;
  assert.equal(state.printer_name, 'XP-80C');
  assert.equal(state.auto_print, true);
  assert.equal(state.printers[0].name, 'XP-80C');

  const test1 = await call('POST', '/api/admin/printer/test', { token: owner });
  assert.equal(test1.status, 200);
  assert.ok(textOf(jobs[0].bytes).includes('TESTE DE IMPRESSAO'));
  assert.equal(db.prepare('SELECT COUNT(*) AS c FROM orders').get().c, 0); // a test creates no order
});

test('test slip reports printer errors clearly', async () => {
  await configurePrinter();
  failNext = 'Printer is offline';
  const res = await call('POST', '/api/admin/printer/test', { token: owner });
  assert.equal(res.status, 502);
  assert.equal(res.data.error, 'print_failed');
  assert.match(res.data.detail, /offline/);
});

test('printer settings are validated', async () => {
  const put = (body) => call('PUT', '/api/admin/printer', { token: owner, body });
  assert.equal((await put({ copies: 0 })).status, 400);
  assert.equal((await put({ copies: 4 })).status, 400);
  assert.equal((await put({ copies: 1.5 })).status, 400);
  assert.equal((await put({ auto_print: 'yes' })).status, 400);
  assert.equal((await put({ slip_title: 'x'.repeat(41) })).status, 400);
  assert.equal((await put({ copies: 3, auto_print: true, printer_name: 'XP-80C' })).status, 200);
});

test('only the right people can use the printer', async () => {
  const mk = async (permissions, username) => {
    await call('POST', '/api/admin/staff', {
      token: owner,
      body: { username, password: 'secret123', full_name: username, permissions },
    });
    return (await call('POST', '/api/admin/login', { body: { username, password: 'secret123' } })).data.token;
  };
  const ordersOnly = await mk(['orders'], 'ana');
  const settingsOnly = await mk(['settings'], 'bia');
  await configurePrinter();
  const placed = await placeOrder({ items: [{ product_id: 'p3', quantity: 1 }] });
  await settle();
  jobs.length = 0;

  // Reprinting needs the orders permission; setting up the printer needs settings.
  assert.equal((await call('POST', `/api/admin/orders/${placed.data.id}/print`, { token: ordersOnly })).status, 200);
  assert.equal((await call('POST', `/api/admin/orders/${placed.data.id}/print`, { token: settingsOnly })).status, 403);
  assert.equal((await call('POST', `/api/admin/orders/${placed.data.id}/print`)).status, 401);
  assert.equal((await call('GET', '/api/admin/printer', { token: ordersOnly })).status, 403);
  assert.equal((await call('PUT', '/api/admin/printer', { token: ordersOnly, body: { copies: 2 } })).status, 403);
  assert.equal((await call('POST', '/api/admin/printer/test', { token: ordersOnly })).status, 403);
  assert.equal((await call('GET', '/api/admin/printer', { token: settingsOnly })).status, 200);
  assert.equal((await call('POST', '/api/admin/printer/test', { token: settingsOnly })).status, 200);
});

test('reprinting an unknown order is a 404 and a customer cannot see print info', async () => {
  await configurePrinter();
  assert.equal((await call('POST', '/api/admin/orders/nope/print', { token: owner })).status, 404);

  const reg = await call('POST', '/api/auth/register', { body: { email: 'c@d.co', password: 'secret123', full_name: 'C' } });
  await call('POST', '/api/orders', {
    token: reg.data.token,
    body: { customer_name: 'C', customer_phone: '1', payment_method: 'cash', fulfillment_type: 'pickup', items: [{ product_id: 'p3', quantity: 1 }] },
  });
  await settle();
  const mine = await call('GET', '/api/orders/mine', { token: reg.data.token });
  assert.equal(mine.status, 200);
  assert.ok(!('printed_at' in (mine.data[0] ?? {})));
});

test('an older database gains the printed_at column without losing orders', () => {
  const file = path.join(os.tmpdir(), `kamba-prn-${Date.now()}.db`);
  const first = openDb(file);
  first.exec('ALTER TABLE orders DROP COLUMN printed_at');
  first.close();
  const upgraded = openDb(file);
  assert.ok(upgraded.prepare('PRAGMA table_info(orders)').all().some((c) => c.name === 'printed_at'));
  upgraded.close();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(file + s, { force: true });
});
