// Static demo for GitHub Pages: the built gallery page as index.html plus photos and assets, no PHP, no password.
//   PAGES_BASE=/<repo-name> npm run build && node scripts/pages.mjs   -> pages-dist/
// The deploy workflow (.github/workflows/pages.yml) does this on every push.
import { cpSync, mkdirSync, rmSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'pages-dist';
if (!process.env.PAGES_BASE) { console.error('PAGES_BASE is not set; run: PAGES_BASE=/<repo-name> npm run build'); process.exit(1); }
if (!existsSync('dist/galerie.html')) { console.error('dist/ is missing. Run `npm run build` first.'); process.exit(1); }
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
copyFileSync('dist/galerie.html', OUT + '/index.html');
for (const d of ['assets', 'fonts']) if (existsSync('dist/' + d)) cpSync('dist/' + d, OUT + '/' + d, { recursive: true });
cpSync('dist/protected/photos', OUT + '/photos', { recursive: true });
writeFileSync(OUT + '/.nojekyll', '');
console.log('pages-dist/ ready (' + process.env.PAGES_BASE + ')');
