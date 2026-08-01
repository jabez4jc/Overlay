# Overlay

Overlay is a browser-based lower-third control system for live production with synchronized **Control / PVW / PGM / Output** pipelines, multi-session operation, and ATEM-ready PNG export.

Live demo: `https://overlay.simplifyed.in`

> “Freely you have received; freely give.”  
> - Matthew 10:8

## Quick Start

Requires Node.js 20 or newer. Use the lockfile for a reproducible install:

```bash
npm ci
npm start
```

Run the built-in checks with `npm run check && npm test`.

Open:
- Control UI: `http://localhost:3333/`
- Output window: `http://localhost:3333/output.html?session=<session-id>`

Use the **same session ID** in both windows.

## Core Live Workflow

1. Select mode: `Bible Reference`, `Speaker`, `Custom`, or `Ticker`.
2. Build and validate content in `PVW`.
3. Choose `Cut`, `Swipe`, or `Fade`, then take PVW to `PGM` and Output.
4. Click `CLEAR` to remove active lower-third/ticker output.

Keyboard shortcuts:
- `Enter`: Take to Air
- `Esc`: Clear
- `B`: Bible mode
- `S`: Speaker mode
- `C`: Custom mode
- `T`: Ticker mode
- `O`: Open Output Window
- `H`: Open User Guide

## Session Model

- Every session is isolated via URL: `?session=<id>`.
- Control and Output must share session ID.
- You can run multiple sessions from one server at the same time.
- You can set a custom session at load time (URL/session switcher).
- Appearance and output settings are stored atomically on the server per session and restored when that session is opened again.
- Persistent snapshots are written to `data/sessions/<session-id>.json` by default. Override the directory with `SESSION_DATA_DIR`.
- Connected control panels receive saved-setting changes immediately over the existing WebSocket room. The latest committed change wins.
- Existing browser-only settings initialize a session automatically the first time it is opened on a server with no saved snapshot.
- Live `PGM` visibility is intentionally transient. Saved settings and presets survive a restart; an on-air graphic is not automatically replayed after one.

## Mode Workflows

### Bible Reference

- Set `Book`, `Chapter`, `Verse(s)`, `Translation`, and `Reference Language`.
- Optional toggles:
  - `Hide translation line (Line 2)`
  - `Append translation abbreviation on line 1`
- `Look Up Text` fetches verse text (using configured source/fallback chain).
- `Use verse text as line 2 in output` is intentionally independent from translation visibility.

Recommended runbook:
1. Build reference.
2. Optionally fetch verse text.
3. Confirm line 1/line 2 behavior.
4. Check PVW.
5. Cut to air.

### Speaker

- Enter speaker name (required for meaningful on-air output).
- Role/title is optional.
- Preview first, then cut.

### Custom

- Enter any text to show as a lower-third.
- Choose how many lines the custom text can use.
- Preview first, then take to air.

### Ticker

- Set message, badge, speed, style, position, colors, and size.
- Ticker can be operated independently from lower-third overlays.

## Styling System

### Control UI Design System

The operator interface includes both the **Nocturne** and **Modernist** directions from `Design/Overlay Design System Template`. Nocturne provides the dark compact palette, Inter typography, soft radii, and layered surfaces suited to dim production environments. Modernist provides Archivo typography, high-contrast editorial rules, square geometry, pale surfaces, and a vivid red accent. The header theme switch saves the operator's preference locally and synchronizes it across open control tabs.

Lower-third styles use the template's visual gallery pattern: numbered preview cards, a clear selected state, responsive columns, and arrow-key navigation. Each card is a miniature render using the same lower-third markup and style rules as PVW, PGM, and Output, including the current accent, background, opacity, and direction. The gallery retains the original style identifiers internally, keeping saved presets and output rendering backward compatible.

The control design system is intentionally separate from the rendered output. Lower thirds, ticker themes, saved settings, and logos retain their own broadcast colors and typography, so control-panel design changes do not alter an on-air composition.

### Lower Third Styles

- Includes classic, gradient, scripture/high-capacity, and modern inline variants.
- Supports line-1-only and line-1+line-2 workflows.
- Line 2 multiline can be enabled for longer scripture text.

### Text Effects (Per Line)

Each line (Line 1 / Line 2) supports:
- Font family
- Supported font weight (filtered by selected font)
- Italic
- Font size scale
- Custom color
- Stroke (toggle + color + width)
- Drop shadow (toggle + direction/depth/blur/opacity/color)

### Assets

- `Logo` supports PNG logos with transparency for lower thirds and the standalone output logo.

## Presets and Session Transfer

### Presets

- Reference presets
- Speaker presets
- Ticker presets

Presets are stored in the server-side session snapshot and synchronize to every connected control using that session ID. **Save Preset** reports success only after the server acknowledges its disk write or the client reads the exact preset collection back from `/api/state`. Existing browser-only presets are used to initialize a session when the server has no saved snapshot yet.

Browser storage is a session-scoped cache and migration fallback, not the authoritative store. Back up `data/sessions` (or the configured `SESSION_DATA_DIR`) if session setups must survive machine or container replacement.

### Session Transfer

The current session ID is its saved server-side profile; no separate Save or Load action is required. To reuse a complete setup under another session ID:

1. Open the source session and choose **Download Session Setup**.
2. Open a different target session ID.
3. Choose **Import Setup Here** and select the exported JSON file.

An export cannot be imported back into the same session ID because that session already owns the configuration.

## Output Setup

`Settings -> Output Setup`

### Browser Source Tab

Use this when integrating with OBS/vMix/Wirecast:
1. Copy Output URL.
2. Add as Browser Source.
3. Match source resolution with selected output resolution.
4. Choose keying method:
   - `Transparent` mode for alpha-capable browser pipelines.
   - Blue/Green/Magenta/Custom for chroma-key pipelines.

### ATEM PNG Export Tab

Use this when feeding ATEM media workflow.

- Include/pin current session for export.
- Session-specific URLs are provided.
- Ticker is not included in ATEM PNG export; ATEM PNG output is lower-third graphics only.
- Export endpoints support both alpha models:
  - Premultiplied (ATEM production use)
  - Straight (browser QA/comparison)

Typical endpoints:
- `/atem-live.png` (default export)
- `/atem-live/<session>.png`
- `/atem-live/<session>.png?alpha=premultiplied`
- `/atem-live/<session>.png?alpha=straight`

Recommended ATEM runbook:
1. Pin the active session.
2. Cut lower-third to air.
3. Regenerate if you need immediate refresh.
4. Use premultiplied URL for ATEM key workflow.
5. If mismatch is suspected, compare straight variant first in browser.

Note: premultiplied images can look visually different in standard browser preview; validate in the target switcher/key pipeline.

## Defaults

- Default reference: `John 3:16-18`
- Default translation selector: `None (hide translation)`
- `Hide translation line (Line 2)`: enabled by default
- `Use verse text as line 2`: disabled by default
- Default ticker style: `Dark`
- Default ticker text:  
  `The Live Stream has been restored. Thank you for your patience, and our sincere apologies for the interruption.`
- Settings panel default: collapsed/hidden for faster operation

## Deploy

### Ubuntu (Automated)

```bash
curl -fsSL https://raw.githubusercontent.com/jabez4jc/Overlay/main/scripts/bootstrap_ubuntu_server.sh | sudo bash
```

This bootstrap updates the server, installs required tools, clones/updates repo, and runs the full installer (Node, service, Nginx, HTTPS).

Manual path:

```bash
sudo apt-get update -y && sudo apt-get upgrade -y
sudo apt-get install -y git curl ca-certificates
sudo git clone https://github.com/jabez4jc/Overlay /opt/overlay
cd /opt/overlay
sudo bash scripts/install_ubuntu_server.sh
```

### Coolify

Recommended for reliable ATEM PNG export: **Dockerfile deployment** (not Nixpacks).

- Repo: `https://github.com/jabez4jc/Overlay`
- Branch: `main`
- Build Pack: **Dockerfile**
- Dockerfile Path: `./Dockerfile`
- Port: `3333`

Why Dockerfile mode:
- Uses Playwright official runtime image with Chromium + required OS libraries preinstalled.
- Avoids runtime dependency gaps that cause ATEM PNG to stay in placeholder mode.

Coolify settings:
1. Expose port `3333`.
2. Add domain (for example `overlay.simplifyed.in`).
3. Mount persistent storage at `/app/data/sessions` if session settings and presets must survive container replacement or redeployment.
4. Optional env vars:
   - `ATEM_PNG_MODE=premultiplied`
   - `ATEM_PNG_SESSIONS=<comma-separated-session-ids>` if you want pre-pinned sessions.
   - `SESSION_DATA_DIR=/app/data/sessions` to set the server snapshot directory explicitly.

If you still prefer Nixpacks:
- Keep install command as `npm ci` (do not use `--ignore-scripts`).
- Ensure postinstall logs show Chromium installed.
- If browser download is blocked, ATEM export will remain placeholder-only.

## Troubleshooting

- Preset shows `WebSocket is not connected`:
  - Open the control through the Node server rather than as a local `file://` page.
  - Confirm the header connection indicator is online.
- Preset save is not acknowledged or persisted:
  - Restart the Node process after updating `server.js`; refreshing the browser does not reload backend code.
  - Hard-refresh the control page after updating `js/control.js`.
  - Confirm the service user can write to `SESSION_DATA_DIR`.
  - Check the saved snapshot with `GET /api/state?session=<session-id>` and inspect the server log for disk-write errors.
- Deployed UI does not reflect new CSS or JavaScript:
  - Confirm the deployment is built from the latest `main` commit; a successful backend health check does not prove a later CSS-only commit was included.
  - Restart/redeploy the Node container so it generates new content-hashed asset URLs.
  - The served HTML should reference assets such as `css/control.css?v=<12-character-hash>` with no `__CONTROL_ASSET_VERSION__` placeholder remaining.
- Output not syncing:
  - Confirm same session ID in Control and Output URLs.
  - Confirm active WebSocket connection.
- PVW/PGM vs Output mismatch:
  - Verify mode and active cut state.
  - Confirm the same overlay style and appearance settings are selected.
- ATEM PNG mismatch:
  - Regenerate export.
  - Compare `?alpha=straight` vs `?alpha=premultiplied`.
  - Validate with actual ATEM key settings.
- Mobile UX issues:
  - Keep settings collapsed unless editing.
  - Use User Guide (`H`) for fast-operate workflow.

## Network Security

- Session IDs isolate production lanes; they are not passwords or authentication tokens.
- Run Overlay on a trusted production network or place it behind an authenticated reverse proxy before exposing it to the public internet.
- The server validates session IDs, limits WebSocket payloads and per-session clients, separates control/output roles, and serves only application assets.

## Project Structure

- `index.html` - Control UI
- `output.html` - Output renderer
- `js/control.js` - control logic, synchronization, presets, and session transfer
- `js/output.js` - output rendering logic
- `js/data.js` - Bible data, translation/font metadata
- `css/control.css` - control styles
- `css/output.css` - output styles
- `server.js` - HTTP/WebSocket + ATEM PNG export pipeline
- `test/` - protocol, persistence/restart, security, and UI-contract regression tests
- `Design/Overlay Design System Template/` - retained Modernist and Nocturne design-system source
- `scripts/bootstrap_ubuntu_server.sh` - Ubuntu bootstrap
- `scripts/install_ubuntu_server.sh` - Ubuntu installer

Generated runtime content is intentionally not tracked:

- `node_modules/` - installed dependencies
- `exports/` - generated ATEM PNGs
- `data/sessions/` - server-owned session snapshots; back this directory up separately when needed

## License and Copyright

- Copyright © 2026 **Jabez Vettriselvan**
- License: **AGPL-3.0-only**
- This project remains free software under AGPL-3.0-only.
