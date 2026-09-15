# EtherTransfer — Design Spec

- **Date:** 2026-09-15
- **Status:** Draft, awaiting user review
- **App name:** EtherTransfer

## 1. Summary

EtherTransfer is a cross-platform desktop app (Windows, macOS, Linux) for fast, encrypted file and folder transfer between computers on the same local network or connected by a direct Ethernet cable. Devices find each other automatically. The home screen is a live network map, and a dashboard visualizes device counts and transfer speeds over time.

### Decisions log

| Topic | Decision |
|---|---|
| Network scope | Shared LAN (switch/router, wired or Wi-Fi) **and** direct PC-to-PC cable. No internet transfer. |
| Stack | Electron + Node.js + TypeScript everywhere; React UI |
| Visualizations | Live network map, devices-over-time chart, transfer speed chart, device details panel |
| Security | Receiver Accept/Decline prompt, mutual TLS encryption, optional "trust this device" (auto-accept) |
| v1 transfer features | Folders + multi-file, pause/resume (incl. after disconnect/restart), SHA-256 integrity check |
| Main layout | Map-first home with sidebar; right panel toggles **Network** stats / **Device** details; bottom transfer bar |

### Out of scope for v1

Internet/relay transfers, text/clipboard sending, mobile apps, auto-update, parallel file streams within one transfer, CLI.

### Success criteria

- ≥ 100 MB/s sustained on a gigabit wired link.
- A device appears on the map within 5 s on a LAN and within 10 s on a direct cable, with no manual network configuration on any OS.
- UI stays responsive (no dropped interactions) during a max-speed transfer.
- App memory < 250 MB during a transfer.
- A transfer interrupted by unplugging the cable resumes automatically when reconnected and finishes with every file hash-verified.

## 2. Tech stack

| Concern | Choice |
|---|---|
| Shell | Electron (latest stable), Node ≥ 22 |
| Build | `electron-vite`; packaging with `electron-builder` |
| Language | TypeScript, `strict: true` |
| UI | React, Tailwind CSS, Radix UI primitives |
| State | Zustand |
| Network map | `d3-force` rendered to SVG by React |
| Charts | Recharts |
| mDNS | `bonjour-service` (pure JS) |
| Interface info | Node `os.networkInterfaces()` + `systeminformation` (wired vs wireless) |
| Certificates | `@peculiar/x509` over Node WebCrypto (ECDSA P-256) |
| Logging | `electron-log` (rotating files) |
| Runtime validation | `zod` schemas for wire messages, IPC payloads and JSON state files |
| Boundary enforcement | TypeScript project references + `dependency-cruiser` (see §12) |
| Tests | Vitest, React Testing Library, Playwright (Electron mode) |

No native Node modules, so cross-platform builds need no compiler toolchain.

## 3. Architecture

```
┌──────────────────────── Electron App ─────────────────────────┐
│  Renderer (React)          Main process         utilityProcess │
│  ┌───────────────┐   ipc   ┌──────────────┐     ┌────────────┐ │
│  │ screens/      │◄───────►│ window, tray │◄───►│ core/      │ │
│  │ store/        │         │ dialogs,     │ port│ identity   │ │
│  │ components/   │◄──────────────────────────────►discovery  │ │
│  └───────────────┘  MessagePort (typed API)       │ trust      │ │
│                                                   │ transfer   │ │
│                                                   │ stats      │ │
│                                                   │ settings   │ │
│                                                   └────────────┘ │
└────────────────────────────────────────────────────────────────┘
```

### 3.1 Processes

- **utilityProcess (`core/`)**: all networking, disk I/O, hashing and stats. It is pure Node and **must not import `electron`**, so it can run under plain Node in integration tests. It receives its data directory path as a startup argument.
- **Main process**: creates the window and tray, spawns and supervises the core process, handles OS-only features (file/folder pickers, native notifications, "show in folder", start on login). At startup it creates a `MessageChannelMain`, passes one port to core and one to the renderer, so high-frequency traffic bypasses main. Core also sends a small set of events to main over `parentPort` (incoming offers for notifications, tray badge counts).
- **Renderer**: React UI. `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. The preload script exposes one typed `window.etherTransfer` API built from the shared contract.

### 3.2 Modules in `core/`

Each module has one job and a small public interface. How modules are structured, wired and isolated is defined in §12.

| Module | Responsibility | Depends on |
|---|---|---|
| `identity` | On first run, generates a device ID (UUIDv4), a default display name (hostname) and a self-signed ECDSA P-256 certificate valid for 10 years. Exposes `deviceId`, `name`, `certPem`, `keyPem`, `fingerprint` (SHA-256 of the DER certificate, hex) and `shortId` (first 8 hex chars as `XXXX-XXXX`). | settings (display name) |
| `discovery` | Advertises this device and discovers others. Emits `deviceUp`, `deviceUpdated`, `deviceDown`. Tracks addresses and link type per device, and measures latency. | identity, settings (ignored interfaces, manual devices) |
| `trust` | Trusted-device store keyed by fingerprint. `isTrusted(fp)`, `trust(device)`, `untrust(fp)`, `checkIdentity(deviceId, fp)` → `ok` / `unknown` / `changed`. | — |
| `transfer` | TLS server and client, wire protocol, transfer queue, pause/resume/cancel, resume state, history records. | identity, trust, discovery, settings, stats |
| `stats` | Ring buffers for device count and throughput; per-device latency; range queries for the dashboard. | — |
| `settings` | Loads, validates and updates `settings.json`; emits `changed`. Owns device name, download folder, auto-accept, theme, start-on-login, minimize-to-tray, ignored interfaces, manual devices. | — |

All persistence goes through the `JsonStore` port (§12.3), which provides atomic JSON read/write (temp file → rename) and JSONL append. It is a port, not a module, so no module "depends on storage".

### 3.3 Data directory layout

The directory is Electron's `app.getPath('userData')`.

```
settings.json
identity/key.pem, identity/cert.pem, identity/device.json
trusted-devices.json
transfers/<transferId>.json      # resumable state, one file per unfinished transfer
history.jsonl                    # one line per finished/failed/cancelled transfer
stats/device-count.json          # 24 h of 10 s samples, saved every 60 s
logs/                            # electron-log
```

### 3.4 Shared contract (`src/shared/`)

`ipc-contract.ts` defines every command and event, with types used by core, preload and renderer.

**Commands (renderer → core):** `getSnapshot`, `sendFiles(deviceId, paths[])`, `connectByAddress(address)`, `respondToOffer(offerId, accept, trustDevice)`, `pauseTransfer(id)`, `resumeTransfer(id)`, `cancelTransfer(id)`, `retryTransfer(id)`, `discardTransfer(id)`, `setTrusted(deviceId, trusted)`, `getSettings`, `updateSettings(patch)`, `getStats(range: '15m' | '1h' | '24h')`, `getDiagnostics`.

**Commands (renderer → main):** `pickFiles`, `pickFolder`, `showInFolder(path)`, `setStartOnLogin(bool)`.

**Events (core → renderer):** `devices:changed`, `transfer:updated`, `offer:incoming`, `offer:closed`, `stats:tick` (at most 2 Hz), `core:status`.

## 4. Discovery and connection

### 4.1 Announcing and finding devices

Two mechanisms run together. Results are merged by `deviceId`.

1. **mDNS / DNS-SD** via `bonjour-service`: service type `_ethertransfer._tcp`. TXT record fields: `id`, `name`, `os`, `ver` (protocol version), `port`, `fp` (full fingerprint), `link` (`wired` / `wireless`).
2. **UDP beacon** every 2 s on UDP port **47801**, carrying JSON `{ v, id, name, os, port, fp, link }` and sent to:
   - IPv4 multicast `239.255.77.77`
   - each IPv4 interface's broadcast address
   - IPv6 `ff02::1` scoped to each interface

Sockets are bound per interface, so the receiving interface is always known. Interfaces listed in the user's "ignored interfaces" setting (e.g. a VPN) are skipped.

**Presence.** A device is online while it has been heard from (beacon or mDNS) within the last 6 s. After 6 s of silence, `deviceDown` is emitted. The UI shows it greyed out for 4 s, then removes it.

**Interface changes.** `os.networkInterfaces()` is polled every 3 s. On any change (cable plugged or unplugged, Wi-Fi switch), per-interface sockets are rebuilt and the mDNS advertisement is refreshed.

### 4.2 Link type classification

Every address a device is reachable at gets a link type:

- **`direct`**: the local interface the packet arrived on has **only** link-local addresses (`169.254.0.0/16`, `fe80::/10`), meaning no router or DHCP is present. UI label: "Direct cable".
- **`wireless`**: the local interface is wireless (per `systeminformation`) **or** the remote beacon reports `link: wireless`.
- **`wired`**: otherwise. UI label: "LAN".

Note: every interface has an `fe80::` address, including on normal LANs. Classification is therefore based on the *local interface's* addresses, never on the remote address alone.

A device's overall link type is its best address: `direct` > `wired` > `wireless`.

### 4.3 Connecting

When sending, the client tries the device's addresses in priority order with a 2 s connect timeout each:

1. `direct`: IPv6 link-local with scope (`fe80::…%<iface>`) first, then `169.254.x.x`.
2. `wired`: IPv4 first, then IPv6.
3. `wireless`: IPv4 first, then IPv6.

IPv6 link-local is preferred on a direct cable because it exists immediately on every OS, while IPv4 self-assignment can take up to a minute and is disabled by default on some Linux setups.

**TCP port.** Transfers use **47800**. If that port is taken, a random free port is used and advertised.

**Connect by address.** For when discovery is blocked. The user enters an IP or `host:port`.

- The client connects and exchanges `HELLO`. With no discovery fingerprint to compare, the server certificate is accepted on first use, subject to `trust.checkIdentity` (§4.4).
- The device is added to the list, marked `manual`, with its link type derived per §4.2.
- Manual devices are saved in `settings.json` and pinged over UDP (§4.5). A `pong` counts as being heard from for presence (§4.1), so they stay online without beacons.

### 4.4 Mutual TLS and identity pinning

- The receiver is the TLS server and the sender is the client. Both present their self-signed certificates (`requestCert: true`, `rejectUnauthorized: false`). CA validation is replaced by fingerprint checks.
- **The client** verifies that the server certificate fingerprint equals the `fp` from discovery (manual devices: the fingerprint seen on first connect). Mismatch → abort.
- **Both sides** call `trust.checkIdentity(deviceId, fingerprint)`:
  - `ok` / `unknown` → continue. An unknown sender triggers the prompt.
  - `changed` (this device ID is trusted under a different fingerprint) → abort. The UI shows "This device's identity changed", and the user must explicitly re-trust it. It is never silently accepted.
- TLS 1.3 only.

### 4.5 Latency

Every 5 s, each online device is sent a UDP `ping {id, nonce, t}` on port 47801. The reply `pong` gives the RTT, which is stored in `stats` as a per-device latency series (last 10 min).

### 4.6 OS-specific setup

- **Windows:** the NSIS installer adds an inbound firewall rule for the EtherTransfer executable (TCP 47800, UDP 47801) for the **private and public** profiles, restricted with `remoteip=localsubnet`. The public profile is required because Windows classifies a direct-cable link as an "Unidentified network" (public). The uninstaller removes the rule.
- **macOS:** `Info.plist` includes `NSLocalNetworkUsageDescription` and `NSBonjourServices = ["_ethertransfer._tcp"]` for the macOS 15+ local network permission prompt.
- **Linux:** no installer changes. The troubleshooting helper shows `ufw` / `firewalld` commands.
- **All platforms:** if no devices are found within 15 s of launch, a "Can't see your device?" helper appears with OS-specific firewall tips, cable tips and the Connect-by-address field.

## 5. Transfer protocol

### 5.1 Framing

A transfer uses one TLS connection. Each frame is:

```
[type: uint8][length: uint32 big-endian][payload: length bytes]
```

- Control frames carry UTF-8 JSON with a **max payload of 1 MiB**. Larger frames close the connection with `ERROR {code: 'frame-too-large'}`.
- `DATA` frames carry raw bytes with a max payload of 1 MiB (the chunk size).

### 5.2 Messages

| Code | Type | Direction | Payload |
|---|---|---|---|
| 0x01 | `HELLO` | both, first frame | `{protocolVersion: 1, appVersion, deviceId, name, os}` |
| 0x02 | `OFFER` | S→R | `{transferId, items: Item[], totalBytes, fileCount}` |
| 0x03 | `RESUME` | S→R | `{transferId}` |
| 0x04 | `ACCEPT` | R→S | `{offsets: Record<index, bytes>}` |
| 0x05 | `DECLINE` | R→S | `{reason: 'user' \| 'timeout' \| 'busy' \| 'insufficient-space' \| 'unknown-transfer'}` |
| 0x06 | `RESUME_REQUEST` | R→S, on a receiver-initiated connection | `{transferId}` |
| 0x10 | `FILE_START` | S→R | `{index, offset, size, mtimeMs}` |
| 0x11 | `DATA` | S→R | raw bytes |
| 0x12 | `FILE_END` | S→R | `{index, sha256}` (hex) |
| 0x13 | `FILE_OK` | R→S | `{index}` |
| 0x14 | `FILE_RETRY` | R→S | `{index}` |
| 0x15 | `FILE_FAILED` | both | `{index, reason}` |
| 0x20 | `PAUSE` | both | `{}` |
| 0x21 | `CANCEL` | both | `{}` |
| 0x22 | `DONE` | S→R | `{}` |
| 0x7F | `ERROR` | both | `{code, message}` |

`Item = {index, relPath, kind: 'file' | 'dir', size, mtimeMs}`. `relPath` uses `/` separators. Directories (including empty ones) are listed as `kind: 'dir'`.

**Version check.** If the `HELLO` `protocolVersion` majors differ, the connection closes with `ERROR {code: 'incompatible-version'}`. The UI says "Update EtherTransfer on <device name>".

### 5.3 Flow

```
Sender                                   Receiver
  │── HELLO ───────────────────────────────►│
  │◄─────────────────────────────── HELLO ──│
  │── OFFER / RESUME ──────────────────────►│  prompt (or auto-accept if trusted)
  │◄──────────────────── ACCEPT / DECLINE ──│
  │  for each file item, in index order:    │
  │── FILE_START {index, offset} ──────────►│  truncate .part to offset
  │── DATA × n ────────────────────────────►│
  │── FILE_END {sha256} ───────────────────►│  compare hashes
  │◄──────────── FILE_OK / FILE_RETRY ──────│
  │── DONE ────────────────────────────────►│
```

Directory items are created by the receiver on ACCEPT, before any files.

### 5.4 Receiving an offer

1. **Validate every `relPath`** and reject the whole offer with `ERROR {code: 'invalid-path'}` if any path:
   - is empty or absolute, or contains `..` segments or backslashes
   - contains characters invalid on Windows (`< > : " | ? *`, control characters)
   - uses a Windows reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COM1–9`, `LPT1–9`), with or without an extension
   - ends with a space or a dot
   - resolves outside the destination root after `path.resolve`

   These rules apply on every OS, so any transfer can land on any OS.
2. **Busy check.** If a prompt from this device is already pending, or 3 incoming transfers are active → `DECLINE busy`.
3. **Space check.** If free space (`fs.statfs`) at the destination is below `totalBytes + 100 MiB` → `DECLINE insufficient-space`.
4. **Trust check.** If the sender is trusted and "auto-accept from trusted devices" is on (default: on) → accept. Otherwise emit `offer:incoming`, and main shows a native notification when the window is hidden or unfocused.
5. **Prompt.** Shows the sender name, OS, link type, `shortId`, a top-level item summary (folders with file counts, files with sizes), the total size, the destination (changeable), and an "Always accept from this device" checkbox. It auto-declines after **60 s** (`DECLINE timeout`).
6. On accept, the receiver writes `transfers/<transferId>.json` (manifest, destination root, sender `deviceId` and fingerprint, per-file status) and replies `ACCEPT` with all offsets `0`. The sender's state file holds the manifest, absolute source paths, the recorded `size`/`mtimeMs` per file, the receiver `deviceId` and fingerprint, and per-file status.

**Destination.** `settings.downloadDir`, default `<user Downloads>/EtherTransfer`.

### 5.5 Writing files

- Incoming data is written to `<finalPath>.etpart` using a stream with backpressure (1 MiB `highWaterMark`).
- On `FILE_OK`, the file is renamed to its final name. If the name is taken, `name (1).ext`, `name (2).ext`, … is used, chosen at rename time. `mtime` is set with `fs.utimes`.
- The receiver state file is updated at each file boundary and at least every 5 s.

### 5.6 Integrity

- The sender computes SHA-256 incrementally while reading; the receiver computes it incrementally while writing.
- Mismatch → the receiver truncates `.etpart` to 0 and sends `FILE_RETRY`, and the sender resends from offset 0.
- A second mismatch → `FILE_FAILED {reason: 'hash-mismatch'}`. The `.etpart` file is deleted and the transfer continues with the next file.

### 5.7 Pause, resume, interruption

**Pause.** Either side sends `PAUSE`, and both close the connection cleanly. State files remain and the status becomes `paused`, recording which side paused. Only the side that paused can resume, using the Resume button:

- **Sender paused:** the sender reconnects and sends `RESUME`, as below.
- **Receiver paused** (including a pause caused by `ENOSPC`): the receiver opens a TLS connection to the sender's server (same identity checks as §4.4), sends `HELLO` then `RESUME_REQUEST {transferId}`, and closes. The sender then starts a normal `RESUME`. If the sender is unreachable, the transfer stays `paused`, and the sender picks it up automatically on its next `deviceUp` for that receiver.

**Resume.** The sender connects and sends `HELLO`, then `RESUME {transferId}`.

1. The receiver checks the transfer exists and that the sender fingerprint matches the one stored in its state. If not → `DECLINE unknown-transfer`.
2. The receiver computes offsets from the **actual byte size of each `.etpart` file on disk**. Verified files are omitted, and missing `.etpart` files get offset 0.
3. For each remaining file, the sender compares the current `size` and `mtimeMs` with its state:
   - **Unchanged:** `FILE_START {offset}` using the receiver's offset.
   - **Changed:** `FILE_START {offset: 0, size, mtimeMs}` with the new values. The receiver updates the item and its `totalBytes`.
   - **Missing:** `FILE_FAILED {reason: 'source-missing'}`.
4. **Hash rebuild.** With a non-zero offset, both sides re-read bytes `0..offset` from local disk (source file or `.etpart`) to rebuild the hash state before streaming continues.

**Interruption.** If the socket closes without `PAUSE`, `CANCEL` or `DONE`, both sides mark the transfer `interrupted`. The sender auto-resumes when the device's `deviceUp` fires, and also retries on a backoff of 2 s, 5 s, 15 s, 30 s, then every 30 s up to 10 min total. After that it stays `interrupted` until the user clicks Resume. After an app restart, `interrupted` and `paused` transfers are loaded from `transfers/*.json`.

**Cancel.** Either side sends `CANCEL`. The receiver deletes all `.etpart` files for that transfer, both sides delete the state file, and a history record is written with status `cancelled`.

**Discard.** Removes an interrupted or paused transfer locally, deleting the state file and, on the receiver, the `.etpart` files.

### 5.8 Queueing and limits

- Up to **3** outgoing and **3** incoming transfers can be active at once. Extra outgoing transfers wait in the queue.
- On `DECLINE busy`, the sender re-queues the transfer and retries after 10 s, up to 5 times, then marks it `failed` ("Device busy").
- Within one transfer, files are sent sequentially.

### 5.9 Transfer states

`queued → awaiting-accept → active ⇄ paused`

- `active → interrupted → active`
- `active → completed` (all files verified) or `completed-with-errors` (at least one file failed)
- `awaiting-accept → declined`
- any state → `cancelled`

## 6. Stats

| Series | Resolution | Retention | Persisted |
|---|---|---|---|
| Devices online count | 10 s | 24 h (8,640 samples) | yes, every 60 s |
| Throughput, sent and received (bytes/s) | 500 ms | 15 min | no |
| Throughput, sent and received | 10 s buckets | 24 h | no |
| Latency per device | 5 s | 10 min | no |

- **Dashboard ranges.** `15m` uses 500 ms throughput; `1h` and `24h` use 10 s buckets.
- **Per-device data totals** are computed from `history.jsonl`, plus live progress of active transfers within the range.
- **`stats:tick`** is emitted at most twice per second. It contains current speed, online count and active-transfer progress.

## 7. UI

### 7.1 Home screen

- **Sidebar:** Home, Transfers, Dashboard, Settings. Transfers shows a badge with the active count.
- **Network map** (centre):
  - `d3-force` layout with "You" fixed at the centre. Radial forces place devices on rings by link type: direct cable on the inner ring, LAN in the middle, Wi-Fi on the outer ring.
  - Node icon by OS; label shows name, link type and latency.
  - Link line styles: green solid = direct cable, blue solid = LAN, orange dashed = Wi-Fi.
  - **Active transfer:** animated dashes along the link, stroke width scaled between 2 and 6 px by current speed.
  - **Appear:** fade + scale in over 300 ms. **Gone:** grey for 4 s, then fade out.
  - **Hover:** tooltip. **Click:** selects the device and switches the right panel to Device view.
  - **Drop files or folders on a node:** starts `sendFiles`, with paths from `webUtils.getPathForFile`.
  - A legend sits under the map. Header: "N devices nearby" and a "+ Connect by address" button.
- **Right panel** with a Network / Device segmented toggle:
  - **Network** (default when nothing is selected):
    - devices-online tile with a sparkline of the last 30 min
    - speed-now tile with a sparkline of the last 60 s
    - sent-today and received-today tiles
  - **Device:**
    - name, OS, trust switch, `shortId`
    - addresses grouped by link type
    - latency sparkline for the last 10 min
    - last 5 transfers
    - "Send files…" and "Send folder…" buttons
- **Bottom transfer bar:** visible only while transfers are active or paused. Shows the most recent active transfer (direction, device, progress bar, %, speed, ETA, Pause/Resume) and "+N more". Clicking it opens Transfers.
- **Empty state:** after 15 s with no devices, the troubleshooting helper (§4.6).

### 7.2 Transfers screen

- Two sections: **Active** (queued, awaiting-accept, active, paused, interrupted) and **History** (from `history.jsonl`, newest first, filterable by device and status).
- Each transfer row shows direction, device, item summary, progress, speed, ETA and state, plus actions: Pause, Resume, Cancel, Retry (for failed or declined), Discard (interrupted), Show in folder.
- Expanding a row lists every file with its state: queued / sending / verifying / verified / failed (with reason).

### 7.3 Dashboard screen

- A range selector (15 min / 1 hour / 24 hours) applies to all charts.
- **Devices online over time:** Recharts step-area chart.
- **Throughput:** Recharts area chart with sent (green) and received (blue) series, in MB/s.
- **Data transferred per device:** horizontal bar chart, bars coloured by the device's current link type.

### 7.4 Incoming offer prompt

A modal dialog as described in §5.4, with a countdown and Decline / Accept buttons. Several pending offers from different devices are stacked, and the oldest is shown first.

### 7.5 Settings

- Device name
- Download folder
- Auto-accept from trusted devices
- Trusted devices list, with remove buttons
- Theme: system / light / dark
- Start on login
- Minimize to tray on close
- Ignored network interfaces
- "Copy diagnostics": app version, OS, interfaces and link types, discovered devices, and the last 200 log lines

### 7.6 Visual style

- Light and dark themes follow the system by default.
- Link colours are the same in both themes: cable `#34c759`, LAN `#0a84ff`, Wi-Fi `#ff9f0a`.
- All interactive elements are keyboard-accessible (Radix primitives).

## 8. Error handling

| Situation | Behaviour |
|---|---|
| Network interface change | Rebuild sockets within 3 s (§4.1) |
| mDNS failure | Log a warning and continue with UDP beacons |
| Port 47800 in use | Use a random free port and advertise it |
| Fingerprint mismatch / identity changed | Abort, show a warning, require explicit re-trust (§4.4) |
| Connect timeout on all addresses | Transfer `failed` ("Couldn't reach <device>"), with a Retry button |
| Connection drop | `interrupted` + auto-resume (§5.7) |
| `ENOSPC` on receiver | Send `PAUSE`, state `paused`, message "Free up X to continue" |
| `EACCES` / `EPERM` on destination | Transfer `failed` ("Can't write to <folder>"), offer to change the folder |
| Source file missing | `FILE_FAILED source-missing`, continue |
| Hash mismatch twice | `FILE_FAILED hash-mismatch`, continue |
| Invalid path in offer | Reject the offer, log the sender fingerprint |
| Oversized frame / malformed JSON | `ERROR`, close connection |
| Protocol version mismatch | `ERROR incompatible-version`, friendly message |
| Core process crash | Main restarts it within 1 s and the renderer shows a "Reconnecting…" banner. Transfers reload from state files as `interrupted`. After 3 crashes within 60 s, stop restarting and show an error screen with "Copy diagnostics". |
| Corrupt JSON state file | Rename it to `*.corrupt`, log it, continue without it |

All state writes are atomic (temp file + rename). Errors are logged through `electron-log`. Logs never contain file contents or private keys. "Copy diagnostics" only runs when the user clicks it, and it replaces the user's home directory path with `~`.

## 9. Testing

### 9.1 Unit (Vitest)

- Frame encoder/decoder: split and merged TCP chunks, max sizes, malformed input.
- Path validator: table of valid and malicious paths (§5.4).
- Conflict renaming (`name (1).ext`, dotfiles, names without an extension).
- Link type classification from mocked interface tables (§4.2).
- Device merging across mDNS and beacons, and the presence timeout (fake timers).
- Resume offset computation and changed-source detection.
- Stats ring buffers and range queries.
- Trust store `checkIdentity`.
- `JsonStore` adapter: atomic writes and corrupt-file handling.
- Settings validation and defaults.

### 9.2 Integration (Vitest, plain Node, no Electron)

Two `core` instances in one process on loopback, each with its own temporary data and download directories:

- Folder tree transfer (nested and empty directories, 0-byte file, 50 MB file). All hashes match and mtimes are preserved.
- Decline, timeout and busy paths.
- Pause then resume, with correct final bytes.
- Socket destroyed mid-file, then auto-resume.
- Core restarted mid-transfer (reload from state), then resume.
- Injected corrupted chunk → one retry → success. Persistent corruption → `hash-mismatch`.
- Source file modified during pause → restarts from 0 with the new size.
- Fingerprint mismatch → abort. Identity changed → abort.
- Simulated `ENOSPC` through an injected write-stream factory → paused.

### 9.3 UI

- React Testing Library: panel toggle, offer prompt countdown, transfer row actions, map node enter/exit (map as a pure component given device props).
- Playwright (Electron): launch the app with a fake core that emits scripted events. Checks that devices appear on the map, the prompt accepts, the transfer bar shows progress, and the dashboard renders.

### 9.4 CI

GitHub Actions matrix on `windows-latest`, `macos-latest` and `ubuntu-latest`: typecheck (all TS projects), lint, `dependency-cruiser` boundary check (§12.7), unit, integration, and a packaging dry run. Any boundary violation fails the build.

### 9.5 Manual hardware checklist

- Direct cable for each OS pair: Win↔Mac, Win↔Linux, Mac↔Linux. The device must appear within 10 s.
- LAN through a switch; LAN through a router with Wi-Fi on one side.
- Wi-Fi and cable connected at the same time (cable is preferred).
- Unplug the cable mid-transfer, replug, and confirm auto-resume.
- First-run firewall and permission prompts on each OS.
- A single 50 GB file (measure ≥ 100 MB/s on gigabit); a folder of 100,000 small files.
- Kill the app mid-transfer, relaunch, resume.

## 10. Packaging

- **Windows:** NSIS installer for x64 and arm64, with the firewall rule from §4.6. Unsigned builds show a SmartScreen warning; code signing is optional for v1.
- **macOS:** universal `.dmg` (x64 + arm64). Notarization requires a paid Apple Developer account; unsigned builds need right-click → Open on first launch.
- **Linux:** `.AppImage` and `.deb` for x64 and arm64.
- **App ID:** `com.ethertransfer.app`. Product name: `EtherTransfer`.

## 11. Project layout

```
ethertransfer/
├─ src/
│  ├─ shared/                    # no runtime deps except zod
│  │  ├─ ipc-contract.ts         # commands + events, zod schemas, inferred types
│  │  ├─ protocol.ts             # wire message codes + zod schemas
│  │  ├─ typed-emitter.ts        # tiny dependency-free typed event emitter
│  │  └─ types.ts                # Device, Transfer, LinkType, StatsRange, ...
│  ├─ core/
│  │  ├─ ports/                  # interfaces for every side effect (§12.3)
│  │  ├─ adapters/node/          # real implementations of ports (Node, bonjour, si, x509)
│  │  ├─ settings/  identity/  trust/  stats/
│  │  ├─ discovery/              # internal layout in §12.4
│  │  ├─ transfer/               # internal layout in §12.4
│  │  ├─ api/                    # maps ipc-contract commands/events to module services
│  │  └─ index.ts                # composition root: build adapters → modules → api → port
│  ├─ main/
│  │  ├─ core-host.ts            # spawn/supervise utilityProcess, MessageChannelMain
│  │  ├─ window.ts  tray.ts  notifications.ts  dialogs.ts
│  │  └─ index.ts                # composition root for main
│  ├─ preload/
│  │  └─ index.ts                # exposes typed window.etherTransfer, nothing else
│  └─ renderer/
│     ├─ api/                    # the ONLY code that touches window.etherTransfer
│     ├─ store/                  # slices: devices, transfers, offers, stats, settings, ui
│     ├─ features/
│     │  ├─ home/                # HomeScreen, RightPanel, TransferBar
│     │  ├─ transfers/           # TransfersScreen, TransferRow, FileList
│     │  ├─ dashboard/           # DashboardScreen
│     │  ├─ settings/            # SettingsScreen
│     │  └─ offers/              # OfferPrompt
│     ├─ components/
│     │  ├─ map/                 # NetworkMap + useForceLayout (only place importing d3-force)
│     │  ├─ charts/              # Sparkline, StepChart, AreaChart, BarChart (only place importing recharts)
│     │  └─ ui/                  # Button, Tile, SegmentedToggle, ProgressBar, Dialog (Radix wrappers)
│     └─ App.tsx
├─ build/                        # icons, NSIS include, entitlements, Info.plist additions
├─ tests/
│  ├─ fakes/                     # in-memory implementations of every core port
│  ├─ unit/  integration/  e2e/
├─ tsconfig.shared.json  tsconfig.core.json  tsconfig.main.json
├─ tsconfig.preload.json  tsconfig.renderer.json
└─ .dependency-cruiser.cjs
```

## 12. Modularity rules

These rules are mandatory. §12.7 describes how they are enforced, so they can't quietly erode.

### 12.1 Layers and allowed imports

| Layer | May import | Must NOT import |
|---|---|---|
| `shared/` | `zod` | anything else in `src/`, Node built-ins, `electron`, DOM |
| `core/<module>/` | `shared/`, `core/ports/`, the **`index.ts`** of modules it depends on (§3.2 table), `zod`, Node non-I/O built-ins (`node:crypto` for hashing and UUIDs, `node:path`, `node:stream`) | `electron`, `main/`, `preload/`, `renderer/`, `core/adapters/`, other third-party libraries, Node I/O built-ins (`fs`, `net`, `tls`, `dgram`, `os`, `child_process`) |
| `core/adapters/` | `core/ports/`, `shared/`, Node built-ins, third-party libraries | `core/<module>/`, `electron` |
| `core/api/` | `shared/`, module `index.ts` files | adapters, module internals |
| `core/index.ts` (composition root) | anything in `core/`, `shared/` | `electron`, `main/`, `renderer/` |
| `main/` | `shared/`, `electron`, Node built-ins | `core/` (it spawns the bundled core entry file by path only), `renderer/`, `preload/` |
| `preload/` | `shared/`, `electron` (`contextBridge`, `ipcRenderer`) | `core/`, `main/`, `renderer/` |
| `renderer/` | `shared/`, `renderer/*`, browser APIs, UI libraries | `core/`, `main/`, `preload/`, `electron`, Node built-ins |

Inside `renderer/` the direction is `features → store → api → shared`, and `features → components`:

- `components/` are presentational (props in, callbacks out). They must not import `store/`, `api/` or `features/`.
- `store/` must not import `features/` or `components/`.
- `features/` must not import each other's internals. Anything two features need moves to `components/` or `store/`.

The module dependency graph in §3.2 must stay **acyclic**:

- `settings`, `trust` and `stats` depend on no other module.
- `identity` depends on `settings`.
- `discovery` depends on `identity` and `settings`.
- `transfer` sits at the top.

A new dependency that isn't in the §3.2 table requires updating this spec first.

### 12.2 Public API per module

- Every folder under `core/` exposes exactly one entry point, `index.ts`. Other code may only import that file. **Deep imports are forbidden**, e.g. `core/transfer/session/sender-session`.
- `index.ts` exports a factory function, the service interface, event types and data types. Nothing else. Example:

  ```ts
  export interface TransferService {
    send(deviceId: DeviceId, paths: string[]): Promise<TransferId>;
    pause(id: TransferId): Promise<void>;
    resume(id: TransferId): Promise<void>;
    cancel(id: TransferId): Promise<void>;
    list(): TransferSnapshot[];
    events: TypedEmitter<TransferEvents>;
  }
  export function createTransferService(deps: TransferDeps): TransferService;
  ```
- Modules talk to each other only through these service interfaces and their typed events (`TypedEmitter` from `shared/typed-emitter.ts`). No module reads or mutates another module's internal state.
- **No singletons or module-level mutable state.** Every stateful thing is created by a factory and passed in as a dependency.

### 12.3 Side effects behind ports (dependency injection)

Every interaction with the outside world goes through an interface in `core/ports/`. Real implementations live in `core/adapters/node/`, and in-memory fakes live in `tests/fakes/`.

| Port | Covers | Real adapter uses |
|---|---|---|
| `Clock` | `now`, timers | `Date`, `setTimeout` |
| `FileSystem` | read/write streams, stat, statfs, rename, utimes, mkdir, rm, truncate | `node:fs` |
| `TlsTransport` | listen, connect, peer fingerprint | `node:tls` |
| `UdpTransport` | per-interface bind, send, multicast join | `node:dgram` |
| `InterfaceProvider` | local interfaces with addresses and wired/wireless type | `node:os` + `systeminformation` |
| `Platform` | hostname, OS name/version, app version, data directory | `node:os` + startup arguments |
| `MdnsProvider` | advertise, browse | `bonjour-service` |
| `CertificateFactory` | create key + self-signed cert, compute fingerprint | `@peculiar/x509` + WebCrypto |
| `JsonStore` | atomic read (zod-validated) / write / JSONL append | `FileSystem` port |
| `Logger` | debug/info/warn/error | `electron-log/node` (works inside utilityProcess without importing `electron`) |
| `CorePort` | message in/out to main and renderer | `process.parentPort` + `MessagePort` |

Factories receive only the ports and services they need, e.g. `createDiscoveryService({ clock, udp, mdns, interfaces, identity, settings, logger })`. Composition roots (`core/index.ts`, `main/index.ts`) are the only places that construct adapters and wire them together. Swapping an implementation (a fake network in tests, a different mDNS library) changes one line in the root and nothing else.

### 12.4 Inside a module: pure logic, orchestration, protocol

Larger modules separate **pure logic** (no I/O, no timers, no ports) from **orchestration** (uses ports, holds state).

```
core/discovery/
├─ index.ts
├─ service.ts                 # merges sightings, presence tracking, emits events
├─ sources/
│  ├─ source.ts               # interface DiscoverySource { start(onSighting); stop() }
│  ├─ mdns-source.ts
│  └─ beacon-source.ts
├─ latency.ts                 # UDP ping/pong
└─ logic/                     # pure
   ├─ link-type.ts            # §4.2 classification
   ├─ device-merge.ts         # merge sightings by deviceId, address priority (§4.3)
   └─ presence.ts             # online/offline decision from last-seen timestamps

core/transfer/
├─ index.ts
├─ service.ts                 # queue, limits, lifecycle, auto-resume, history
├─ server.ts  client.ts       # TLS listen/connect via TlsTransport, identity checks
├─ session/
│  ├─ sender-session.ts       # state machine for one outgoing connection
│  └─ receiver-session.ts     # state machine for one incoming connection
├─ protocol/                  # pure
│  ├─ framing.ts              # bytes ↔ frames, incremental decoder
│  └─ codec.ts                # frame ↔ typed message using shared/protocol.ts schemas
├─ state/
│  └─ transfer-state.ts       # load/save resumable state via JsonStore
└─ logic/                     # pure
   ├─ path-validator.ts       # §5.4 rules
   ├─ conflict-name.ts        # name (1).ext
   ├─ resume-plan.ts          # offsets + changed/missing source decisions (§5.7)
   └─ transitions.ts          # allowed state transitions (§5.9)
```

Rules:

- `logic/` and `protocol/` files are pure functions or pure classes. They may import only `shared/` and other pure files, and they must reach 100% branch coverage in unit tests.
- Extension points use small interfaces. Example: adding a third discovery mechanism means adding one `DiscoverySource` file and registering it in the root, with no change to `service.ts`.
- A new wire message is one schema in `shared/protocol.ts`, one codec case, and a handler in the relevant session.

### 12.5 Renderer modularity

- `renderer/api/` wraps `window.etherTransfer` in typed functions and a single event subscription. Nothing else touches the preload global, so the whole UI can run against a fake API in tests and Playwright.
- `store/` has one Zustand slice per domain. Each slice subscribes to its events in one place (`store/bridge.ts`), and selectors are exported next to their slice.
- Screens in `features/` connect store data to presentational components.
- Chart and map components accept **plain data arrays and callbacks**, never store objects or API types. Recharts is imported only inside `components/charts/` and d3-force only inside `components/map/`, so either library can be replaced by editing one folder.
- Radix primitives are wrapped once in `components/ui/`; features use the wrappers, not Radix directly.

### 12.6 Size and naming conventions

- **One responsibility per file.** ESLint `max-lines` warns at 300 lines, and `max-lines-per-function` warns at 60. Crossing either is a signal to split.
- **File names:** `kebab-case.ts`; React components `PascalCase.tsx`. Factories are named `createXxx`, and interfaces are named after the role (`TransferService`), not the implementation.
- **Types over enums:** use string-literal unions defined in `shared/types.ts`.
- **Validation at trust boundaries:** zod schemas at every boundary (wire messages, IPC payloads, JSON files, discovery beacons). Internal functions receive already-validated types.

### 12.7 Enforcement

- **TypeScript project references.** Each layer has its own `tsconfig`:
  - `tsconfig.renderer.json` uses the DOM lib and no Node types.
  - `tsconfig.core.json` uses Node types, no DOM, and does not resolve `electron`.
  - `tsconfig.shared.json` uses neither.

  An import across a forbidden boundary then fails to compile.
- **`dependency-cruiser`.** `.dependency-cruiser.cjs` encodes every rule in §12.1 and §12.2: layer rules, no deep imports into `core/<module>/`, no cycles, third-party libraries only in their designated folders, and the renderer's internal direction. It runs in CI and in a pre-commit `lint` script.
- **Code review checklist.** Every new side effect gets a port. Every new module gets an `index.ts` and a factory. Every new pure rule goes in `logic/` with tests.
