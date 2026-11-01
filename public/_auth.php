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

// Log one event: time;event;photo;visitor-hash. The hash changes daily and cannot be reversed; no IP is stored.
function gallery_log($event, $id = '') {
  $dir = dirname(GALLERY_LOG);
  if (!is_dir($dir)) @mkdir($dir, 0755, true);
  $v = substr(hash('sha256', date('Y-m-d') . ($_SERVER['REMOTE_ADDR'] ?? '') . ($_SERVER['HTTP_USER_AGENT'] ?? '') . GALLERY_SECRET), 0, 12);
  @file_put_contents(GALLERY_LOG, date('Y-m-d H:i:s') . ';' . $event . ';' . $id . ';' . $v . "\n", FILE_APPEND | LOCK_EX);
}
