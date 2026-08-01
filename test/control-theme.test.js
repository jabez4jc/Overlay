'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('ships a persistent, accessible control theme switch', () => {
  const html = read('index.html');
  const js = read('js/control.js');
  const css = read('css/control.css');

  assert.match(html, /id="btn-theme-toggle"/);
  assert.match(html, /aria-label="Switch to Modernist theme"/);
  assert.match(html, /class="theme-icon theme-icon-sun"/);
  assert.match(html, /class="theme-icon theme-icon-moon"/);
  assert.doesNotMatch(html, /id="theme-toggle-label"/);
  assert.ok(
    html.indexOf("localStorage.getItem('overlayControlTheme')") < html.indexOf('css/control.css'),
    'theme bootstrap should run before the control stylesheet loads'
  );
  assert.match(js, /function toggleControlTheme\(\)/);
  assert.match(js, /window\.addEventListener\('storage'/);
  assert.match(css, /html\[data-control-theme="modernist"\]/);
  assert.match(css, /#btn-theme-toggle \{ display: inline-flex; \}/);
});

test('keeps the control theme out of broadcast output assets', () => {
  assert.doesNotMatch(read('output.html'), /overlayControlTheme|data-control-theme/);
  assert.doesNotMatch(read('js/output.js'), /overlayControlTheme|data-control-theme/);
  assert.doesNotMatch(read('css/output.css'), /overlayControlTheme|data-control-theme/);
});

test('provides the design-system overlay style gallery without changing style values', () => {
  const html = read('index.html');
  const js = read('js/control.js');
  const css = read('css/control.css');

  assert.match(html, /id="overlay-style-picker" role="radiogroup"/);
  assert.match(html, /id="style-select" hidden aria-hidden="true"/);
  assert.match(js, /const OVERLAY_STYLE_OPTIONS = \[/);
  assert.match(js, /function selectOverlayStyle\(style/);
  assert.match(js, /button\.setAttribute\('role', 'radio'\)/);
  assert.match(js, /overlay-style-render lower-third style-/);
  assert.match(js, /applyStyleAwareLowerThirdBackground\(text/);
  assert.match(css, /\.overlay-style-grid \{/);
  assert.match(css, /\.overlay-style-card\.selected \{/);
  assert.match(css, /\.overlay-style-render\.style-scripture-panel/);
  assert.doesNotMatch(css, /\.style-(?:minimal|outline|gradient|scripture|scripture-panel|split|inline-duo|inline-chip|inline-glass) \.lower-third/);
  assert.doesNotMatch(read('css/output.css'), /\.style-(?:minimal|outline|gradient|scripture|scripture-panel|split|inline-duo|inline-chip|inline-glass) \.lower-third/);
});

test('does not expose the retired custom HTML editor', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /id="use-custom-template"/);
  assert.doesNotMatch(html, /id="template-html"/);
  assert.doesNotMatch(html, /id="template-css"/);
  assert.doesNotMatch(html, />\s*Custom HTML Template\s*</);
});

test('synchronizes complete session settings through the server protocol', () => {
  const js = read('js/control.js');
  assert.match(js, /action: 'session-settings-save'/);
  assert.match(js, /function buildSessionSettingsSnapshot\(/);
  assert.match(js, /msg\.action === 'settings-required'/);
  assert.match(js, /msg\.action === 'session-settings'/);
  assert.match(js, /sessionSettings\?\.overlayModeSettings/);
});

test('uses session IDs as profiles and only offers cross-session transfer', () => {
  const html = read('index.html');
  const js = read('js/control.js');
  assert.match(html, />Session &amp; Sync</);
  assert.match(html, /You do not need to click Save/);
  assert.match(html, /Download Session Setup/);
  assert.match(html, /Import Setup Here/);
  assert.match(html, /Save Preset/);
  assert.match(html, /Export Presets/);
  assert.match(html, /Presets are saved on the server with this session/);
  assert.doesNotMatch(html, /Save as Profile|Apply Selected|Reusable Profiles/);
  assert.match(js, /function exportSessionProfile\(\)/);
  assert.match(js, /function importSessionProfile\(\)/);
  assert.match(js, /profile\.sourceSessionId === SESSION_ID/);
  assert.doesNotMatch(js, /settingsProfiles|SETTINGS_PROFILE_KEY/);
});

test('uses a themed accessible modal when saving content presets', () => {
  const html = read('index.html');
  const js = read('js/control.js');
  assert.match(html, /id="preset-modal" class="session-modal"/);
  assert.match(html, /aria-labelledby="preset-modal-title"/);
  assert.match(js, /function showPresetNameModal\(/);
  assert.match(js, /async function saveCurrentPreset\(\)/);
  assert.match(js, /await showPresetNameModal\(defaultLabel, modeLabel\)/);
  assert.match(js, /presets: \{\s*overlay: cloneJson\(overlayPresets\)/);
  assert.match(js, /await savePresetsOnServer\(\)/);
  assert.match(js, /action: 'session-settings-save'/);
  assert.match(js, /function sendAcknowledgedSessionSave\(/);
  assert.match(js, /async function verifyPresetsOnServer\(/);
  assert.doesNotMatch(js, /fetch\('\/api\/session-presets\?session='/);
  assert.match(html, /id="preset-save-status" role="status" aria-live="polite"/);
});
