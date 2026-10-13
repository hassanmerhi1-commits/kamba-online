import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { start } from './start.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const pick = (envName, fallback) => {
  const dir = process.env[envName] ?? fallback;
  return dir && fs.existsSync(dir) ? dir : undefined;
};

const PORT = Number(process.env.PORT ?? 3001);

const { port } = await start({
  port: PORT,
  adminUser: process.env.ADMIN_USER ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'kamba2026',
  customerDir: pick('CUSTOMER_DIR', path.join(root, 'mobile', 'dist')),
  adminDir: pick('ADMIN_DIR', path.join(root, 'admin', 'dist')),
  uploadsDir: process.env.UPLOADS_DIR ?? path.join(root, 'server', 'uploads'),
});

console.log(`Kamba Online API running on http://localhost:${port}`);
if (!process.env.ADMIN_PASSWORD) {
  console.log('Admin login: admin / kamba2026  (set ADMIN_USER / ADMIN_PASSWORD to change)');
}
