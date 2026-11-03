// Macht aus dem Expo-Web-Export eine installierbare Web-App (Vollbild auf dem Home-Bildschirm).
const fs = require('fs');
const path = require('path');
const dist = process.env.DIST_DIR ? path.resolve(process.env.DIST_DIR) : path.join(__dirname, '..', 'dist');
// BASE_URL='' erlaubt (lokaler Test unter /), sonst Standard für GitHub Pages
const base = (process.env.BASE_URL !== undefined ? process.env.BASE_URL : '/App-').replace(/\/$/, '');
const crypto = require('crypto');

fs.copyFileSync(path.join(__dirname, '..', 'public-pwa/icon-192.png'), path.join(dist, 'icon-192.png'));
fs.copyFileSync(path.join(__dirname, '..', 'public-pwa/icon-512.png'), path.join(dist, 'icon-512.png'));
// Rechtsdokumente (z. B. Auftragsverarbeitungsvertrag), offline verfügbar
fs.cpSync(path.join(__dirname, '..', 'public-pwa/dokumente'), path.join(dist, 'dokumente'), { recursive: true });
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'Immo Verwaltung', short_name: 'Immo', lang: 'de', display: 'standalone',
  start_url: `${base}/`, scope: `${base}/`, background_color: '#E9EAEE', theme_color: '#15171A',
  icons: [{ src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png' }, { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<html[^>]*>/, '<html lang="de">');
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
const head = `
<link rel="manifest" href="${base}/manifest.webmanifest" />
<link rel="apple-touch-icon" href="${base}/icon-192.png" />
<meta name="theme-color" content="#15171A" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Immo" />
<style>html,body{background:#E9EAEE}body{overscroll-behavior-y:none}</style>
<script>window.__immoBase='${base}';</script>
<script>
/* Offline-Modus: Service Worker anmelden und über Updates informieren */
(function(){
  if(!('serviceWorker' in navigator)) return;
  var BASE='${base}';
  window.addEventListener('load',function(){
    navigator.serviceWorker.register(BASE+'/sw.js',{scope:BASE+'/'}).then(function(reg){
      function announce(){ if(reg.waiting && navigator.serviceWorker.controller){ window.__immoSwWaiting=reg.waiting; window.dispatchEvent(new Event('immo-sw-waiting')); } }
      announce();
      reg.addEventListener('updatefound',function(){ var w=reg.installing; if(!w) return; w.addEventListener('statechange',function(){ if(w.state==='installed') announce(); }); });
      document.addEventListener('visibilitychange',function(){ if(document.visibilityState==='visible') reg.update().catch(function(){}); });
      setInterval(function(){ reg.update().catch(function(){}); }, 3600000);
    }).catch(function(){});
    var reloaded=false;
    navigator.serviceWorker.addEventListener('controllerchange',function(){ if(reloaded||!window.__immoSwUpdating) return; reloaded=true; location.reload(); });
  });
})();
</script>`;
html = html.replace('</head>', `${head}\n</head>`);
fs.writeFileSync(path.join(dist, 'index.html'), html);
// GitHub Pages: unbekannte Pfade (z. B. neu geladene /objekt/123) liefern 404.html. Die App-Shell übernimmt das Routing.
fs.writeFileSync(path.join(dist, '404.html'), html);

// ── Service Worker: alle Dateien der App vorab speichern, damit sie auch ohne Netz startet ──
const walk = (dir, rel = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name), `${rel}${e.name}/`) : [`${rel}${e.name}`]));
const files = walk(dist).filter((f) => !['sw.js', '404.html', '.nojekyll', 'metadata.json'].includes(f) && !f.endsWith('.map')).sort();
const version = crypto.createHash('sha1').update(files.map((f) => `${f}:${fs.statSync(path.join(dist, f)).size}`).join('|')).digest('hex').slice(0, 10);
// Adressen wie der Browser sie abruft: Klammern ([id]-….js) bleiben unkodiert, sonst findet der Zwischenspeicher sie nicht
const precache = files.map((f) => `${base}/${encodeURI(f).replace(/%5B/g, '[').replace(/%5D/g, ']')}`);
fs.writeFileSync(path.join(dist, 'sw.js'), `/* Immo Verwaltung – Service Worker (automatisch erzeugt) */
const BASE = ${JSON.stringify(base)};
const CACHE = 'immo-${version}';
const FILES = ${JSON.stringify(precache)};

self.addEventListener('install', (e) => {
  // Neue Version wartet, bis du sie in der App bestätigst (kein Austausch mitten in der Arbeit)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});
self.addEventListener('message', (e) => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('immo-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname !== BASE && !url.pathname.startsWith(BASE + '/')) return;
  // Seitenaufrufe (auch tiefe Adressen wie /objekt/123): App-Shell aus dem Speicher
  if (req.mode === 'navigate') {
    e.respondWith((async () => (await (await caches.open(CACHE)).match(BASE + '/index.html')) || fetch(req))());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req);
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res; } catch { return Response.error(); }
  })());
});
`);
console.log('PWA-Dateien geschrieben (base ' + base + ', Offline-Version ' + version + ', ' + files.length + ' Dateien vorab gespeichert)');
