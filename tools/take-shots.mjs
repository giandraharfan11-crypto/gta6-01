// Screenshot + smoke-test driver for Neon Harbor: Vice Run.
// Launches headless Chromium, speaks CDP over the built-in WebSocket, captures
// each scene from shots.json into screenshots/, then smoke-tests the real game
// (title -> Enter -> WASD) and reports console/page errors. Node 24, stdlib only.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const shots = JSON.parse(readFileSync(join(repo, 'shots.json'), 'utf8'));
const CHROME = '/opt/meta-chromium/chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = mkdtempSync(join(tmpdir(), 'nh-chrome-'));
// This Chromium build refuses to start without a Hatch WebGL domain policy:
// a contract file plus its SHA-256 passed as switches. All-origins contract is
// fine here — the game is Canvas 2D and uses no WebGL at all.
const policyPath = join(profile, 'webgl-policy.txt');
const policyBody = 'hatch-webgl-all-origins-v1\n';
writeFileSync(policyPath, policyBody);
const policySha = createHash('sha256').update(policyBody).digest('hex');
const chrome = spawn(CHROME, [
  '--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + profile,
  '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--allow-file-access-from-files',
  '--hatch-webgl-allowed-domains-file=' + policyPath,
  '--hatch-webgl-allowed-domains-sha256=' + policySha,
  '--window-size=1280,860', 'about:blank',
], { stdio: 'ignore' });

async function waitPortFile() {
  for (let i = 0; i < 100; i++) {
    try {
      const lines = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').trim().split('\n');
      if (lines[0]) return { port: lines[0], path: lines[1] };
    } catch (e) { /* not yet */ }
    await sleep(150);
  }
  throw new Error('DevToolsActivePort never appeared');
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.listeners = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      } else if (msg.method) {
        for (const fn of this.listeners) fn(msg);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
    });
  }
  on(fn) { this.listeners.push(fn); }
}

const errors = [];
let cdp, sessionId;
async function evalJs(expr) {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.text || ''));
  return r.result ? r.result.value : undefined;
}
async function navigate(url) {
  await cdp.send('Page.navigate', { url }, sessionId);
  await sleep(350);
}
async function waitShotReady(timeoutMs = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try { if (await evalJs('window.__shotReady === true')) return true; } catch (e) { /* page loading */ }
    await sleep(250);
  }
  return false;
}
async function key(type, keyName, code, vk) {
  await cdp.send('Input.dispatchKeyEvent', { type, key: keyName, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk }, sessionId);
}

async function main() {
  const { port, path } = await waitPortFile();
  const ws = new WebSocket('ws://127.0.0.1:' + port + path);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
  cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const att = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  sessionId = att.sessionId;
  cdp.on((msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push('exception: ' + (d.exception ? (d.exception.description || d.exception.value) : d.text));
    }
    if (msg.method === 'Runtime.consoleAPICalled' && (msg.params.type === 'error')) {
      errors.push('console.error: ' + msg.params.args.map((a) => a.value || a.description || '').join(' '));
    }
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
      errors.push('log: ' + msg.params.entry.text);
    }
  });
  await cdp.send('Page.enable', {}, sessionId);
  await cdp.send('Runtime.enable', {}, sessionId);
  await cdp.send('Log.enable', {}, sessionId);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, sessionId);

  const gameUrl = pathToFileURL(join(repo, 'game', 'index.html')).href;
  const results = [];
  for (const shot of shots) {
    await navigate(gameUrl + shot.query);
    const ready = await waitShotReady();
    if (!ready) { results.push(shot.name + ': TIMEOUT waiting __shotReady'); continue; }
    await sleep(250);
    let quality = 82, data = null, size = Infinity;
    while (quality >= 40) {
      const cap = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality, captureBeyondViewport: false }, sessionId);
      data = Buffer.from(cap.data, 'base64'); size = data.length;
      if (size <= 256 * 1024) break;
      quality -= 14;
    }
    writeFileSync(join(repo, 'screenshots', shot.name), data);
    results.push(shot.name + ': ' + size + ' bytes (q=' + quality + ')');
  }

  // ---- smoke test: real game, no ?shot ----
  const errorsBeforeSmoke = errors.length;
  await navigate(gameUrl);
  await sleep(1800);
  await key('keyDown', 'Enter', 'Enter', 13); await key('keyUp', 'Enter', 'Enter', 13);
  await sleep(500);
  for (const [k, c, vk] of [['w', 'KeyW', 87], ['a', 'KeyA', 65], ['s', 'KeyS', 83], ['d', 'KeyD', 68]]) {
    await key('keyDown', k, c, vk); await sleep(420); await key('keyUp', k, c, vk);
  }
  // enter a car if near one, drive a little, pause/unpause
  await key('keyDown', 'e', 'KeyE', 69); await key('keyUp', 'e', 'KeyE', 69);
  await sleep(300);
  await key('keyDown', 'w', 'KeyW', 87); await sleep(900); await key('keyUp', 'w', 'KeyW', 87);
  await key('keyDown', 'p', 'KeyP', 80); await key('keyUp', 'p', 'KeyP', 80);
  await sleep(250);
  await key('keyDown', 'p', 'KeyP', 80); await key('keyUp', 'p', 'KeyP', 80);
  await sleep(1200);
  const state = await evalJs('window.__game ? window.__game.state : "no-game"').catch(() => 'eval-failed');
  const smokeErrors = errors.slice(errorsBeforeSmoke);
  console.log('SHOTS:');
  for (const r of results) console.log('  ' + r);
  console.log('SMOKE state after keys: ' + state);
  console.log('SMOKE errors: ' + smokeErrors.length);
  for (const e of smokeErrors) console.log('  SMOKE-ERR ' + e);
  console.log('TOTAL page errors (shots+smoke): ' + errors.length);
  for (const e of errors) console.log('  ERR ' + e);
  try { ws.close(); } catch (e) { /* ignore */ }
}
main()
  .catch((e) => { console.error('DRIVER FAILED: ' + e.message); process.exitCode = 2; })
  .finally(() => { try { chrome.kill('SIGKILL'); } catch (e) { /* ignore */ } setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ } process.exit(process.exitCode || 0); }, 400); });
