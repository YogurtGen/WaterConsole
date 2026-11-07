import { createServer } from 'node:http';
import { readFile, realpath, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve('build/renderer');
const output = path.resolve('docs/media');
await readFile(path.join(root, 'host.html'));
await mkdir(output, { recursive: true });

// This server only serves the existing UI build. It has no pairing or input backend.
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const file = await realpath(path.join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root + path.sep) || !mime[path.extname(file)]) throw new Error('Not a public fixture asset.');
    response.writeHead(200, { 'Content-Type': mime[path.extname(file)], 'Cache-Control': 'no-store' });
    response.end(await readFile(file));
  } catch {
    response.writeHead(404);
    response.end('Documentation fixture asset not found.');
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const colors = ['#32e49e', '#55a5ff', '#ffb95e', '#cf88ff'];
const names = ['Alex', 'Sam', 'Riley', 'Jordan'];
const players = names.map((name, i) => ({
  id: `documentation-player-${i + 1}`, slot: i + 1, name, color: colors[i],
  connected: true, ready: true, canNavigate: i === 0, buttons: [], axes: { x: 0, y: 0 },
  position: { x: 0.38 + (i % 2) * 0.21, y: 0.39 + Math.floor(i / 2) * 0.2 }, pressCount: 12 + i * 7,
}));
const base = {
  version: 1, epoch: 1, phase: 'home', players, selectedGameId: 'controller-lab', heroMode: 'featured',
  displayMode: 'shared', profile: 'menu',
  native: { available: false, games: {}, status: 'unavailable', controls: 'menu', focused: false },
  pairingLocked: false, search: '', libraryView: 'all', favorites: [], recent: [], muted: true,
  serverTime: Date.now(), feedback: { sequence: 0, sound: 'move' }, pending: [],
  pairing: { url: 'https://example.invalid/controller', code: 'PREVIEW', expiresAt: Date.now() + 120000 },
  network: { address: 'example.invalid', port: 8787, interfaces: [{ address: 'example.invalid', name: 'Documentation preview', preferred: true }], status: 'online' },
};

function fixture({ initial, phone }) {
  let state = structuredClone(initial);
  const listeners = new Set();
  const sockets = new Set();
  const publish = () => {
    listeners.forEach(listener => listener(structuredClone(state)));
    sockets.forEach(socket => socket.emit({ type: 'state', state }));
  };
  window.__setDocumentationState = patch => { state = { ...state, ...patch }; publish(); };
  window.waterconsole = {
    getState: async () => structuredClone(state),
    getFullscreen: async () => false,
    toggleFullscreen: async () => false,
    onState: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    command: async command => {
      if (command.type === 'openHome' || command.type === 'stopGame') Object.assign(state, { phase: 'home', profile: 'menu' });
      if (command.type === 'showLobby') state.phase = 'lobby';
      if (command.type === 'startGame') Object.assign(state, { phase: 'lab', profile: 'lab', epoch: state.epoch + 1 });
      if (command.type === 'setLayout') state.displayMode = command.mode;
      if (command.type === 'selectGame') { state.selectedGameId = command.gameId; state.heroMode = 'detail'; }
      publish();
      return { ok: true };
    },
    minimize() {}, quit() {},
  };
  if (phone) {
    sessionStorage.setItem('waterconsole.token', 'documentation-placeholder-not-a-session');
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true });
    Object.defineProperty(Element.prototype, 'requestFullscreen', { configurable: true, value: async () => {} });
    class DocumentationSocket {
      static CONNECTING = 0; static OPEN = 1; static CLOSING = 2; static CLOSED = 3;
      readyState = 0;
      constructor() {
        sockets.add(this);
        setTimeout(() => { this.readyState = 1; this.onopen?.({}); }, 0);
      }
      emit(message) { this.onmessage?.({ data: JSON.stringify(message) }); }
      send(raw) {
        const message = JSON.parse(raw);
        if (message.type === 'auth') this.emit({ type: 'authenticated', playerId: state.players[0].id, state });
        // No ping response: screenshots must not suggest measured network latency.
      }
      close() { this.readyState = 3; sockets.delete(this); }
    }
    window.WebSocket = DocumentationSocket;
  }
  document.addEventListener('DOMContentLoaded', () => {
    const label = document.createElement('div');
    label.textContent = 'Documentation preview';
    label.setAttribute('aria-label', 'Documentation preview — simulated state');
    label.style.cssText = 'position:fixed;bottom:10px;right:10px;z-index:2147483647;padding:7px 10px;border:1px solid #446355;border-radius:8px;background:#0d1712ee;color:#b9d2c5;font:600 11px/1.2 system-ui;letter-spacing:.02em;pointer-events:none';
    document.body.append(label);
  });
}

let browser;
const failures = [];
try {
  browser = await chromium.launch({ headless: true, ...(process.env.WATERCONSOLE_BROWSER === 'chromium' ? {} : { channel: 'chrome' }) });
  const capture = async (filename, initial, viewport, options = {}) => {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...(options.phone ? { isMobile: true, hasTouch: true } : {}) });
    await context.route('**/*', route => route.request().url().startsWith(origin + '/') ? route.continue() : route.abort());
    await context.addInitScript(fixture, { initial, phone: !!options.phone });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`${filename}: ${error.message}`));
    await page.goto(`${origin}/${options.phone ? 'controller' : 'host'}.html`, { waitUntil: 'networkidle' });
    if (options.phone) {
      await page.getByRole('button', { name: 'Enter controller', exact: true }).click();
      if (options.settings) await page.getByRole('button', { name: 'Controller settings', exact: true }).click();
      await page.getByRole('button', { name: 'Controller settings', exact: true }).waitFor();
    } else {
      await page.locator('.host-header').waitFor();
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(image => image.decode().catch(() => {})));
      document.getAnimations().forEach(animation => { if (animation.effect?.getTiming().iterations !== Infinity) animation.finish(); });
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    await page.screenshot({ path: path.join(output, filename), fullPage: !!options.fullPage });
    console.log(`Captured docs/media/${filename} (simulated documentation state)`);
    await context.close();
  };
  await capture('home.png', base, { width: 1920, height: 1080 }, { fullPage: true });
  await capture('lobby.png', { ...base, phase: 'lobby', players: [], pending: [] }, { width: 1920, height: 1080 });
  await capture('controller-lab.png', { ...base, phase: 'lab', profile: 'lab', displayMode: 'split-4' }, { width: 1920, height: 1080 });
  await capture('phone-home.png', base, { width: 393, height: 852 }, { phone: true });
  await capture('phone-controller.png', { ...base, phase: 'lab', profile: 'lab' }, { width: 960, height: 540 }, { phone: true });
  await capture('vibration.png', base, { width: 393, height: 852 }, { phone: true, settings: true });
  if (failures.length) throw new Error(failures.join('\n'));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
