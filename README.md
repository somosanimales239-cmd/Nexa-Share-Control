# NexaShareControl 1.1.0

NexaShareControl is a separate Windows desktop-control application. It is intentionally isolated from the stable Nexa AI Local Bridge, Nexa Local, Browser Relay, SFTP, GitHub, and Unity integrations.

## 1.1.0: Multi-Source Share Picker

The Share Sources area can select and share multiple sources simultaneously:

- entire monitor(s)
- running application(s)
- individual Windows windows
- mixed monitor + application + window selections

Running applications are grouped by their process name. **SELECT APP** selects all currently capturable windows for that application. A program must be running/open to have visible content available for screen sharing.

Every active source gets its own preview tile and its own frame stream. Frame metadata includes `source_id`, `source_type`, `source_name`, `app_process_name`, `native_window_id`, `source_bounds`, `source_index`, and `source_count`.

## Native input

`NexaShareControl.Native.exe` is a .NET 8 self-contained native helper using Windows APIs for cursor, mouse, keyboard, monitor and window operations. It communicates with Electron only over JSON Lines on stdin/stdout.

The Windows build now **compiles the helper before electron-builder packaging** and verifies the helper exists in `release/win-unpacked/resources/bin/`.

## Startup resilience

The Electron window is created before helper/network initialization. A helper failure is shown in Diagnostics instead of silently closing the UI. Startup logs are stored in `%APPDATA%\NexaShareControl\logs\`.

## Safety

Desktop control starts OFF. It only becomes active after the user explicitly presses **START SHARING SELECTED**.

Emergency stop: `CTRL + SHIFT + F12`.

The project does not implement keylogging, UAC bypass, antivirus disabling, or physical-keystroke capture.

## Build

```text
npm ci
npm run validate:delivery
npm run validate
npm run ui:smoke
npm run build:win
```

The GitHub Actions workflow sets up Node.js 24 and .NET 8 before building the Installer, Portable EXE and Windows ZIP.
