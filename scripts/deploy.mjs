// Uploads dist/ to the web space via SFTP (any shared host with PHP works).
//   node scripts/deploy.mjs --code      code: everything except protected/photos/   (GitHub Actions does this on every push)
//   node scripts/deploy.mjs --photos    photos: protected/photos/**, skips files that are already there (run once locally)
//   node scripts/deploy.mjs --all       code + photos
//   add --dry-run to only list the files without connecting
// Credentials via environment variables: SFTP_HOST, SFTP_USER, SFTP_PASSWORD, optional SFTP_PORT (22),
// SFTP_REMOTE_DIR (default: basePath from gallery.config.json without the leading slash).
// Locally from .env (template: .env.example), in GitHub Actions from Secrets/Variables.
import SftpClient from 'ssh2-sftp-client';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const doCode = args.has('--code') || args.has('--all');
const doPhotos = args.has('--photos') || args.has('--all');
if (!doCode && !doPhotos) { console.error('Please pass --code, --photos or --all (optionally --dry-run).'); process.exit(1); }

const env = (k, d = '') => process.env[k] || d;
const HOST = env('SFTP_HOST'), USER = env('SFTP_USER'), PASS = env('SFTP_PASSWORD');
const PORT = +env('SFTP_PORT', '22');
const CFG = JSON.parse(readFileSync('gallery.config.json', 'utf8'));
const REMOTE = env('SFTP_REMOTE_DIR', CFG.basePath.replace(/^\/+/, '') || '.').replace(/\/+$/, '');
const DIST = path.resolve('dist');

if (!existsSync(path.join(DIST, 'galerie.html'))) { console.error('dist/ is missing or incomplete. Run `npm run build` first.'); process.exit(1); }
if (!DRY && (!HOST || !USER || !PASS)) { console.error('SFTP_HOST, SFTP_USER and SFTP_PASSWORD are missing (.env or GitHub Secrets).'); process.exit(1); }

function walk(dir, rel = '') {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name === '.DS_Store') continue;
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...walk(path.join(dir, e.name), r)); else out.push(r);
  }
  return out;
}
const isPhoto = (f) => f.startsWith('protected/photos/');
// entries: { local, remote, photo }
const files = walk(DIST).filter(f => !f.startsWith('protected/photos-changed/') && (isPhoto(f) ? doPhotos : doCode))   // photos-changed/ is only for manual uploads
  .map(f => ({ local: path.join(DIST, f), remote: REMOTE + '/' + f, photo: isPhoto(f), label: f }));
const what = [doCode && 'code', doPhotos && 'photos'].filter(Boolean).join(' + ');
console.log(`${files.length} files (${what}) -> ${USER || '?'}@${HOST || '?'}:${REMOTE}/${DRY ? '   [dry-run, no connection]' : ''}`);
if (DRY) { for (const f of files) console.log('  ' + f.label + '  ->  ' + f.remote); process.exit(0); }

const sftp = new SftpClient();
try {
  await sftp.connect({ host: HOST, port: PORT, username: USER, password: PASS, readyTimeout: 30000 });

  // create target folders
  const dirs = [...new Set(files.map(f => path.posix.dirname(f.remote)).filter(d => d !== '.'))].sort();
  for (const d of dirs) if (!(await sftp.exists(d))) await sftp.mkdir(d, true);

  // photos: read sizes on the server to skip existing files (uploads are resumable)
  const remoteSize = new Map();
  if (doPhotos) for (const d of dirs.filter(d => d.startsWith(REMOTE + '/protected/photos/'))) {
    for (const e of await sftp.list(d)) remoteSize.set(d + '/' + e.name, e.size);
  }

  let up = 0, skip = 0;
  for (const f of files) {
    if (f.photo && remoteSize.get(f.remote) === statSync(f.local).size) { skip++; continue; }
    await sftp.fastPut(f.local, f.remote);
    up++;
    process.stdout.write(`\r${up + skip}/${files.length}  ${f.label}${' '.repeat(30)}`);
  }
  console.log(`\nDone: ${up} uploaded, ${skip} skipped (already there).`);
} finally {
  await sftp.end().catch(() => {});
}
