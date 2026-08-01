'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { after, before, test } = require('node:test');
const WebSocket = require('ws');

let child;
let baseUrl;
let wsUrl;
let sessionDataDir;

function reservePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function connectWebSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const messages = [];
    socket.on('message', (raw) => {
      try { messages.push(JSON.parse(raw)); } catch (_) {}
    });
    socket.once('open', () => resolve({ socket, messages }));
    socket.once('error', reject);
  });
}

async function waitFor(check, timeoutMs = 2000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for server state');
}

before(async () => {
  const port = await reservePort();
  sessionDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-session-test-'));
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(port),
      ATEM_PNG_EXPORT: '0',
      SESSION_DATA_DIR: sessionDataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  await waitFor(() => output.includes('Server Mode'), 5000);
});

after(async () => {
  if (child && child.exitCode == null) {
    child.kill('SIGINT');
    await new Promise((resolve) => child.once('exit', resolve));
  }
  if (sessionDataDir && sessionDataDir.startsWith(os.tmpdir())) {
    fs.rmSync(sessionDataDir, { recursive: true, force: true });
  }
});

test('serves only public application assets', async () => {
  const controlResponse = await fetch(`${baseUrl}/`);
  assert.equal(controlResponse.status, 200);
  const controlHtml = await controlResponse.text();
  const controlVersion = controlHtml.match(/css\/control\.css\?v=([a-f0-9]{12})/)?.[1];
  assert.ok(controlVersion);
  assert.match(controlHtml, new RegExp(`js/control\\.js\\?v=${controlVersion}`));
  assert.doesNotMatch(controlHtml, /__CONTROL_ASSET_VERSION__/);
  const versionedCss = await fetch(`${baseUrl}/css/control.css?v=${controlVersion}`);
  assert.equal(versionedCss.status, 200);
  assert.match(versionedCss.headers.get('cache-control') || '', /immutable/);

  const outputResponse = await fetch(`${baseUrl}/output.html?session=test`);
  assert.equal(outputResponse.status, 200);
  const outputHtml = await outputResponse.text();
  assert.match(outputHtml, /css\/output\.css\?v=[a-f0-9]{12}/);
  assert.doesNotMatch(outputHtml, /__OUTPUT_ASSET_VERSION__/);
  assert.equal((await fetch(`${baseUrl}/.git/config`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/Design/Overlay%20Design%20System%20Template/Overlay%20Control.dc.html`)).status, 404);
  assert.equal((await fetch(`${baseUrl}/`, { method: 'POST' })).status, 405);
  assert.equal((await fetch(`${baseUrl}/api/state?session=bad%20id`)).status, 400);
});

test('isolates WebSocket roles and does not replay cleared graphics', async () => {
  const control = await connectWebSocket(`${wsUrl}/?session=protocol-test&role=control`);
  const output = await connectWebSocket(`${wsUrl}/?session=protocol-test&role=output`);
  await waitFor(() => output.messages.length >= 2);
  assert.deepEqual(output.messages.map((message) => message.action), ['clear', 'clear-ticker']);

  control.socket.send(JSON.stringify({
    action: 'show',
    data: { line1: 'Live' },
    settings: { style: 'classic' },
  }));
  await waitFor(() => output.messages.some((message) => message.action === 'show'));
  control.socket.send(JSON.stringify({ action: 'clear' }));
  await waitFor(() => output.messages.filter((message) => message.action === 'clear').length >= 2);

  output.socket.close();
  await new Promise((resolve) => setTimeout(resolve, 30));
  const lateOutput = await connectWebSocket(`${wsUrl}/?session=protocol-test&role=output`);
  await waitFor(() => lateOutput.messages.length >= 3);
  assert.equal(lateOutput.messages.some((message) => message.action === 'show'), false);
  assert.equal(lateOutput.messages.some((message) => message.action === 'clear'), true);

  lateOutput.socket.send(JSON.stringify({ action: 'show', data: { line1: 'unauthorized' } }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  const state = await fetch(`${baseUrl}/api/state?session=protocol-test`).then((response) => response.json());
  assert.equal(state.overlayVisible, false);

  lateOutput.socket.close();
  control.socket.close();
});

test('persists session settings and synchronizes all controls in the room', async () => {
  const first = await connectWebSocket(`${wsUrl}/?session=saved-session&role=control`);
  await waitFor(() => first.messages.some((message) => message.action === 'settings-required'));

  first.socket.send(JSON.stringify({
    action: 'session-settings-save',
    initializeOnly: true,
    settings: { style: 'gradient', accentColor: '#112233' },
    sessionSettings: {
      version: 1,
      overlayModeSettings: { bible: { style: 'gradient' }, speaker: { style: 'solid' }, custom: { style: 'minimal' } },
      presets: { overlay: [{ id: 'reference-1', mode: 'bible', label: 'John 3:16' }], ticker: [] },
    },
  }));

  const second = await connectWebSocket(`${wsUrl}/?session=saved-session&role=control`);
  const initial = await waitFor(() => second.messages.find((message) => message.action === 'session-settings'));
  assert.equal(initial.settings.accentColor, '#112233');
  assert.equal(initial.sessionSettings.overlayModeSettings.speaker.style, 'solid');
  assert.equal(initial.sessionSettings.presets.overlay[0].label, 'John 3:16');

  first.socket.send(JSON.stringify({
    action: 'session-presets-save',
    requestId: 'preset-save-1',
    presets: { overlay: [{ id: 'speaker-1', mode: 'speaker', label: 'Guest speaker' }], ticker: [] },
  }));
  const presetAcknowledgement = await waitFor(() => first.messages.find(
    (message) => message.action === 'session-save-ack' && message.requestId === 'preset-save-1'
  ));
  assert.equal(presetAcknowledgement.ok, true);
  assert.ok(presetAcknowledgement.updatedAt > 0);
  await waitFor(() => second.messages.find(
    (message) => message.action === 'session-settings'
      && message.sessionSettings?.presets?.overlay?.[0]?.label === 'Guest speaker'
  ));

  first.socket.send(JSON.stringify({
    action: 'session-presets-save',
    requestId: 'invalid-preset-save',
    presets: { overlay: 'invalid', ticker: [] },
  }));
  const rejected = await waitFor(() => first.messages.find(
    (message) => message.action === 'session-save-ack' && message.requestId === 'invalid-preset-save'
  ));
  assert.equal(rejected.ok, false);

  second.socket.send(JSON.stringify({
    action: 'session-settings-save',
    requestId: 'settings-save-2',
    settings: { style: 'frosted', accentColor: '#abcdef' },
    sessionSettings: {
      version: 1,
      overlayModeSettings: { bible: { style: 'frosted' }, speaker: { style: 'solid' }, custom: { style: 'minimal' } },
      presets: { overlay: [{ id: 'speaker-1', mode: 'speaker', label: 'Guest speaker' }], ticker: [] },
    },
  }));
  const acknowledged = await waitFor(() => second.messages.find(
    (message) => message.action === 'session-save-ack' && message.requestId === 'settings-save-2'
  ));
  assert.equal(acknowledged.ok, true);
  const reflected = await waitFor(() => first.messages.find(
    (message) => message.action === 'session-settings' && message.settings?.accentColor === '#abcdef'
  ));
  assert.equal(reflected.settings.style, 'frosted');

  first.socket.close();
  second.socket.close();
  await new Promise((resolve) => setTimeout(resolve, 50));

  const restored = await fetch(`${baseUrl}/api/state?session=saved-session`).then((response) => response.json());
  assert.equal(restored.settings.style, 'frosted');
  assert.equal(restored.settings.accentColor, '#abcdef');
  assert.equal(restored.sessionSettings.overlayModeSettings.bible.style, 'frosted');
  assert.equal(restored.sessionSettings.presets.overlay[0].label, 'Guest speaker');
  assert.ok(restored.settingsUpdatedAt > 0);
  assert.equal(fs.existsSync(path.join(sessionDataDir, 'saved-session.json')), true);
});

test('rejects invalid WebSocket connection parameters', async () => {
  const socket = new WebSocket(`${wsUrl}/?session=bad%20id&role=control`);
  socket.on('error', () => {});
  const code = await new Promise((resolve, reject) => {
    socket.once('close', resolve);
    setTimeout(() => reject(new Error('Invalid connection remained open')), 2000);
  });
  assert.equal(code, 1008);
});
