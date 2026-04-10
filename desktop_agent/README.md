# NPAMX Desktop Agent (Desktop Window MVP)

This folder contains a real agent you can package and host in S3 for NPAMX users.

## What It Does
- Launches a small local agent window when started without arguments
- Supports one-time login/config using Identity Center pairing code
- Auto-loads a per-user NPAMX agent profile so users do not type NPAMX URL/email manually
- Registers device with NPAMX (`/api/agent/v1/register`)
- Sends periodic heartbeats (`/api/agent/v1/heartbeat`)
- Lists active database sessions for the paired user
- Fetches per-request login details for local DBeaver/manual use
- Lets user select a local AWS CLI profile, run AWS SSO login, and connect IAM-backed sessions
- Supports Windows/macOS/Linux

## 1) Build Artifacts

### macOS / Linux
```bash
cd <repo-root>
chmod +x desktop_agent/build-agent-macos-linux.sh
./desktop_agent/build-agent-macos-linux.sh
```

Important:
- The build now fails early if Tkinter is not available in the local Python installation.
- Use a Python build with Tk support for the desktop-window artifact.

Artifacts are generated in:
`desktop_agent/dist-artifacts`

### Windows (run on Windows machine)
```powershell
cd C:\path\to\JIT-PAM-Enterprise
powershell -ExecutionPolicy Bypass -File .\desktop_agent\build-agent-windows.ps1
```

Artifact is generated in:
`desktop_agent\dist-artifacts\npamx-agent-windows-amd64.exe`

## 2) Upload to S3
Upload generated artifacts to a private S3 bucket and configure NPAMX to serve them through backend proxy:

- Admin -> Integrations -> Vault DB -> Desktop Agent
  - Download Delivery: `Private S3 via NPAMX backend`
  - S3 Bucket and optional S3 Region
  - Windows/macOS/Linux object keys

## 3) User One-Time Setup

After download:

1. Download the agent binary from NPAMX.
2. Download the per-user `Agent Profile` JSON from NPAMX.
3. Keep the profile JSON in the same folder as the agent binary.
4. Launch the binary with no arguments to open the local window.

CLI mode remains available:
```bash
npamx-agent login \
  --server-url https://<npamx-host> \
  --user-email <user@company.com>
```

Agent will print a pairing code. User pastes that code in NPAMX My Profile -> Desktop Agent -> Connect Agent.

Then run continuous mode:
```bash
npamx-agent run
```

Optional single cycle check:
```bash
npamx-agent run --once
```

## 4) Useful Commands
```bash
npamx-agent
npamx-agent ui
npamx-agent status
npamx-agent heartbeat
npamx-agent register
npamx-agent sessions
npamx-agent session-credentials <request_id>
npamx-agent logout
```

## Notes
- Identity Center pairing is recommended production mode.
- Shared token mode is legacy fallback: `npamx-agent login --token <value> ...`
- The current build is a desktop window MVP, not a native OS tray app yet.
- Keep downloaded binary versions aligned with NPAMX compatibility.
- DBeaver launch is currently assisted, not fully native auto-fill/proxy mode yet.
