<?php
// Statistics page: <basePath>/stats.php (own password STATS_PASSWORD in _auth.php)
// Weekly report by mail: stats.php?mail=1&key=STATS_KEY (called by GitHub Actions on Mondays).
// Data: protected/stats/log.csv (time;event;photo;visitor-hash). No IPs, no cookies for guests.
require __DIR__ . '/_auth.php';

function stats_token() { return hash_hmac('sha256', 'stats:' . STATS_PASSWORD, GALLERY_SECRET); }
function stats_authed() { return isset($_COOKIE['gallery_stats']) && hash_equals(stats_token(), $_COOKIE['gallery_stats']); }

function stats_load() {
  $rows = [];
  if (is_file(GALLERY_LOG)) foreach (file(GALLERY_LOG, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $l) {
    $p = explode(';', $l);
    if (count($p) >= 4) $rows[] = ['t' => $p[0], 'e' => $p[1], 'id' => $p[2], 'v' => $p[3]];
  }
  return $rows;
}

// Aggregate from date $from (Y-m-d, inclusive) or everything
function stats_agg($rows, $from = null) {
  $a = ['visitors' => [], 'open' => 0, 'view' => 0, 'download' => 0, 'days' => [], 'photos' => []];
  foreach ($rows as $r) {
    $d = substr($r['t'], 0, 10);
    if ($from !== null && $d < $from) continue;
    $e = $r['e'];
    if (!in_array($e, ['open', 'view', 'download'], true)) continue;
    $a['visitors'][$r['v']] = 1;
    $a[$e]++;
    if (!isset($a['days'][$d])) $a['days'][$d] = ['visitors' => [], 'open' => 0, 'view' => 0, 'download' => 0];
    $a['days'][$d]['visitors'][$r['v']] = 1;
    $a['days'][$d][$e]++;
    if ($r['id'] !== '' && $e !== 'open') {
      if (!isset($a['photos'][$r['id']])) $a['photos'][$r['id']] = ['view' => 0, 'download' => 0];
      $a['photos'][$r['id']][$e]++;
    }
  }
  $a['visitors'] = count($a['visitors']);
  foreach ($a['days'] as $d => $day) $a['days'][$d]['visitors'] = count($day['visitors']);
  krsort($a['days']);
  return $a;
}
function stats_top($photos, $key, $n = 10) {
  uasort($photos, fn($x, $y) => $y[$key] <=> $x[$key] ?: $y['view'] + $y['download'] <=> $x['view'] + $x['download']);
  return array_slice(array_filter($photos, fn($p) => $p[$key] > 0), 0, $n, true);
}
function nf($n) { return number_format($n); }
function dlabel($d) { return date('D j M', strtotime($d)); }

function stats_mail_text($rows) {
  $from = date('Y-m-d', strtotime('-6 days'));
  $w = stats_agg($rows, $from); $all = stats_agg($rows);
  $line = fn($a) => nf($a['visitors']) . ' visitors · ' . nf($a['open']) . ' opens · ' . nf($a['view']) . ' photo views · ' . nf($a['download']) . ' downloads';
  $t  = cfg('reportName', 'Photo Gallery') . ": weekly report " . date('j M', strtotime($from)) . " to " . date('j M Y') . "\n\n";
  $t .= "Last 7 days:  " . $line($w) . "\n";
  $t .= "Total:        " . $line($all) . "\n\n";
  $t .= "Per day:\n";
  for ($i = 6; $i >= 0; $i--) {
    $d = date('Y-m-d', strtotime("-$i days")); $x = $w['days'][$d] ?? ['visitors' => 0, 'open' => 0, 'view' => 0, 'download' => 0];
    $t .= sprintf("  %s  %3s visitors · %4s views · %3s downloads\n", dlabel($d), nf($x['visitors']), nf($x['view']), nf($x['download']));
  }
  $top = stats_top($w['photos'], 'view'); $dl = stats_top($w['photos'], 'download');
  $t .= "\nMost viewed photos (7 days): " . ($top ? implode(', ', array_map(fn($id, $p) => "$id (" . $p['view'] . ")", array_keys($top), $top)) : 'none') . "\n";
  $t .= "Most downloaded (7 days): " . ($dl ? implode(', ', array_map(fn($id, $p) => "$id (" . $p['download'] . ")", array_keys($dl), $dl)) : 'none') . "\n";
  $t .= "\nDetails: " . rtrim(cfg('siteUrl', ''), '/') . gallery_path() . "stats.php\n";
  return $t;
}
// HTML mail in the style of the gallery: key figures, daily overview, photo of the week and most downloaded photo (embedded,
// because the gallery images are behind the password). Plain text version as alternative.
function stats_mail_html($rows, &$images) {
  $from = date('Y-m-d', strtotime('-6 days'));
  $w = stats_agg($rows, $from); $all = stats_agg($rows);
  $e = fn($x) => htmlspecialchars((string)$x, ENT_QUOTES, 'UTF-8');
  $font = "font-family:'Helvetica Neue',Helvetica,Arial,sans-serif";
  $label = "font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8a8a8a";
  $images = [];
  $photoBlock = function ($title, $top, $key, $unit) use (&$images, $e, $font, $label) {
    if (!$top) return '';
    $id = array_key_first($top); $n = $top[$id][$key];
    $file = __DIR__ . '/protected/photos/small/' . $id . '.jpg';
    $img = '';
    if (is_file($file)) { $cid = 'photo-' . $id . '-' . $key . '@' . (parse_url(cfg('siteUrl', 'https://example.com'), PHP_URL_HOST) ?: 'example.com'); $images[$cid] = $file; $img = '<img src="cid:' . $cid . '" alt="Photo ' . $id . '" style="display:block;width:100%;max-width:560px;height:auto;border-radius:10px">'; }
    return '<tr><td style="padding:28px 0 0">'
      . '<div style="' . $label . ';margin-bottom:10px">' . $e($title) . '</div>'
      . $img
      . '<div style="' . $font . ';font-size:14px;color:#6b6b6b;margin-top:10px">Photo ' . $e($id) . ' · ' . nf($n) . ' ' . $e($unit) . '</div>'
      . '</td></tr>';
  };
  $tile = fn($v, $t) => '<td width="25%" style="padding:4px"><div style="background:#f1f0ee;border-radius:12px;padding:16px 10px;text-align:center"><div style="' . $font . ';font-size:26px;color:#1a1a1a;line-height:1.1">' . nf($v) . '</div><div style="' . $font . ';' . $label . ';margin-top:6px">' . $t . '</div></div></td>';
  $days = '';
  for ($i = 6; $i >= 0; $i--) {
    $d = date('Y-m-d', strtotime("-$i days")); $x = $w['days'][$d] ?? ['visitors' => 0, 'open' => 0, 'view' => 0, 'download' => 0];
    $days .= '<tr><td style="' . $font . ';font-size:14px;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #f1f0ee">' . dlabel($d) . '</td>'
      . '<td align="right" style="' . $font . ';font-size:14px;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #f1f0ee">' . nf($x['visitors']) . '</td>'
      . '<td align="right" style="' . $font . ';font-size:14px;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #f1f0ee">' . nf($x['view']) . '</td>'
      . '<td align="right" style="' . $font . ';font-size:14px;color:#1a1a1a;padding:7px 0;border-bottom:1px solid #f1f0ee">' . nf($x['download']) . '</td></tr>';
  }
  $th = fn($t, $al = 'right') => '<td align="' . $al . '" style="' . $font . ';' . $label . ';padding:0 0 6px;border-bottom:1px solid #e4e2de">' . $t . '</td>';
  $top = stats_top($w['photos'], 'view', 10); $dl = stats_top($w['photos'], 'download', 10);
  $list = fn($arr, $key) => $arr ? implode(', ', array_map(fn($id, $p) => $id . ' (' . $p[$key] . ')', array_keys($arr), $arr)) : 'none';
  $period = date('j M', strtotime($from)) . ' to ' . date('j M Y');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Weekly report</title></head>'
    . '<body style="margin:0;padding:0;background:#f1f0ee">'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f0ee"><tr><td align="center" style="padding:24px 12px">'
    . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px"><tr><td style="padding:36px 32px 32px">'
    . '<div style="' . $font . ';' . $label . '">' . $e(cfg('reportName', 'Photo Gallery')) . ' · Weekly report</div>'
    . '<div style="font-family:Georgia,\'Times New Roman\',serif;font-style:italic;font-size:34px;color:#1a1a1a;line-height:1.2;margin-top:8px">' . $e(cfg('title')) . '</div>'
    . '<div style="' . $font . ';font-size:14px;color:#6b6b6b;margin-top:6px">' . $e($period) . '</div>'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr>'
    . $tile($w['visitors'], 'Visitors') . $tile($w['open'], 'Opens') . $tile($w['view'], 'Photo views') . $tile($w['download'], 'Downloads')
    . '</tr></table>'
    . '<div style="' . $font . ';font-size:13px;color:#8a8a8a;margin-top:12px">Total since launch: ' . nf($all['visitors']) . ' visitors · ' . nf($all['open']) . ' opens · ' . nf($all['view']) . ' photo views · ' . nf($all['download']) . ' downloads</div>'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    . $photoBlock('Photo of the week · most viewed', $top, 'view', 'views')
    . $photoBlock('Most downloaded', $dl, 'download', 'downloads')
    . '</table>'
    . '<div style="' . $font . ';' . $label . ';margin-top:32px;margin-bottom:10px">Per day</div>'
    . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>' . $th('Day', 'left') . $th('Visitors') . $th('Views') . $th('Downloads') . '</tr>' . $days . '</table>'
    . '<div style="' . $font . ';font-size:13px;color:#6b6b6b;line-height:1.6;margin-top:24px"><b style="font-weight:600;color:#1a1a1a">Most viewed photos:</b> ' . $e($list($top, 'view')) . '<br><b style="font-weight:600;color:#1a1a1a">Most downloaded:</b> ' . $e($list($dl, 'download')) . '</div>'
    . '<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:28px"><tr><td style="background:#1a1a1a;border-radius:22px"><a href="' . $e(rtrim(cfg('siteUrl', ''), '/') . gallery_path() . 'stats.php') . '" style="' . $font . ';display:inline-block;padding:13px 22px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#fff;text-decoration:none">Open statistics</a></td></tr></table>'
    . '</td></tr></table>'
    . '<div style="' . $font . ';font-size:11px;color:#8a8a8a;margin-top:16px">Automatic report, every Monday. Visitors = distinct devices per day, no IP addresses stored.</div>'
    . '</td></tr></table></body></html>';
}
function stats_send_mail($rows) {
  $subject = '=?UTF-8?B?' . base64_encode(cfg('reportName', 'Photo Gallery') . ': weekly report ' . date('j M Y')) . '?=';
  $images = [];
  $html = stats_mail_html($rows, $images);
  $text = stats_mail_text($rows);
  $alt = 'alt-' . md5(uniqid('', true)); $rel = 'rel-' . md5(uniqid('', true));
  $body  = "--$rel\r\nContent-Type: multipart/alternative; boundary=\"$alt\"\r\n\r\n";
  $body .= "--$alt\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($text)) . "\r\n";
  $body .= "--$alt\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n" . chunk_split(base64_encode($html)) . "\r\n";
  $body .= "--$alt--\r\n";
  foreach ($images as $cid => $file) {
    $body .= "--$rel\r\nContent-Type: image/jpeg\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <$cid>\r\nContent-Disposition: inline; filename=\"" . basename($file) . "\"\r\n\r\n" . chunk_split(base64_encode(file_get_contents($file))) . "\r\n";
  }
  $body .= "--$rel--\r\n";
  $headers = "From: " . cfg('reportName', 'Photo Gallery') . " <" . STATS_MAIL_FROM . ">\r\nReply-To: " . STATS_MAIL_FROM . "\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related; boundary=\"$rel\"; type=\"multipart/alternative\"";
  return mail(STATS_MAIL_TO, $subject, $body, $headers);
}

// --- Routing ---
if (isset($_GET['mail'], $_GET['key']) && hash_equals(STATS_KEY, (string)$_GET['key'])) {   // weekly report (GitHub Actions)
  header('Content-Type: text/plain; charset=UTF-8');
  echo stats_send_mail(stats_load()) ? "Mail sent to " . STATS_MAIL_TO : "Mail could not be sent";
  exit;
}
// Remove entries before a date (test data): stats.php?prune=YYYY-MM-DD&key=STATS_KEY. Makes a backup first.
if (isset($_GET['prune'], $_GET['key']) && hash_equals(STATS_KEY, (string)$_GET['key']) && preg_match('~^\d{4}-\d{2}-\d{2}$~', $_GET['prune'])) {
  header('Content-Type: text/plain; charset=UTF-8');
  if (!is_file(GALLERY_LOG)) { echo "No log yet."; exit; }
  $lines = file(GALLERY_LOG, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
  $keep = array_values(array_filter($lines, fn($l) => substr($l, 0, 10) >= $_GET['prune']));
  $backup = dirname(GALLERY_LOG) . '/log-before-prune-' . date('Ymd-His') . '.csv';
  copy(GALLERY_LOG, $backup);
  file_put_contents(GALLERY_LOG, $keep ? implode("\n", $keep) . "\n" : '', LOCK_EX);
  echo "Pruned: " . count($lines) . " entries before, " . count($keep) . " kept from " . $_GET['prune'] . ", " . (count($lines) - count($keep)) . " removed. Backup: " . basename($backup);
  exit;
}
if (stats_authed() && isset($_GET['preview'])) {   // preview of the HTML mail in the browser (images embedded)
  $images = []; $html = stats_mail_html(stats_load(), $images);
  foreach ($images as $cid => $file) $html = str_replace('cid:' . $cid, 'data:image/jpeg;base64,' . base64_encode(file_get_contents($file)), $html);
  header('Content-Type: text/html; charset=UTF-8'); echo $html; exit;
}
if (isset($_POST['pw'])) {
  if (hash_equals(STATS_PASSWORD, trim($_POST['pw']))) {
    setcookie('gallery_stats', stats_token(), ['expires' => time() + 365 * 86400, 'path' => gallery_path(), 'secure' => !empty($_SERVER['HTTPS']), 'httponly' => true, 'samesite' => 'Lax']);
    gallery_grant();   // so the thumbnails on the statistics page load
    header('Location: stats.php'); exit;
  }
  $error = true;
}
$sent = null;
if (stats_authed() && isset($_POST['sendmail'])) $sent = stats_send_mail(stats_load());
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Statistics <?= htmlspecialchars(cfg('title')) ?></title>
<style>
  @font-face{font-family:'Jost';src:url('fonts/Jost.woff2') format('woff2'),url('fonts/Jost.ttf') format('truetype');font-weight:100 900}
  @font-face{font-family:'Script';src:url('fonts/GreatVibes.woff2') format('woff2'),url('fonts/GreatVibes.ttf') format('truetype')}
  *{box-sizing:border-box}
  html,body{margin:0;background:#fff;color:#1a1a1a;font-family:'Jost','Futura','Century Gothic',sans-serif;font-weight:300;-webkit-font-smoothing:antialiased}
  body{padding:32px 24px 64px}
  .wrap{max-width:900px;margin:0 auto}
  h1{margin:0 0 4px;font-family:'Script',cursive;font-weight:400;font-size:48px;line-height:1.1}
  .k{font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:#7a7a7a;margin-bottom:28px}
  h2{font-weight:400;font-size:13px;letter-spacing:.22em;text-transform:uppercase;color:#6b6b6b;margin:40px 0 14px}
  .tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
  .tile{background:#f1f0ee;border-radius:12px;padding:16px 18px}
  .tile b{display:block;font-weight:400;font-size:32px;line-height:1.1}
  .tile span{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#6b6b6b}
  table{width:100%;border-collapse:collapse;font-size:15px}
  th{text-align:right;font-weight:400;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8a8a8a;padding:6px 8px;border-bottom:1px solid #e4e2de}
  th:first-child,td:first-child{text-align:left}
  td{text-align:right;padding:8px;border-bottom:1px solid #f1f0ee;font-variant-numeric:tabular-nums}
  .photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px}
  .photo{background:#f1f0ee;border-radius:10px;overflow:hidden}
  .photo img{display:block;width:100%;aspect-ratio:4/3;object-fit:cover}
  .photo div{padding:8px 10px;font-size:12px;letter-spacing:.06em;color:#6b6b6b;display:flex;justify-content:space-between}
  .photo div b{font-weight:400;color:#1a1a1a}
  .pill{display:inline-flex;align-items:center;height:40px;padding:0 18px;border-radius:20px;background:#f1f0ee;border:0;font:inherit;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#1a1a1a;cursor:pointer;text-decoration:none}
  .pill:hover{background:#e4e2de}
  .note{font-size:14px;color:#8a8a8a;margin-top:12px}
  .ok{color:#2f6f3e}.err{color:#9a2b2b}
  form.login{max-width:360px;margin:20vh auto 0;display:flex;flex-direction:column;gap:12px;text-align:center}
  form.login input{height:52px;border:1px solid #1a1a1a;border-radius:0;padding:0 16px;font:inherit;font-size:18px;text-align:center;letter-spacing:.12em;outline:none}
  form.login button{height:52px;border:1px solid #1a1a1a;background:#1a1a1a;color:#fff;font:inherit;font-size:15px;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}
  .actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:24px}
</style>
</head>
<body>
<?php if (!stats_authed()): ?>
<form class="login" method="post">
  <div class="k">Statistics</div>
  <h1 style="margin-bottom:24px"><?= htmlspecialchars(cfg('title')) ?></h1>
  <input type="password" name="pw" placeholder="Password" autofocus autocomplete="off">
  <button type="submit">Show</button>
  <?php if (!empty($error)): ?><div class="err" style="font-size:15px">Wrong password.</div><?php endif; ?>
</form>
<?php exit; endif;

$rows = stats_load();
$all = stats_agg($rows);
$week = stats_agg($rows, date('Y-m-d', strtotime('-6 days')));
$days = array_slice($all['days'], 0, 30, true);
$topViews = stats_top($all['photos'], 'view', 12);
$topDl = stats_top($all['photos'], 'download', 12);
?>
<div class="wrap">
  <div class="k">Statistics</div>
  <h1><?= htmlspecialchars(cfg('title')) ?></h1>
  <div class="note">As of <?= date('j M Y, H:i') ?> · <?= nf(count($rows)) ?> events since <?= $rows ? date('j M Y', strtotime($rows[0]['t'])) : 'today' ?></div>

  <h2>Last 7 days</h2>
  <div class="tiles">
    <div class="tile"><b><?= nf($week['visitors']) ?></b><span>Visitors</span></div>
    <div class="tile"><b><?= nf($week['open']) ?></b><span>Opens</span></div>
    <div class="tile"><b><?= nf($week['view']) ?></b><span>Photo views</span></div>
    <div class="tile"><b><?= nf($week['download']) ?></b><span>Downloads</span></div>
  </div>

  <h2>Total</h2>
  <div class="tiles">
    <div class="tile"><b><?= nf($all['visitors']) ?></b><span>Visitors</span></div>
    <div class="tile"><b><?= nf($all['open']) ?></b><span>Opens</span></div>
    <div class="tile"><b><?= nf($all['view']) ?></b><span>Photo views</span></div>
    <div class="tile"><b><?= nf($all['download']) ?></b><span>Downloads</span></div>
  </div>
  <div class="note">Visitors = distinct devices per day (a daily rotating hash that cannot be reversed, no IP addresses stored). Summed over several days.</div>

  <h2>Per day (last 30 days)</h2>
  <?php if ($days): ?>
  <table>
    <tr><th>Day</th><th>Visitors</th><th>Opens</th><th>Photo views</th><th>Downloads</th></tr>
    <?php foreach ($days as $d => $x): ?>
    <tr><td><?= dlabel($d) ?> <?= date('Y', strtotime($d)) ?></td><td><?= nf($x['visitors']) ?></td><td><?= nf($x['open']) ?></td><td><?= nf($x['view']) ?></td><td><?= nf($x['download']) ?></td></tr>
    <?php endforeach; ?>
  </table>
  <?php else: ?><div class="note">No data yet.</div><?php endif; ?>

  <h2>Most viewed photos</h2>
  <?php if ($topViews): ?>
  <div class="photos">
    <?php foreach ($topViews as $id => $p): ?>
    <a class="photo" href="./#<?= $id ?>" title="Photo <?= $id ?>"><img src="img.php?f=thumb/<?= $id ?>.jpg" alt="" loading="lazy"><div><b><?= $id ?></b><span><?= nf($p['view']) ?> views</span></div></a>
    <?php endforeach; ?>
  </div>
  <?php else: ?><div class="note">No photo views yet.</div><?php endif; ?>

  <h2>Most downloaded</h2>
  <?php if ($topDl): ?>
  <div class="photos">
    <?php foreach ($topDl as $id => $p): ?>
    <a class="photo" href="./#<?= $id ?>" title="Photo <?= $id ?>"><img src="img.php?f=thumb/<?= $id ?>.jpg" alt="" loading="lazy"><div><b><?= $id ?></b><span><?= nf($p['download']) ?>×</span></div></a>
    <?php endforeach; ?>
  </div>
  <?php else: ?><div class="note">No downloads yet.</div><?php endif; ?>

  <h2>Weekly report</h2>
  <div class="note">Sent automatically every Monday to <?= htmlspecialchars(STATS_MAIL_TO) ?> (from <?= htmlspecialchars(STATS_MAIL_FROM) ?>).</div>
  <form method="post" class="actions">
    <button class="pill" type="submit" name="sendmail" value="1">Send report now</button>
    <a class="pill" href="stats.php?preview=1" target="_blank">Mail preview</a>
    <a class="pill" href="./">To the gallery</a>
    <?php if ($sent === true): ?><span class="ok">Mail sent.</span><?php elseif ($sent === false): ?><span class="err">Mail could not be sent.</span><?php endif; ?>
  </form>
  <pre style="margin-top:20px;padding:16px 18px;background:#f1f0ee;border-radius:12px;font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap"><?= htmlspecialchars(stats_mail_text($rows)) ?></pre>
</div>
</body>
</html>
