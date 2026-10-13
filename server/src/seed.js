// Demo data so the app is not empty on first run.
// Replace with real products from the admin panel.

const categories = [
  ['1', 'Detergentes', 'Detergents'],
  ['2', 'Lava Loiça', 'Dish Soap'],
  ['3', 'Arroz & Grãos', 'Rice & Grains'],
  ['4', 'Limpeza', 'Cleaning'],
  ['5', 'Óleos & Temperos', 'Oils & Seasonings'],
];

// id, sku, name_pt, name_en, description_pt, description_en, price, category_id, unit
const products = [
  ['p1', 'DET-001', 'Detergente Omo 1kg', 'Omo Detergent 1kg', 'Detergente em pó para roupa, embalagem 1kg.', 'Laundry powder detergent, 1kg pack.', 2500, '1', 'un'],
  ['p2', 'DET-002', 'Detergente Ariel 2kg', 'Ariel Detergent 2kg', 'Detergente concentrado, embalagem 2kg.', 'Concentrated detergent, 2kg pack.', 4500, '1', 'un'],
  ['p3', 'LL-001', 'Lava Loiça Fairy 500ml', 'Fairy Dish Soap 500ml', 'Lava loiça líquido, frasco 500ml.', 'Liquid dish soap, 500ml bottle.', 1800, '2', 'un'],
  ['p4', 'ARZ-001', 'Arroz Branco 5kg', 'White Rice 5kg', 'Arroz branco de qualidade, saco 5kg.', 'Quality white rice, 5kg bag.', 6500, '3', 'un'],
  ['p5', 'ARZ-002', 'Arroz Agulha 25kg', 'Long Grain Rice 25kg', 'Arroz agulha para distribuição, saco 25kg.', 'Long grain rice for distribution, 25kg bag.', 28000, '3', 'un'],
  ['p6', 'LIM-001', 'Lixívia 1L', 'Bleach 1L', 'Lixívia, garrafa 1 litro.', 'Household bleach, 1 liter bottle.', 900, '4', 'un'],
];

// id, name, address, phone, lat, lng
const shops = [
  ['s1', 'Loja Centro', 'Rua Principal, Centro, Soyo', '+244 900 111 001', -6.1349, 12.3689],
  ['s2', 'Loja Mercado', 'Mercado Municipal, Soyo', '+244 900 111 002', -6.1365, 12.3712],
  ['s3', 'Loja Bairro Norte', 'Bairro Norte, Soyo', '+244 900 111 003', -6.128, 12.365],
  ['s4', 'Loja Bairro Sul', 'Bairro Sul, Soyo', '+244 900 111 004', -6.142, 12.374],
  ['s5', 'Loja Porto', 'Zona Portuária, Soyo', '+244 900 111 005', -6.131, 12.378],
  ['s6', 'Escritório Central', 'Escritório Central — Encomendas, Soyo', '+244 900 111 000', -6.1355, 12.3695],
];

// product_id, shop_id, quantity  (p2 is intentionally out of stock everywhere)
const stock = [
  ['p1', 's1', 50],
  ['p1', 's2', 30],
  ['p2', 's1', 0],
  ['p3', 's1', 100],
  ['p4', 's3', 40],
  ['p5', 's6', 15],
  ['p6', 's2', 200],
];

export function seed(db) {
  db.exec('BEGIN');
  try {
    const cat = db.prepare('INSERT INTO categories (id, name_pt, name_en) VALUES (?, ?, ?)');
    categories.forEach((c) => cat.run(...c));

    const prod = db.prepare(
      `INSERT INTO products (id, sku, name_pt, name_en, description_pt, description_en, price, category_id, unit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    products.forEach((p) => prod.run(...p));

    const shop = db.prepare(
      'INSERT INTO shops (id, name, address, phone, latitude, longitude) VALUES (?, ?, ?, ?, ?, ?)'
    );
    shops.forEach((s) => shop.run(...s));

    const st = db.prepare('INSERT INTO stock (product_id, shop_id, quantity) VALUES (?, ?, ?)');
    stock.forEach((s) => st.run(...s));

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
