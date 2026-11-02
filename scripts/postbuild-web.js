// Macht aus dem Expo-Web-Export eine installierbare Web-App (Vollbild auf dem Home-Bildschirm).
const fs = require('fs');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const base = (process.env.BASE_URL || '/App-').replace(/\/$/, '');

fs.copyFileSync(path.join(__dirname, '..', 'public-pwa/icon-192.png'), path.join(dist, 'icon-192.png'));
fs.copyFileSync(path.join(__dirname, '..', 'public-pwa/icon-512.png'), path.join(dist, 'icon-512.png'));
fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), JSON.stringify({
  name: 'Immo Verwaltung', short_name: 'Immo', lang: 'de', display: 'standalone',
  start_url: `${base}/`, scope: `${base}/`, background_color: '#F3F4F6', theme_color: '#0E6B63',
  icons: [{ src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png' }, { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any maskable' }],
}, null, 2));

let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
html = html.replace(/<html[^>]*>/, '<html lang="de">');
html = html.replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />');
const head = `
<link rel="manifest" href="${base}/manifest.webmanifest" />
<link rel="apple-touch-icon" href="${base}/icon-192.png" />
<meta name="theme-color" content="#0E6B63" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<meta name="apple-mobile-web-app-title" content="Immo" />
<style>html,body{background:#F3F4F6}body{overscroll-behavior-y:none}</style>`;
html = html.replace('</head>', `${head}\n</head>`);
fs.writeFileSync(path.join(dist, 'index.html'), html);
console.log('PWA-Dateien geschrieben (base ' + base + ')');
