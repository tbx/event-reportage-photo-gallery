// Local test server without PHP: emulates index.php / img.php / .htaccess from dist/.
// Start: npm run serve  ->  http://localhost:8080<basePath>/   (QR variant: ?pw=PASSWORD)
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, createReadStream } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';

const PORT = +(process.env.PORT || 8080);
const DIST = path.resolve('dist');
const CFG = JSON.parse(readFileSync(path.join(DIST, '_config.json'), 'utf8'));
const BASE = CFG.basePath.replace(/\/+$/, '');
const PREFIX = CFG.downloadPrefix || '';
const auth = readFileSync(path.join(DIST, '_auth.php'), 'utf8');
const PASSWORD = /GALLERY_PASSWORD\s*=\s*'([^']*)'/.exec(auth)[1];
const SECRET = /GALLERY_SECRET\s*=\s*'([^']*)'/.exec(auth)[1];
const COOKIE = /GALLERY_COOKIE\s*=\s*'([^']*)'/.exec(auth)[1];
const TOKEN = createHmac('sha256', SECRET).update(PASSWORD).digest('hex');

// HTML part of index.php (after the PHP block); <?= ?> expressions are resolved from the config, the error block by flag.
const gateHtml = readFileSync(path.join(DIST, 'index.php'), 'utf8').split('?>').slice(1).join('?>');
const phpExpr = (expr) => { const m = /^(cfg|txt)\('([^']+)'(?:,\s*(?:cfg\('([^']+)'\)|'([^']*)'))?\)$/.exec(expr.replace(/^\$e\((.*)\)$/, '$1').trim()); if (!m) return ''; const v = m[1] === 'txt' ? CFG.texts?.[m[2]] : CFG[m[2]]; return v ?? (m[3] ? CFG[m[3]] : m[4]) ?? ''; };
const gate = (error) => gateHtml.replace(/<\?php if \(!empty\(\$error\)\): \?>([\s\S]*?)<\?php endif; \?>/, error ? '$1' : '').replace(/<\?=\s*([\s\S]*?)\s*\?>/g, (_, e) => phpExpr(e));

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.php': 'text/html; charset=utf-8' };
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(c => c[0]));
const authed = (req) => cookies(req)[COOKIE] === TOKEN;
const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(body); };
const readBody = (req) => new Promise(r => { let b = ''; req.on('data', c => b += c); req.on('end', () => r(b)); });

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === BASE) return send(res, 301, '', { Location: BASE + '/' + url.search });
  if (!p.startsWith(BASE + '/')) return send(res, 404, 'Not found');
  p = p.slice(BASE.length + 1);

  // index.php: password gate
  if (p === '' || p === 'index.php') {
    let pw = url.searchParams.get('pw');
    if (req.method === 'POST') pw = new URLSearchParams(await readBody(req)).get('pw');
    if (pw !== null) {
      if (pw.trim().toLowerCase() === PASSWORD.toLowerCase()) {
        return send(res, 302, '', { 'Set-Cookie': `${COOKIE}=${TOKEN}; Path=${BASE}/; Max-Age=31536000; HttpOnly; SameSite=Lax`, Location: BASE + '/' });
      }
      return send(res, 200, gate(true));
    }
    if (authed(req)) return send(res, 200, readFileSync(path.join(DIST, 'galerie.html')), { 'Cache-Control': 'private, no-store' });
    return send(res, 200, gate(false));
  }

  // Pretty photo URLs as in .htaccess: foto/full/<prefix>050.jpg -> img.php?f=full/050.jpg
  const pretty = /^foto\/(small|thumb|full)\/[^/]*?(\d{3})\.jpg$/.exec(p);
  if (pretty) { p = 'img.php'; url.searchParams.set('f', `${pretty[1]}/${pretty[2]}.jpg`); }

  // img.php: photos only with cookie
  if (p === 'img.php') {
    if (!authed(req)) return send(res, 403, 'No access');
    const f = url.searchParams.get('f') || '';
    if (!/^(small|thumb|full)\/\d{3}\.jpg$/.test(f)) return send(res, 400, 'Bad request');
    const file = path.join(DIST, 'protected/photos', f);
    if (!existsSync(file)) return send(res, 404, 'Not found');
    const h = { 'Content-Type': 'image/jpeg', 'Content-Length': statSync(file).size, 'Cache-Control': 'private, max-age=31536000, immutable' };
    h['Content-Disposition'] = `${url.searchParams.has('dl') ? 'attachment' : 'inline'}; filename="${PREFIX}${path.basename(f)}"`;
    res.writeHead(200, h); return createReadStream(file).pipe(res);
  }

  // Statistics endpoints: hit.php just acknowledges, stats.php needs real PHP
  if (p === 'hit.php') { res.writeHead(204); return res.end(); }
  if (p === 'stats.php') return send(res, 501, 'stats.php only runs on a PHP server.');

  // .htaccess rules
  if (p.startsWith('protected/') || p === 'galerie.html' || p === '_auth.php' || p === '_config.json') return send(res, 403, 'Forbidden');

  // Static files (fonts/, assets/)
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) return send(res, 404, 'Not found');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Content-Length': statSync(file).size });
  createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Test server: http://localhost:${PORT}${BASE}/   (password: ${PASSWORD})`));
