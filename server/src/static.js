import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

/**
 * Serves two single-page apps: the customer app at "/" and the admin at "/admin".
 * Returns true when it handled the request.
 */
export function createStaticHandler({ customerDir, adminDir, uploadsDir }) {
  function resolve(root, rel) {
    const clean = path.normalize(decodeURIComponent(rel)).replace(/^([/\\])+/, '');
    const full = path.join(root, clean);
    if (!full.startsWith(root)) return null; // path traversal guard
    const candidates = [full, `${full}.html`, path.join(full, 'index.html')];
    for (const c of candidates) if (isFile(c)) return c;
    // Anything that is not a real asset falls back to the app shell (client-side routing).
    if (!path.extname(clean)) return path.join(root, 'index.html');
    return null;
  }

  return function handle(req, res, pathname) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    // Product photos uploaded from the admin. File names are random, so they can be cached for a long time.
    if (uploadsDir && pathname.startsWith('/uploads/')) {
      const name = path.basename(decodeURIComponent(pathname));
      const file = path.join(uploadsDir, name);
      if (!/^[\w.-]+$/.test(name) || !isFile(file)) return false;
      res.writeHead(200, {
        'Content-Type': TYPES[path.extname(name).toLowerCase()] ?? 'application/octet-stream',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      });
      if (req.method === 'HEAD') res.end();
      else fs.createReadStream(file).pipe(res);
      return true;
    }

    let root = customerDir;
    let rel = pathname;
    if (pathname === '/admin' || pathname.startsWith('/admin/')) {
      root = adminDir;
      rel = pathname.slice('/admin'.length) || '/';
    }
    if (!root || !fs.existsSync(root)) return false;

    let file;
    try {
      file = resolve(path.resolve(root), rel);
    } catch {
      return false;
    }
    if (!file || !isFile(file)) return false;

    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream' };
    if (ext === '.html') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    if (req.method === 'HEAD') res.end();
    else fs.createReadStream(file).pipe(res);
    return true;
  };
}
