# NexaShareControl 1.3.0

> FULL MANUAL DELIVERY replacement. This release keeps the complete NexaShareControl feature set, includes the Native Helper compiler fix from 1.2.1, and replaces the window picker with a Windows-native open-application inventory plus two capture paths so programs such as Unity cannot simply disappear from the Share list.

NexaShareControl is the dedicated Windows application for visual desktop sharing and native mouse/keyboard control. It remains isolated from Nexa AI Local Bridge, Nexa Local, Browser Relay, SFTP, GitHub automation and Unity projects.

## Release goal

1.3.0 is a consolidated release, not a small patch. The main goal is: **if a normal visible Windows program/window is open, NexaShareControl should list it and allow it to be assigned to Share.**

The Windows Native Helper (`EnumWindows`) is now the source of truth for open applications/windows. Electron `desktopCapturer` is used as the preferred capture backend, not as the only discovery list.

## Universal open-window sharing

The picker now has three levels:

- **OPEN APPLICATIONS** — groups every detected visible top-level window by Windows process/application name. **ASSIGN APP** assigns every capturable open window for that program.
- **MONITORS** — one or more complete displays.
- **WINDOWS · <application>** — every detected individual window for that application, with **ASSIGN TO SHARE** and **ACTIVATE / RESTORE WINDOW** controls.

Search accepts application/process names and window titles such as Unity, Chrome, Visual Studio, Explorer, Blender, etc. The inventory refreshes automatically every four seconds while not sharing and also refreshes shortly after startup because the Native Helper starts after the Electron UI.

Up to 16 sources can be assigned simultaneously and can be mixed: monitor + Unity + browser + editor + Explorer, or several windows from the same application.

## Capture strategy

Every native Windows window remains in the picker even when Chromium does not expose it as a direct `desktopCapturer` window source.

NexaShareControl uses:

1. **DIRECT WINDOW** — preferred. The Electron/Chromium window source is matched to the native HWND and captured independently.
2. **VISIBLE REGION** — fallback. If the open native window has no direct Chromium capture source, NexaShareControl captures the display containing the window and crops to the current Windows window bounds. This fallback requires the window to be visible; a minimized window can be restored from the picker.

Selected window sources are re-resolved while sharing. If a capture backend changes because a window moves or Windows/Electron exposes a better source, NexaShareControl can rebind the stream without changing the user's assigned source ID.

## Multi-source frame identity

Each source gets an independent preview and frame identity. Frame metadata includes `share_set_id`, `source_id`, `source_type`, `source_name`, `capture_mode`, `app_process_name`, `app_process_id`, `native_window_id`, `source_bounds`, `source_index`, and `source_count`.

## Native Helper

`NexaShareControl.Native.exe` is a .NET 8 self-contained Windows x64 helper. The user does not need to install .NET separately after NexaShareControl is built.

The helper uses Windows APIs for cursor position, mouse input, keyboard input, monitor/DPI enumeration, native window enumeration, window bounds, active window lookup, activation/restoration and source-specific pointer coordinates.

## Startup and safety

The Electron UI opens independently of the Native Helper and remote transport. Background failures are reported in Diagnostics and `%APPDATA%\NexaShareControl\logs\NexaShareControl.log` instead of silently closing the application.

Desktop control starts OFF. Sharing begins only after the user explicitly assigns sources and presses **START SHARING SELECTED**. Emergency stop remains `CTRL + SHIFT + F12`.

No keylogging, physical-keystroke capture, UAC bypass, antivirus disabling, or hidden input activation is implemented.

## Nexa App Builder Pro compatibility

This complete Manual Delivery source preserves:

- `NEXA_NODE_RUNTIME_RESOLUTION_V1`
- `NEXA_APPLICATION_VERSION_METADATA_V1`
- `NEXA_DEPENDENCY_LOCK_PORTABILITY_V1`
- `NEXA_VALIDATION_MATRIX_V2`
- `NEXA_WINDOWS_ARTIFACT_DELIVERY_V3`

The Windows workflow configures Node.js and .NET 8, builds the Native Helper before Electron packaging, verifies the helper inside `win-unpacked` and the Windows ZIP, launches the packaged EXE, installs and launches the NSIS build, verifies Native Helper startup, and keeps the Builder V3 uninstall/reinstall evidence.

## Expected Windows outputs

- `NexaShareControl-Setup-1.3.0-x64.exe`
- `NexaShareControl-Portable-1.3.0-x64.exe`
- `NexaShareControl-1.3.0-x64.zip`

## Validation status

The source package is structurally and statically validated before delivery. `WINDOWS BUILD VERIFIED` must only be claimed after Nexa App Builder Pro pushes 1.3.0 to GitHub Actions and the Windows workflow completes successfully.
