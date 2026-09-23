# EtherTransfer

**Created by RUDRA KUMAR**

EtherTransfer is a desktop app for sending files and folders between computers on the same network, or directly over an Ethernet cable. Open it on both machines and they find each other automatically: there are no IP addresses to type and nothing to configure.

It runs on Windows, macOS and Linux, and its interface follows the Windows 11 (Fluent) design, in light or dark mode.

> The releases listed on this page from before this version belong to the earlier Python/PyQt5 `EthernetTransfer.exe`. This repository now holds the source of the new app.

## Features

- **Automatic discovery.** Every computer running EtherTransfer on your network, or on the other end of a cable, appears under *Nearby devices*, labelled Direct cable, Ethernet or Wi-Fi.
- **Files and whole folders.** Drag them onto a device, or select a device and use *Send files* / *Send folder*. Several files and folders can go in one transfer. Folder structure, empty folders included, is recreated on the other side.
- **Encrypted.** Transfers use TLS 1.3, and each device has its own certificate.
- **Verified.** Every file is checked with SHA-256 when it arrives.
- **You decide what arrives.** An incoming transfer asks first and auto-declines after 60 seconds. Mark a device as trusted and its transfers are accepted without asking.
- **Pause, resume and cancel from either side.** A resumed transfer continues from where it stopped. A dropped connection leaves the transfer *Interrupted*, ready to resume.
- **Live throughput** on the Home screen, and a dashboard with history.

## Using it

1. Open EtherTransfer on both computers.
2. Each one shows the other under **Nearby devices**. This takes a few seconds, or up to about half a minute over a fresh direct cable while both sides pick an address.
3. Select the device, then choose **Send files** or **Send folder**, or drag files onto the device.
4. Accept on the other computer. Received files go to `Downloads/EtherTransfer` by default, which you can change in Settings.

### Over a direct cable

Connect the two computers with an Ethernet cable. No router or manual IP setup is needed: both sides assign themselves a link-local address automatically. A USB-to-Ethernet adapter works the same way.

A plain USB cable between two computers does **not** create a network connection, so it can't be used. Thunderbolt networking works where the operating system provides it as a network adapter.

### Firewall

EtherTransfer uses **TCP 47800** for transfers (another free port if that one is taken) and **UDP 47801** for discovery. The Windows installer adds firewall rules for both private and public networks, because Windows treats a direct cable as a public network. When running from source, allow EtherTransfer through the firewall when asked.

### macOS

The app is not signed with an Apple Developer ID, so the first time you open it, right-click it and choose **Open**. When macOS asks whether EtherTransfer may find devices on your local network, choose **Allow**, or discovery won't work.

## Building from source

Requires [Node.js](https://nodejs.org/) 22.

```bash
npm ci
```

Run in development mode:

```bash
npm run dev
```

Build the installer or package for the current platform (output goes to `release/`):

```bash
npm run package
```

This produces an NSIS installer on Windows, a `.dmg` on macOS and an AppImage and `.deb` on Linux. The macOS package has to be built on a Mac.

## Development

```bash
npm test
```

`npm run typecheck`, `npm run lint` and `npm run depcheck` check types, style and module boundaries. CI runs all of them on Windows, macOS and Linux.

| Folder | What lives there |
| --- | --- |
| `src/core` | The transfer engine and discovery, running in its own process |
| `src/main` | The Electron main process: window, tray and native dialogs |
| `src/preload` | The bridge between the interface and the app |
| `src/renderer` | The React interface |
| `src/shared` | Types and the wire protocol shared by all of the above |

## License

Released under the MIT license. See [LICENSE](LICENSE).

## Contact

Maintainer: `rudrakumar07`. Email: `rudrakumar25@iitk.ac.in`
