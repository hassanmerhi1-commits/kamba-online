// Builds the customer app and the admin so the installer can bundle them.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function run(cwd, cmd) {
  console.log(`\n> ${cmd}   (${path.basename(cwd)})`);
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run(path.join(root, 'admin'), 'npm run build');
run(path.join(root, 'mobile'), 'npx expo export --platform web --output-dir dist');
