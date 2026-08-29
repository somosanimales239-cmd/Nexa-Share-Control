# NexaShareControl 1.2.0

NexaShareControl is the dedicated Windows application for visual desktop sharing and native mouse/keyboard control. It remains isolated from Nexa AI Local Bridge, Nexa Local, Browser Relay, SFTP, GitHub automation and Unity projects.

## Release goal

1.2.0 is a consolidated Manual Delivery release intended to avoid a chain of small repair updates. It combines the startup repair, Native Helper packaging, Builder V3 delivery contract and multi-source sharing work in one source package.

## Multi-source screen sharing

Before sharing, the user can choose any combination of up to 16 currently capturable sources:

- one or more complete monitors
- one or more open applications
- one or more individual Windows windows
- mixed monitor + application + window selections

Open windows are grouped by process/application name. **SELECT APP** selects the visible windows for one running application. **SELECT ALL VISIBLE**, source search/filtering and per-window selection are included. Selection is locked while a sharing session is active so the visible state cannot silently diverge from the active streams.

Each source gets an independent preview and frame identity. Frame metadata includes `share_set_id`, `source_id`, `source_type`, `source_name`, `app_process_name`, `native_window_id`, `source_bounds`, `source_index`, and `source_count`.

## Multi-source stability

The renderer prevents overlapping capture ticks, handles a capture source closing while sharing, retains the chosen source set after a normal Stop, and rolls back the local session if no selected source can be opened.

## Native Helper

`NexaShareControl.Native.exe` is a .NET 8 self-contained Windows x64 helper. The user does not need to install .NET separately after NexaShareControl is built.

The helper uses Windows APIs for:

- cursor position
- mouse movement/click/down/up/double-click/drag/wheel
- keyboard text, key and combo input
- monitor enumeration and DPI information
- window enumeration, bounds, active window and activation

Normalized mouse movement and drag can target either a monitor or a specific `window_id`, which prepares the app for source-specific remote control when multiple windows are being shared.

The helper runs as a persistent JSON-lines child process. An intentional app shutdown cannot trigger the helper's automatic crash restart.

## Startup resilience

The Electron window is created before the Native Helper or remote transport is allowed to block startup. Background failures are reported in Diagnostics and `%APPDATA%\NexaShareControl\logs\NexaShareControl.log` instead of silently closing the application.

Only one NexaShareControl instance is allowed per Windows user. A second launch focuses the existing app instead of creating duplicate helpers or hotkeys.

## Safety

Desktop control starts OFF. Screen sharing starts only after the user explicitly chooses sources and presses **START SHARING SELECTED**.

Emergency stop: `CTRL + SHIFT + F12`.

No keylogging, physical-keystroke capture, UAC bypass, antivirus disabling, or hidden input activation is implemented.

## Nexa App Builder Pro compatibility

This package is aligned with the supplied Nexa App Builder Pro Manual Delivery contract and preserves these pipeline markers:

- `NEXA_NODE_RUNTIME_RESOLUTION_V1`
- `NEXA_APPLICATION_VERSION_METADATA_V1`
- `NEXA_DEPENDENCY_LOCK_PORTABILITY_V1`
- `NEXA_VALIDATION_MATRIX_V2`
- `NEXA_WINDOWS_ARTIFACT_DELIVERY_V3`

The Windows workflow configures Node.js and .NET 8, builds the Native Helper before Electron packaging, verifies the helper inside `win-unpacked`, verifies it inside the Windows ZIP, launches the packaged EXE, installs the NSIS build, launches the installed EXE, checks the Native Helper is alive, tests Apps & Features/uninstall/reinstall behavior and uploads startup evidence with the normal Builder V3 artifacts.

## Expected Windows outputs

- `NexaShareControl-Setup-1.2.0-x64.exe`
- `NexaShareControl-Portable-1.2.0-x64.exe`
- `NexaShareControl-1.2.0-x64.zip`

## Validation status

The source package is structurally and statically validated before delivery. Final `WINDOWS BUILD VERIFIED` status must only be claimed after Nexa App Builder Pro pushes 1.2.0 to GitHub Actions and the Windows workflow completes successfully.
