<?php
// Password gate. Guests open <basePath>/ and type the password, or follow a QR link <basePath>/?pw=PASSWORD.
require __DIR__ . '/_auth.php';

if (isset($_GET['pw']) || isset($_POST['pw'])) {
  $pw = trim($_GET['pw'] ?? $_POST['pw'] ?? '');
  if (gallery_check($pw)) {
    gallery_grant();
    header('Location: ' . strtok($_SERVER['REQUEST_URI'], '?'));   // drop ?pw= from the URL
    exit;
  }
  $error = true;
}

if (gallery_authed()) {
  gallery_log('open');
  header('Cache-Control: private, no-store');
  readfile(__DIR__ . '/galerie.html');
  exit;
}
$e = fn($s) => htmlspecialchars($s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="<?= $e(cfg('lang', 'en')) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= $e(cfg('pageTitle', cfg('title'))) ?></title>
<style>
  @font-face{font-family:'Jost';src:url('fonts/Jost.woff2') format('woff2'),url('fonts/Jost.ttf') format('truetype');font-weight:100 900}
  @font-face{font-family:'Script';src:url('fonts/GreatVibes.woff2') format('woff2'),url('fonts/GreatVibes.ttf') format('truetype')}
  html,body{margin:0;min-height:100vh;background:#fff;color:#1a1a1a;font-family:'Jost','Futura','Century Gothic',sans-serif;font-weight:300}
  body{display:grid;place-items:center;padding:24px;box-sizing:border-box}
  form{width:100%;max-width:360px;display:flex;flex-direction:column;align-items:center;gap:28px;text-align:center}
  h1{margin:0;font-family:'Script',cursive;font-weight:400;font-size:64px;line-height:1.1}
  .f{width:100%;display:flex;flex-direction:column;gap:12px}
  input{width:100%;box-sizing:border-box;height:52px;border:1px solid #1a1a1a;border-radius:0;padding:0 16px;font-size:18px;font-family:inherit;text-align:center;letter-spacing:.12em;outline:none}
  button{height:52px;border:1px solid #1a1a1a;background:#1a1a1a;color:#fff;font-size:15px;font-family:inherit;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}
  button:hover{background:#333}
  .e{font-size:15px;color:#9a2b2b}
  .h{font-size:14px;color:#8a8a8a;letter-spacing:.04em}
</style>
</head>
<body>
<form method="post">
  <h1><?= $e(cfg('title')) ?></h1>
  <div class="f">
    <input type="password" name="pw" placeholder="<?= $e(txt('password', 'Password')) ?>" autofocus autocomplete="off">
    <button type="submit"><?= $e(txt('open', 'Open gallery')) ?></button>
    <?php if (!empty($error)): ?><div class="e"><?= $e(txt('wrongPassword', 'Wrong password.')) ?></div><?php endif; ?>
  </div>
  <div class="h"><?= $e(txt('passwordHint', '')) ?></div>
</form>
</body>
</html>
