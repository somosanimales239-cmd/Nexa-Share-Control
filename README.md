# NexaShareControl 1.0.1

Independent Windows desktop-control application. It does **not** modify Nexa Local, Nexa AI Local Bridge, Nexa ChatGPT Browser Relay 1.6.1, SFTP Publisher, Chrome extensions, or Unity projects.

## Product

Installed executable: `NexaShareControl.exe`

Native helper: `NexaShareControl.Native.exe`

Desktop input uses native Windows APIs (`SendInput`, `SetCursorPos`) — not PowerShell.

## Included in the first build

- continuous Electron/Chromium desktop capture
- local live preview
- monitor selector
- adaptive JPEG frame sending
- direct native mouse move/click/double-click/down/up/drag/wheel
- direct native Unicode keyboard text/key/combo control
- visible-window listing and activation
- local START/STOP sharing consent
- global emergency stop `CTRL + SHIFT + F12`
- exact-once command ID rejection
- session and timestamp checks
- network-loss session shutdown
- HTTPS long polling
- frame upload contract
- optional WSS client architecture
- pairing/token storage using Electron safeStorage/Windows protection where available
- Developer Test Mode before the Hostinger API exists
- diagnostics
- NSIS + portable + ZIP Windows build targets

## Future Hostinger API contract

Base URL example: `/nexa-share-control/api/v1/`

- `POST device/register`
- `POST device/heartbeat`
- `POST session/status`
- `POST frame/upload`
- `GET commands/poll`
- `POST commands/ack`
- `POST telemetry`

Protocol: `NEXA-SHARE-CONTROL/1`

The PC connects outbound. No inbound firewall/port-forwarding design is used.

## Build

Windows developer/build prerequisites: Node.js 22 + .NET 8 SDK.

```powershell
npm install --no-audit --no-fund
npm run build:native
npm run validate
npm test
npm run test:implementation
npm run test:acceptance
npm run ui:smoke
npm run build:windows
```

GitHub Actions workflow: `.github/workflows/nexa-windows-build.yml`.

## Safety

Desktop control is OFF by default. Remote input only works during a locally started session. No keylogging, no hidden startup sharing, no UAC bypass, no antivirus disabling, no inbound remote-control server. Disconnecting the network ends the active session and pending commands are not intentionally replayed.


## 1.0.1 startup isolation

The main window is created before optional background systems. Native helper, tray, transport, hotkey, or remote API startup failures are reported without terminating the application. NexaShareControl uses its own `%APPDATA%\NexaShareControl` state and does not share state with other Nexa applications.
