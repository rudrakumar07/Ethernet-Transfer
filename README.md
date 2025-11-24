# EthernetTransfer (Single EXE release)

This repository is intended to host a single Windows executable (`EthernetTransfer.exe`) built from the project. It contains only the distributable binary — no source code.

Use this README as the front page for the release repository. Replace the badge/links as needed.

## About

EthernetTransfer is a compact peer-to-peer file transfer application for Windows designed to send files and folders over a direct Ethernet link. This release provides a single-file, double-clickable Windows executable that does not require Python to be installed on the target machine.

## Download

- Download `EthernetTransfer.exe` from release given below

## Integrity (SHA256)

Verify the downloaded file's SHA256 checksum before running it. The checksum for the current `dist\EthernetTransfer.exe` is:

```
SHA256: C30842F1A5CC19BAB1E408307C3C662D153B994651971C9D623A43B8D310691D
```

To verify on Windows (PowerShell):

```powershell
Get-FileHash -Algorithm SHA256 .\EthernetTransfer.exe
```

Compare the outputted `Hash` value to the value above.

## Quick Usage

1. Copy `EthernetTransfer.exe` to each Windows machine you want to use.
2. Run the executable (double-click). The GUI will open.
3. Choose `Host` (send) on the machine that has the files and `Receiver` (listen) on the other.
4. Use `Select Folder` (or `Select Files`) and press `Send`.

Notes:
- For features that modify IP configuration (Configure / Reset IP) the app will need Administrator privileges. When those features are used, run the EXE as Administrator.
- If Windows blocks the app on first run, you may need to allow it in the Defender / SmartScreen dialog or unblock it from the file properties.

## Troubleshooting

- If the app complains about missing Qt platform plugins on another machine, rebuild with PyInstaller including the `PyQt5` plugin folder or consult the original source repository for the exact `--add-data` paths used.
- If the app does not start and shows no window, run from PowerShell to see any stderr messages:

```powershell
.\EthernetTransfer.exe
```

## License

released under the MIT license

## Contact

Maintainer: `rudrakumar07` — email: `rudrakumar25@iitk.ac.in`

---
