'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { after, before, test } = require('node:test');
const WebSocket = require('ws');

let child;
let baseUrl;
let wsUrl;

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
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), ATEM_PNG_EXPORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  await waitFor(() => output.includes('Server Mode'), 5000);
});

after(async () => {
  if (!child || child.exitCode != null) return;
  child.kill('SIGINT');
  await new Promise((resolve) => child.once('exit', resolve));
});

test('serves only public application assets', async () => {
  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/output.html?session=test`)).status, 200);
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

test('rejects invalid WebSocket connection parameters', async () => {
  const socket = new WebSocket(`${wsUrl}/?session=bad%20id&role=control`);
  socket.on('error', () => {});
  const code = await new Promise((resolve, reject) => {
    socket.once('close', resolve);
    setTimeout(() => reject(new Error('Invalid connection remained open')), 2000);
  });
  assert.equal(code, 1008);
});
