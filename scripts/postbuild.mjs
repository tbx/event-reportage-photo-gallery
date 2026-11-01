// Cleans dist/ (.DS_Store), copies gallery.config.json to dist/_config.json for the PHP side and checks that everything is there.
import { readdirSync, readFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const DIST = 'dist';
function clean(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) clean(p);
    else if (e.name === '.DS_Store' || e.name === '.gitkeep') rmSync(p);
  }
}
clean(DIST);
copyFileSync('gallery.config.json', path.join(DIST, '_config.json'));

const required = ['.htaccess', 'index.php', '_auth.php', 'img.php', 'galerie.html',
  'fonts/Jost.woff2', 'fonts/GreatVibes.woff2', 'protected/.htaccess', '_config.json'];
const missing = required.filter(f => !existsSync(path.join(DIST, f)));
if (missing.length) { console.error('Missing in dist/: ' + missing.join(', ')); process.exit(1); }
if (readFileSync(path.join(DIST, '_auth.php'), 'utf8').includes('CHANGE-ME')) console.warn('WARNING: public/_auth.php still contains placeholder secrets (CHANGE-ME). Set your own before going live.');

// Photos are not in the repo: present locally (npm run photos), absent in GitHub Actions.
const count = (d) => existsSync(path.join(DIST, d)) ? readdirSync(path.join(DIST, d)).filter(f => f.endsWith('.jpg')).length : 0;
const n = count('protected/photos/full'), m = count('protected/photos/thumb');
if (n !== m) { console.error(`full (${n}) and thumb (${m}) do not match`); process.exit(1); }
console.log(n ? `dist/ ready: ${n} photos + code` : 'dist/ ready: code only (no photos in this build; they are already on the server or go up with `npm run deploy:photos`)');
