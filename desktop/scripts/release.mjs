// Publishes the current version as a GitHub release. Installed apps then update themselves.
// Usage (from desktop/):  npm run release            -> builds and publishes the version in package.json
//   Bump the version first:  npm version patch --no-git-tag-version   (1.1.0 -> 1.1.1)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(desktop, '..');
const { version } = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));
const tag = `v${version}`;
const env = { ...process.env };
delete env.GH_TOKEN; // use the login saved by "gh auth login"

function run(cwd, cmd, { allowFail = false } = {}) {
  console.log(`\n> ${cmd}`);
  const r = spawnSync(cmd, { cwd, stdio: 'inherit', shell: true, env });
  if (r.status !== 0 && !allowFail) {
    console.error(`\nFailed: ${cmd}`);
    process.exit(r.status ?? 1);
  }
  return r.status === 0;
}

const exists = spawnSync(`gh release view ${tag}`, { cwd: root, shell: true, env, stdio: 'ignore' }).status === 0;
if (exists) {
  console.error(`Release ${tag} already exists. Bump the version first:  npm version patch --no-git-tag-version`);
  process.exit(1);
}

run(desktop, 'node scripts/build-all.mjs');
run(desktop, 'npx electron-builder --win nsis --publish never');

const rel = path.join(desktop, 'release');
const files = [`Kamba-Online-Setup-${version}.exe`, `Kamba-Online-Setup-${version}.exe.blockmap`, 'latest.yml'].map((f) =>
  path.join(rel, f)
);
for (const f of files) if (!fs.existsSync(f)) throw new Error(`Missing build file: ${f}`);

run(root, 'git add -A');
run(root, `git commit -m "Release ${version}"`, { allowFail: true });
run(root, 'git push');
// GitHub keeps the release as a draft while uploading, so apps only see it once everything is uploaded.
run(
  root,
  `gh release create ${tag} "${files[0]}" "${files[1]}" "${files[2]}" --title "Kamba Online ${version}" --notes "Kamba Online ${version}"`
);
console.log(`\nPublished ${tag}. Installed apps will update themselves.`);
