<?php
// Counts one full-screen photo view: hit.php?f=NNN (only with a valid gallery cookie)
require __DIR__ . '/_auth.php';
http_response_code(204);
if (!gallery_authed()) exit;
$f = $_GET['f'] ?? '';
if (preg_match('~^\d{3}$~', $f)) gallery_log('view', $f);
