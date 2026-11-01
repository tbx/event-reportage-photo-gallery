// Build the originals download package (once, locally):
//   npm run originals            (source: PHOTOS_SRC from .env, like npm run photos)
// Result: originals/<downloadPrefix>Originals/<downloadPrefix>NNN.jpg
//   - numbering as in the gallery (src/data/photos.json)
//   - uniform Adobe RGB (1998) color profile: sRGB files are converted (quality 97, 4:4:4), Adobe RGB files copied 1:1
//   - metadata rewritten losslessly with exiftool (devDependency exiftool-vendored): GPS removed, copyright/creator set to photographer from gallery.config.json
//   - needs macOS for the Adobe RGB profile path and `sips`; adjust ADOBE_RGB and profileOf() on other systems
// Then: cd originals && zip -r -X -0 <downloadPrefix>Originals.zip <downloadPrefix>Originals
import sharp from 'sharp';
import { readFile, mkdir, copyFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
const CFG = JSON.parse(await readFile('gallery.config.json', 'utf8'));
const SRC = process.env.PHOTOS_SRC || (existsSync('demo-photos') ? 'demo-photos' : '');
if (!SRC) { console.error('PHOTOS_SRC missing (.env)'); process.exit(1); }
const PREFIX = CFG.downloadPrefix || 'Photo-';
const OUT = path.resolve('originals/' + PREFIX + 'Originals');
const ADOBE_RGB = '/System/Library/ColorSync/Profiles/AdobeRGB1998.icc';
const COPYRIGHT = CFG.photographer || '';


const photos = JSON.parse(await readFile('src/data/photos.json', 'utf8'));   // numbering of the gallery
await mkdir(OUT, { recursive: true });
const profileOf = (f) => execFileSync('sips', ['-g', 'profile', f]).toString().split('profile:').pop().trim();

let converted = 0, copied = 0, n = 0;
for (const p of photos) {
  n++;
  const src = path.join(SRC, p.src), dst = path.join(OUT, PREFIX + p.id + '.jpg');
  if (!existsSync(src)) { console.error('\nMISSING: ' + p.src); process.exit(1); }
  if (existsSync(dst) && (await stat(dst)).mtimeMs >= (await stat(src)).mtimeMs) { process.stdout.write(`\r${n}/${photos.length}  ${p.id} (exists)      `); continue; }
  const prof = profileOf(src);
  if (/Adobe RGB/i.test(prof)) { await copyFile(src, dst); copied++; }
  else {                                                   // sRGB (or other) -> Adobe RGB, keep metadata
    await sharp(src).withMetadata().withIccProfile(ADOBE_RGB).jpeg({ quality: 97, chromaSubsampling: '4:4:4', mozjpeg: true }).toFile(dst);
    converted++;
  }
  process.stdout.write(`\r${n}/${photos.length}  ${p.id}  ${prof.slice(0, 20)}      `);
}
console.log(`\nFiles: ${photos.length}  copied: ${copied}  converted to Adobe RGB: ${converted}`);

// Metadata: GPS out, copyright in (lossless, exiftool only rewrites the metadata block)
const { exiftool } = createRequire(import.meta.url)('exiftool-vendored');   // devDependency of the project
console.log('exiftool ' + await exiftool.version() + ': removing GPS, setting copyright …');
let done = 0;
for (const p of photos) {
  const f = path.join(OUT, PREFIX + p.id + '.jpg');
  await exiftool.write(f, { Artist: COPYRIGHT, Copyright: '© ' + COPYRIGHT, 'XMP-dc:Creator': COPYRIGHT, 'XMP-dc:Rights': '© ' + COPYRIGHT },
    { writeArgs: ['-overwrite_original', '-gps:all=', '-XMP-exif:all='] });
  process.stdout.write(`\r${++done}/${photos.length}      `);
}
// Check
const check = await exiftool.read(path.join(OUT, PREFIX + photos[0].id + '.jpg'));
console.log(`\nCheck ${photos[0].id}: GPS=${check.GPSLatitude ?? 'none'}  Artist=${check.Artist}  Copyright=${check.Copyright}  Profile=${check.ProfileDescription}`);
let gps = 0;
for (const p of photos) { const t = await exiftool.read(path.join(OUT, PREFIX + p.id + '.jpg'), ['-GPSLatitude', '-GPSPosition']); if (t.GPSLatitude !== undefined || t.GPSPosition !== undefined) gps++; }
console.log(`Files with GPS after cleanup: ${gps}`);
await exiftool.end();
console.log('Done: ' + OUT);
