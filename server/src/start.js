import { openDb } from './db.js';
import { createApp } from './app.js';

/**
 * Open the database and start listening. Used by the command line and by the desktop app.
 * `demo: false` starts a brand new database empty (no sample products or shops).
 * @returns {Promise<{ server: import('node:http').Server, port: number, db: import('node:sqlite').DatabaseSync }>}
 */
export function start({
  port = 3001,
  dbFile,
  demo = true,
  adminUser,
  adminPassword,
  customerDir,
  adminDir,
  uploadsDir,
} = {}) {
  const db = openDb(dbFile, { demo });
  const server = createApp({ db, adminUser, adminPassword, customerDir, adminDir, uploadsDir });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port, db }));
  });
}
