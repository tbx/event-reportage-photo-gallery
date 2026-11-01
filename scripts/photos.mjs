// Reads all JPEGs from the source folder (PHOTOS_SRC from .env, otherwise photos-src/ or demo-photos/), ideally the
// full-resolution originals, and renders three sizes into public/protected/photos/: small/ (600 px, phone tiles),
// thumb/ (1200 px), full/ (2500 px). Writes src/data/photos.json (number, dimensions, original file name).
// Order and selection: the number at the start of the file name. Colors are converted to sRGB; of the metadata only
// the sRGB profile is kept (EXIF/XMP/IPTC of the originals would cost about 50 KB per file).
//
//   npm run photos           incremental: only new/changed originals are rendered (by modification date); unchanged
//                            results are just renamed when the numbering shifts (deleted/inserted photos)
//   npm run photos -- --all  render everything again
//
// Everything that changed compared to the previous state (rendered or renumbered) is also copied to
// public/protected/photos-changed/ for a targeted upload. If the total count drops, the numbers above the new count
// have to be deleted on the server (printed at the end).
import sharp from 'sharp';
import { readdir, mkdir, writeFile, copyFile, rm, stat, rename, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
const SRC = process.env.PHOTOS_SRC || (existsSync('photos-src') ? 'photos-src' : 'demo-photos');
const OUT = 'public/protected/photos';
const TMP = 'public/protected/photos-tmp';
const CHANGED = 'public/protected/photos-changed';
const KINDS = ['small', 'thumb', 'full'];
const ALL = process.argv.includes('--all');
const out = (img) => img.withIccProfile('srgb');   // embed only the sRGB profile, no other metadata

const prevList = existsSync('src/data/photos.json') ? JSON.parse(await readFile('src/data/photos.json', 'utf8')) : [];
const prevBySrc = new Map(prevList.map(p => [p.src, p]));

console.log('Source: ' + SRC);
const files = (await readdir(SRC)).filter(f => /\.jpe?g$/i.test(f) && /^\d+\s*-/.test(f))   // numbered files only
  .sort((a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b));

// Phase 1: set the previous results aside (by old number) so renumbering does not overwrite anything
await rm(TMP, { recursive: true, force: true });
await rm(CHANGED, { recursive: true, force: true });
for (const k of KINDS) {
  await mkdir(path.join(OUT, k), { recursive: true });
  await mkdir(path.join(TMP, k), { recursive: true });
  await mkdir(path.join(CHANGED, k), { recursive: true });
  for (const f of await readdir(path.join(OUT, k))) if (f.endsWith('.jpg')) await rename(path.join(OUT, k, f), path.join(TMP, k, f));
}

// Phase 2: build the new numbering: keep, rename or render
const list = [], computed = [], renumbered = [];
let n = 0;
for (const f of files) {
  n++;
  const id = String(n).padStart(3, '0'), src = path.join(SRC, f);
  const old = prevBySrc.get(f);
  const oldFull = old ? path.join(TMP, 'full', old.id + '.jpg') : null;
  if (!ALL && old && existsSync(oldFull) && (await stat(oldFull)).mtimeMs >= (await stat(src)).mtimeMs) {
    for (const k of KINDS) await rename(path.join(TMP, k, old.id + '.jpg'), path.join(OUT, k, id + '.jpg'));
    list.push({ ...old, id });
    if (old.id !== id) { renumbered.push(id); for (const k of KINDS) await copyFile(path.join(OUT, k, id + '.jpg'), path.join(CHANGED, k, id + '.jpg')); }
    process.stdout.write(`\r${n}/${files.length}  ${id}  ${old.id === id ? 'unchanged' : 'renumbered from ' + old.id}      `);
    continue;
  }
  computed.push(id);
  const img = sharp(src).rotate().toColourspace('srgb');   // original -> sRGB; always through the pipeline (small originals too)
  const full = await out(img.clone().resize({ width: 2500, height: 2500, fit: 'inside', withoutEnlargement: true }))
    .jpeg({ quality: 82, mozjpeg: true }).toFile(path.join(OUT, 'full', id + '.jpg'));
  await out(img.clone().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }))
    .jpeg({ quality: 72, mozjpeg: true }).toFile(path.join(OUT, 'thumb', id + '.jpg'));
  await out(img.clone().resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true }))
    .jpeg({ quality: 70, mozjpeg: true }).toFile(path.join(OUT, 'small', id + '.jpg'));
  list.push({ id, w: full.width, h: full.height, src: f });
  for (const k of KINDS) await copyFile(path.join(OUT, k, id + '.jpg'), path.join(CHANGED, k, id + '.jpg'));
  process.stdout.write(`\r${n}/${files.length}  ${id}  rendered: ${f}      `);
}

// Phase 3: remove leftovers (deleted photos, stale results)
const leftovers = (await readdir(path.join(TMP, 'full'))).filter(f => f.endsWith('.jpg')).length;
await rm(TMP, { recursive: true, force: true });

// Version key for the image URLs (?v=…): browsers cache photos for a year, so when the photo behind a number changes
// (renumbering, re-editing) the URL has to change.
for (const p of list) p.v = createHash('md5').update(p.src + ':' + (await stat(path.join(OUT, 'full', p.id + '.jpg'))).size).digest('hex').slice(0, 8);
await mkdir('src/data', { recursive: true });
await writeFile('src/data/photos.json', JSON.stringify(list));
const removed = prevList.filter(p => !files.includes(p.src)).map(p => p.id + ' (' + p.src + ')');
console.log(`\nDone: ${list.length} photos -> src/data/photos.json (before: ${prevList.length})`);
console.log(`Rendered: ${computed.length}${computed.length ? ' (' + computed.join(', ') + ')' : ''}`);
console.log(`Renumbered: ${renumbered.length}${renumbered.length ? ' (' + renumbered[0] + ' to ' + renumbered[renumbered.length - 1] + ')' : ''}`);
console.log(`Removed: ${removed.length}${removed.length ? ' (old numbers ' + removed.join(', ') + ')' : ''}; discarded results: ${leftovers}`);
if (computed.length || renumbered.length) console.log(`To upload: ${CHANGED}/ (${computed.length + renumbered.length} photos per size)`);
if (list.length < prevList.length) console.log(`Delete on the server: numbers ${String(list.length + 1).padStart(3, '0')} to ${String(prevList.length).padStart(3, '0')} in small/, thumb/ and full/`);
