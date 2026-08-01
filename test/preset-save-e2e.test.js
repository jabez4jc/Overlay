'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const WebSocket = require('ws');

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

async function waitFor(check, timeoutMs = 5000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for preset persistence state');
}

async function startServer(sessionDataDir) {
  const port = await reservePort();
  const child = spawn(process.execPath, ['server.js'], {
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
  await waitFor(() => output.includes('Server Mode'));
  return { child, port };
}

async function stopServer(child) {
  if (child.exitCode != null) return;
  child.kill('SIGINT');
  await new Promise((resolve) => child.once('exit', resolve));
}

function connectControl(port, sessionId) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/?session=${sessionId}&role=control`);
    const messages = [];
    socket.on('message', (raw) => {
      try { messages.push(JSON.parse(raw)); } catch (_) {}
    });
    socket.once('open', () => resolve({ socket, messages }));
    socket.once('error', reject);
  });
}

test('Save Preset is acknowledged, synchronized, written to disk, and restored after server restart', async () => {
  const sessionDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'overlay-preset-e2e-'));
  const sessionId = 'preset-restart-test';
  let firstServer;
  let restartedServer;
  let firstControl;
  let secondControl;
  let restoredControl;

  try {
    firstServer = await startServer(sessionDataDir);
    firstControl = await connectControl(firstServer.port, sessionId);
    secondControl = await connectControl(firstServer.port, sessionId);
    await waitFor(() => firstControl.messages.some((message) => message.action === 'settings-required'));

    firstControl.socket.send(JSON.stringify({
      action: 'session-settings-save',
      requestId: 'initialize-session',
      initializeOnly: true,
      settings: { style: 'classic', accentColor: '#c8a951' },
      sessionSettings: {
        version: 1,
        overlayModeSettings: {},
        presets: { overlay: [], ticker: [] },
      },
    }));
    const initializationAck = await waitFor(() => firstControl.messages.find(
      (message) => message.action === 'session-save-ack' && message.requestId === 'initialize-session'
    ));
    assert.equal(initializationAck.ok, true);

    const savedPreset = {
      id: 'preset-from-save-action',
      label: 'John 3:16 (KJV)',
      mode: 'bible',
      data: { book: 'John', chapter: '3', verse: '16', translation: 'KJV' },
    };
    firstControl.socket.send(JSON.stringify({
      action: 'session-settings-save',
      requestId: 'save-preset-action',
      settings: { style: 'classic', accentColor: '#c8a951' },
      sessionSettings: {
        version: 1,
        overlayModeSettings: {},
        presets: { overlay: [savedPreset], ticker: [] },
      },
    }));

    const saveAck = await waitFor(() => firstControl.messages.find(
      (message) => message.action === 'session-save-ack' && message.requestId === 'save-preset-action'
    ));
    assert.equal(saveAck.ok, true);
    assert.equal(saveAck.message, 'Session settings saved on server');

    const synchronized = await waitFor(() => secondControl.messages.find(
      (message) => message.action === 'session-settings'
        && message.sessionSettings?.presets?.overlay?.[0]?.id === savedPreset.id
    ));
    assert.deepEqual(synchronized.sessionSettings.presets.overlay[0], savedPreset);

    const persistedPath = path.join(sessionDataDir, `${sessionId}.json`);
    await waitFor(() => fs.existsSync(persistedPath));
    const persisted = JSON.parse(fs.readFileSync(persistedPath, 'utf8'));
    assert.deepEqual(persisted.sessionSettings.presets.overlay[0], savedPreset);

    firstControl.socket.close();
    secondControl.socket.close();
    await stopServer(firstServer.child);
    firstServer = null;

    restartedServer = await startServer(sessionDataDir);
    const restoredState = await fetch(`http://127.0.0.1:${restartedServer.port}/api/state?session=${sessionId}`)
      .then((response) => response.json());
    assert.deepEqual(restoredState.sessionSettings.presets.overlay[0], savedPreset);

    restoredControl = await connectControl(restartedServer.port, sessionId);
    const restoredMessage = await waitFor(() => restoredControl.messages.find(
      (message) => message.action === 'session-settings'
    ));
    assert.deepEqual(restoredMessage.sessionSettings.presets.overlay[0], savedPreset);
  } finally {
    firstControl?.socket.close();
    secondControl?.socket.close();
    restoredControl?.socket.close();
    if (firstServer) await stopServer(firstServer.child);
    if (restartedServer) await stopServer(restartedServer.child);
    fs.rmSync(sessionDataDir, { recursive: true, force: true });
  }
});
