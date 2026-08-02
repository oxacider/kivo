/**
 * Ensures the Capacitor webDir (out/) contains a placeholder index.html before
 * `cap sync` runs.
 *
 * Background: KIVO's Next.js app uses `output: "standalone"`, so `next build`
 * does NOT produce an `out/` directory. The Android WebView loads the real app
 * from CAPACITOR_SERVER_URL (see capacitor.config.ts); the local webDir is only
 * a fallback shell. Both `out/` (root .gitignore) and the synced copy
 * (`android/app/src/main/assets/public` — android/.gitignore) are untracked,
 * so a fresh clone has no web assets at all and `npx cap sync` would fail with
 * "web directory out does not exist". This script writes the placeholder shell
 * so sync is always reproducible; a real `next build && cap sync` run replaces
 * it with the actual web build.
 */
const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'out');
const INDEX_HTML = path.join(OUT_DIR, 'index.html');
const OFFLINE_HTML = path.join(OUT_DIR, 'offline.html');

// Server URL this app build is pointed at (same var as capacitor.config.ts).
// Used to make the offline page's Retry button genuinely re-attempt the remote
// app. When unset, the offline page shows no retry (local-shell mode).
const SERVER_URL = process.env.CAPACITOR_SERVER_URL || '';

const PLACEHOLDER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>KIVO</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #1a1625;
      color: #f5f3ff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .shell {
      text-align: center;
      padding: 24px;
    }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: #7c5cff;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 28px;
      color: #fff;
    }
    h1 { font-size: 18px; margin: 0 0 6px; font-weight: 600; }
    p { margin: 0; font-size: 13px; color: rgba(245, 243, 255, 0.6); }
  </style>
</head>
<body>
  <div class="shell">
    <div class="logo">K</div>
    <h1>KIVO</h1>
    <p>Loading…</p>
  </div>
</body>
</html>
`;

const RETRY_BUTTON = SERVER_URL
  ? `<button onclick="window.location.href='${SERVER_URL}'">Retry</button>`
  : '';

const OFFLINE_PLACEHOLDER = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="color-scheme" content="dark" />
  <title>KIVO — Offline</title>
  <style>
    html, body {
      margin: 0;
      padding: 0;
      height: 100%;
      background: #1a1625;
      color: #f5f3ff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .shell {
      text-align: center;
      padding: 24px;
      max-width: 320px;
    }
    .logo {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: #7c5cff;
      margin: 0 auto 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 28px;
      color: #fff;
    }
    h1 { font-size: 18px; margin: 0 0 6px; font-weight: 600; }
    p { margin: 0 0 16px; font-size: 13px; color: rgba(245, 243, 255, 0.6); line-height: 1.5; }
    button {
      background: #7c5cff;
      color: #fff;
      border: none;
      border-radius: 12px;
      padding: 10px 22px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
    }
    button:active { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="shell">
    <div class="logo">K</div>
    <h1>Can't reach KIVO</h1>
    <p>You appear to be offline or the KIVO server is unreachable. Check your connection and try again.</p>
    ${RETRY_BUTTON}
  </div>
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
if (!fs.existsSync(INDEX_HTML)) {
  fs.writeFileSync(INDEX_HTML, PLACEHOLDER, 'utf8');
  console.log('[ensure-webdir] wrote placeholder out/index.html');
} else {
  console.log('[ensure-webdir] out/index.html already exists — leaving as-is');
}
// The offline fallback shown by server.errorPath when the remote app can't be
// reached. Always (re)written so it stays in sync with this script. When
// CAPACITOR_SERVER_URL is set, Retry navigates back to the remote app (a plain
// reload would only reload this local error page — dead UI).
fs.writeFileSync(OFFLINE_HTML, OFFLINE_PLACEHOLDER, 'utf8');
console.log(
  `[ensure-webdir] wrote offline fallback out/offline.html${SERVER_URL ? ' (retry → ' + SERVER_URL + ')' : ' (no retry: CAPACITOR_SERVER_URL unset)'}`
);
