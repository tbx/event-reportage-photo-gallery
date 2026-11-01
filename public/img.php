<?php
// Serves photos only with a valid cookie: img.php?f=small/001.jpg | thumb/001.jpg | full/001.jpg[&dl=1]
require __DIR__ . '/_auth.php';
if (!gallery_authed()) { http_response_code(403); exit('No access'); }

$f = $_GET['f'] ?? '';
if (!preg_match('~^(small|thumb|full)/\d{3}\.jpg$~', $f)) { http_response_code(400); exit; }
$path = __DIR__ . '/protected/photos/' . $f;
if (!is_file($path)) { http_response_code(404); exit; }

if (isset($_GET['dl'])) gallery_log('download', substr($f, 5, 3));   // views are reported by the gallery via hit.php (so preloading is not counted)

$etag = '"' . md5($f . filemtime($path) . filesize($path)) . '"';
header('ETag: ' . $etag);
header('Cache-Control: private, max-age=31536000, immutable');
if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) { http_response_code(304); exit; }

header('Content-Type: image/jpeg');
header('Content-Length: ' . filesize($path));
header('Content-Disposition: ' . (isset($_GET['dl']) ? 'attachment' : 'inline') . '; filename="' . cfg('downloadPrefix', 'Photo-') . basename($f) . '"');
readfile($path);
