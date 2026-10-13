import { DatabaseSync } from 'node:sqlite';
import { seed } from './seed.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id      TEXT PRIMARY KEY,
  name_pt TEXT NOT NULL,
  name_en TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id             TEXT PRIMARY KEY,
  sku            TEXT NOT NULL UNIQUE,
  name_pt        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  description_pt TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  price          REAL NOT NULL CHECK (price >= 0),
  category_id    TEXT REFERENCES categories(id) ON DELETE SET NULL,
  image_url      TEXT,
  unit           TEXT NOT NULL DEFAULT 'un',
  is_active      INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS shops (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  address   TEXT NOT NULL,
  phone     TEXT NOT NULL,
  latitude  REAL NOT NULL,
  longitude REAL NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- Stock per shop. Never sent to customers, admin only.
CREATE TABLE IF NOT EXISTS stock (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  shop_id    TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  PRIMARY KEY (product_id, shop_id)
);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT NOT NULL DEFAULT '',
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token   TEXT PRIMARY KEY,
  kind    TEXT NOT NULL CHECK (kind IN ('admin', 'customer')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  customer_name    TEXT NOT NULL,
  customer_phone   TEXT NOT NULL,
  total            REAL NOT NULL,
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('cash','transfer','multicaixa','other')),
  fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('delivery','pickup')),
  delivery_address TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','confirmed','preparing','ready','delivered','cancelled')),
  notes            TEXT,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id   TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity     INTEGER NOT NULL CHECK (quantity > 0),
  unit_price   REAL NOT NULL
);

-- Which shop each order's stock was taken from, so a cancelled order can put it back.
CREATE TABLE IF NOT EXISTS order_allocations (
  order_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  shop_id    TEXT NOT NULL,
  quantity   INTEGER NOT NULL CHECK (quantity > 0)
);

-- Business settings editable from the admin (WhatsApp number, office phone).
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- People who can log in to the admin. role 'owner' can do everything.
CREATE TABLE IF NOT EXISTS staff (
  id            TEXT PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner', 'staff')),
  permissions   TEXT NOT NULL DEFAULT '[]',
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);
`;

/**
 * Open (and create + upgrade) the database. Use ':memory:' in tests.
 * Sample data is added once, on a brand new database, unless `demo` is false.
 */
export function openDb(file = process.env.DB_FILE ?? 'kamba.db', { demo = true } = {}) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);

  // Upgrade older databases: admin sessions now belong to a staff member.
  const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((c) => c.name);
  if (!sessionCols.includes('staff_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN staff_id TEXT REFERENCES staff(id) ON DELETE CASCADE');
  }

  // Upgrade older databases: remember when an order's slip was printed.
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!orderCols.includes('printed_at')) db.exec('ALTER TABLE orders ADD COLUMN printed_at TEXT');

  // Seed once. The marker stops sample data coming back after you delete it on purpose.
  if (!db.prepare("SELECT 1 FROM settings WHERE key = 'initialised'").get()) {
    const { c } = db.prepare('SELECT COUNT(*) AS c FROM products').get();
    if (c === 0 && demo) seed(db);
    db.prepare("INSERT INTO settings (key, value) VALUES ('initialised', '1')").run();
  }
  return db;
}
