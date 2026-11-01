<?php
// Shared auth and configuration for index.php, img.php, hit.php and stats.php.
// Texts, titles and the base path come from gallery.config.json (copied to _config.json at build time).
// Secrets live only here. Change GALLERY_PASSWORD, GALLERY_SECRET, STATS_PASSWORD and STATS_KEY before going live.

const GALLERY_PASSWORD = 'demo';                      // what guests type (case-insensitive); also works as ?pw=demo in a QR link
const GALLERY_SECRET   = 'CHANGE-ME-TO-A-RANDOM-STRING';   // signs the cookies, e.g. 40 random characters
const GALLERY_COOKIE   = 'gallery_auth';
const GALLERY_DAYS     = 365;                         // cookie lifetime

// Statistics page (stats.php): its own password, a key for the weekly report URL, mail addresses
const STATS_PASSWORD   = 'CHANGE-ME';
const STATS_KEY        = 'CHANGE-ME-TOO';            // stats.php?mail=1&key=... (called by GitHub Actions on Mondays)
const STATS_MAIL_TO    = 'you@example.com';
const STATS_MAIL_FROM  = 'gallery@example.com';
const GALLERY_LOG      = __DIR__ . '/protected/stats/log.csv';

$GALLERY_CFG = json_decode(@file_get_contents(__DIR__ . '/_config.json'), true) ?: [];
function cfg($key, $default = '') { global $GALLERY_CFG; return $GALLERY_CFG[$key] ?? $default; }
function txt($key, $default = '') { global $GALLERY_CFG; return $GALLERY_CFG['texts'][$key] ?? $default; }
function gallery_path() { return rtrim(cfg('basePath', ''), '/') . '/'; }

function gallery_token() { return hash_hmac('sha256', GALLERY_PASSWORD, GALLERY_SECRET); }
function gallery_check($pw) { return hash_equals(strtolower(GALLERY_PASSWORD), strtolower($pw)); }
function gallery_authed() { return isset($_COOKIE[GALLERY_COOKIE]) && hash_equals(gallery_token(), $_COOKIE[GALLERY_COOKIE]); }
function gallery_grant() {
  setcookie(GALLERY_COOKIE, gallery_token(), [
    'expires' => time() + GALLERY_DAYS * 86400, 'path' => gallery_path(),
    'secure' => !empty($_SERVER['HTTPS']), 'httponly' => true, 'samesite' => 'Lax',
  ]);
  $_COOKIE[GALLERY_COOKIE] = gallery_token();
}

// Brute-force throttle: after GALLERY_MAX_FAILS wrong passwords from one address, block it for GALLERY_LOCK_MINUTES minutes.
// State is a tiny file per address hash in protected/ratelimit/ (no database needed). Every wrong attempt costs half a second.
const GALLERY_MAX_FAILS    = 10;
const GALLERY_LOCK_MINUTES = 10;
function gallery_rate_file($scope) {
  $dir = __DIR__ . '/protected/ratelimit';
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  if (mt_rand(1, 20) === 1) foreach (glob($dir . '/*.json') ?: [] as $f) if (filemtime($f) < time() - 3600) @unlink($f);   // tidy up now and then
  return $dir . '/' . $scope . '-' . substr(hash('sha256', ($_SERVER['REMOTE_ADDR'] ?? '') . GALLERY_SECRET), 0, 24) . '.json';
}
function gallery_rate_blocked($scope = 'gallery') {   // minutes left in the block, 0 = free
  $s = json_decode(@file_get_contents(gallery_rate_file($scope)), true) ?: [];
  return !empty($s['until']) && $s['until'] > time() ? (int)ceil(($s['until'] - time()) / 60) : 0;
}
function gallery_rate_fail($scope = 'gallery') {
  $f = gallery_rate_file($scope);
  $s = json_decode(@file_get_contents($f), true) ?: [];
  if (empty($s['since']) || $s['since'] < time() - GALLERY_LOCK_MINUTES * 60) $s = ['n' => 0, 'since' => time()];   // old failures expire
  $s['n']++;
  if ($s['n'] >= GALLERY_MAX_FAILS) $s['until'] = time() + GALLERY_LOCK_MINUTES * 60;
  @file_put_contents($f, json_encode($s), LOCK_EX);
  usleep(500000);
}
function gallery_rate_clear($scope = 'gallery') { @unlink(gallery_rate_file($scope)); }

// Log one event: time;event;photo;visitor-hash. The hash changes daily and cannot be reversed; no IP is stored.
function gallery_log($event, $id = '') {
  $dir = dirname(GALLERY_LOG);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $v = substr(hash('sha256', date('Y-m-d') . ($_SERVER['REMOTE_ADDR'] ?? '') . ($_SERVER['HTTP_USER_AGENT'] ?? '') . GALLERY_SECRET), 0, 12);
  @file_put_contents(GALLERY_LOG, date('Y-m-d H:i:s') . ';' . $event . ';' . $id . ';' . $v . "\n", FILE_APPEND | LOCK_EX);
}
