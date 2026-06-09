<p align="center">
  <img src="src-tauri/icons/128x128.png" width="96" alt="RedDash logo" />
</p>

<h1 align="center">RedDash</h1>

<p align="center">
  A native desktop app for tracking and logging time on Redmine.<br/>
  Built for convenience — and secured the right way as a matter of principle.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-blue?logo=tauri" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Rust-native-orange?logo=rust" alt="Rust" />
  <img src="https://img.shields.io/badge/macOS-supported-brightgreen?logo=apple" alt="macOS" />
  <img src="https://img.shields.io/badge/Windows-supported-brightgreen?logo=windows" alt="Windows" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT" />
</p>

---

## Why RedDash?

Redmine was built to manage projects, not to log time every day. Each entry requires opening a browser, finding the right issue, filling out a form, and submitting — one day at a time. RedDash collapses that entire workflow into seconds, and lets you log an entire month in a single action.

The Redmine web interface still does its job — RedDash doesn't replace it. It just makes the daily time-logging part dramatically less painful.

As a desktop app, RedDash also applies solid security practices by default: your API token is encrypted in a local vault, all stored data is encrypted with AES-256-GCM, and nothing leaves your machine except the API calls to your own Redmine server. Not because the web interface is insecure, but because it's the right way to build a tool that handles credentials.

| | Redmine Web | RedDash |
|--|-------------|---------|
| Bulk log multiple days at once | ✗ | ✓ |
| Visual monthly calendar | Limited | ✓ |
| Alerts for missing / incomplete days | ✗ | ✓ |
| Pin frequently used issues | ✗ | ✓ |
| Personal stats by week / month / quarter | ✗ | ✓ |
| Full team overview | ✗ | ✓ |
| Works without opening a browser | ✗ | ✓ |
| API token encrypted at rest | ✗ | ✓ |
| All local data encrypted | ✗ | ✓ |

---

## Features

### Calendar View

See your entire month of time entries at a glance — spot missing days instantly without scrolling through lists.

- **Smart alert banner** — distinguishes days with no log (red) from days logged under 8h (amber); click any chip to jump straight to logging
- **Weekends and future dates are locked** — no accidental entries, no manual checking
- **Right-click context menu** — log or view details on any day without navigating away
- **View other team members** — switch to any colleague's calendar from the user picker (requires Redmine permissions)
- **Expandable entries** — toggle to show all entries per day, or keep it compact

### Bulk Time Logging

The core feature of RedDash. Instead of submitting one entry at a time in Redmine, select multiple days and submit everything in one shot.

- **Mini calendar picker** — click individual days, or hit "Select weekdays" to pick all Mon–Fri in the month
- **One submit, many days** — same issue, same hours, same activity, same comment applied to every selected day
- **Progress bar** — tracks how many days have been submitted and flags any that failed
- **Already-logged markers** — the picker marks days where this issue already has an entry, preventing duplicates
- **Smart issue search** — autocomplete by ID or name; shows project name and parent issue to avoid confusion

### Pinned Issues (Favorites)

You shouldn't have to remember issue IDs. Pin the issues you work on regularly and they'll always appear at the top of every search dropdown.

- Up to 20 pinned issues, shown first in all Log Time and Calendar dropdowns
- Add issues by searching by name or entering an ID directly
- Log time straight from the Pins page without opening any modal

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘L` / `Ctrl+L` | Open Log Time modal (only when viewing your own calendar) |
| `Escape` | Close any modal or dropdown |

### Personal Stats

Get a clear picture of your own productivity across any time range.

- **Bar chart** — hours per month, quarter, half-year, year, or a custom date range
- **Breakdown by issue and project** — see where your time actually goes
- **Breakdown by activity** — development, testing, meetings, and so on
- **Target tracking** — automatically calculates working days × 8h for the period, shows % completion and hours remaining

### Team View

Monitor the entire team's hours in a single table.

- **Weekly or monthly view** — each column is a day, each row is a team member
- **Color-coded automatically** — green ≥ 90%, amber 70–89%, red < 70% of daily target
- **Member filter** — show/hide individual members; preference is saved locally
- **Hide weekends** — cleaner view, focused on working days
- **Today highlight** — easy to orient yourself in the current week
- **Smooth navigation** — switching months doesn't unmount the table; it dims slightly while loading, keeping layout stable

---

## Security

RedDash handles your Redmine API token and personal work data, so it applies proper security practices — not because the Redmine web interface is insecure, but because any tool that stores credentials should do this by default.

The short version: your token is encrypted in a local vault, all local data is encrypted at rest, and nothing leaves your machine except direct API calls to your own Redmine server. No intermediary servers, no cloud, no third party involved.

### How RedDash protects your data

```
[RedDash / Rust process]
    │
    │   API token decrypted in Rust memory only — never exposed to JS
    │   All local data encrypted at rest with AES-256-GCM
    │   Direct HTTPS to your Redmine server — no intermediary
    │
    └─► Redmine server
```

### Encryption layers

**Layer 1 — Tauri Stronghold (Argon2id + ChaCha20-Poly1305)**

Your API token and storage encryption key are stored inside a Stronghold vault — a secure enclave protected by your chosen password. Stronghold uses **Argon2id** (OWASP's recommended KDF as of 2024) to derive a key from your password, then encrypts the vault contents with **ChaCha20-Poly1305**. Even if someone extracts the vault file from disk, they still need your password to read anything.

**Layer 2 — AES-256-GCM for all local data**

Every piece of data written to localStorage (pinned issues, settings, UI preferences, caches) is encrypted with **AES-256-GCM** — the same symmetric cipher used in TLS 1.3, hardware-accelerated on modern CPUs, and built into the Web Crypto API. The encryption key lives in Stronghold, never on disk in plaintext. If you open DevTools → Application → Local Storage, every value is an opaque base64 string.

**Layer 3 — Rust HTTP proxy keeps the token out of JavaScript**

The frontend JavaScript layer **never holds the API token**. Every request to Redmine is relayed through the Rust backend — the JS side sends a command, Rust injects the token into the Authorization header before the request leaves the process. The token never appears in the browser's Network DevTools tab.

### Forgot your vault password?

Use the **Reset vault** button in Settings to wipe the vault and start fresh. Your time entries remain safe on the Redmine server — just re-enter your URL and a new API token.

---

## Install

Grab the installer for your OS from the [Releases page](https://github.com/tieuanhquoc/RedDash/releases).

### Windows

| File | What it is |
|---|---|
| `RedDash_x.x.x_x64-setup.exe` | **Recommended.** NSIS installer with auto-update. |
| `RedDash_x.x.x_x64_en-US.msi` | MSI for IT / enterprise deployment. |
| `RedDash-x.x.x-portable.exe` | Single binary, no install, **no auto-update**. |

Run the installer normally. Windows SmartScreen may warn that the publisher is unverified — click **More info → Run anyway**.

### macOS (Apple Silicon)

RedDash is not notarized through the Apple Developer Program ($99/year), so Gatekeeper blocks the first launch. One-time bypass per install:

**Option 1 — Right-click → Open (no Terminal needed):**

1. Open the `.dmg` and drag `RedDash.app` to **Applications**.
2. In Applications, **right-click `RedDash.app` → Open**.
3. Confirm in the dialog → click **Open**. Double-click works normally from now on.

**Option 2 — If macOS says the app is "damaged" or "cannot be opened":**

This happens on Apple Silicon when the quarantine flag is set. Strip it:

```bash
xattr -d com.apple.quarantine /Applications/RedDash.app
```

Then double-click as usual.

**Option 3 — System Settings:**

1. Try to open the app → it gets blocked.
2. **System Settings → Privacy & Security** → scroll to the bottom: "RedDash.app was blocked..." → click **Open Anyway**.

### Verify your download (optional)

```bash
# SHA256 checksum
sha256sum -c SHA256SUMS.txt

# Build provenance — proves the binary was built from this repo on GitHub Actions
gh attestation verify <file> --repo tieuanhquoc/RedDash
```

---

## Getting Started

**Platform support:**

| OS | Status | Installer |
|----|--------|-----------|
| macOS 11+ | Supported | `.app` / `.dmg` |
| Windows 10+ | Supported | `.msi` / `.exe` |
| Linux | Untested | Build from source |

**Build requirements:**

| Tool | Version | Notes |
|------|---------|-------|
| Node.js | ≥ 18 | Use nvm to manage versions |
| Rust / Cargo | ≥ 1.70 | Run `rustup update` if outdated |
| Redmine | ≥ 4.x | REST API must be enabled in Admin settings |

**Required Redmine permissions for the API token:**

The token only needs read/write access to time entries. Specifically:
- View time entries (own + others, for Team View)
- Create / edit / delete own time entries
- View issues (for search and autocomplete)
- View project members (for Team View user list)

A standard Redmine member role with default permissions is sufficient. No admin access required.

```bash
git clone <repo-url>
cd redmine-dashboard
npm install
npm run tauri:dev
```

> **Dev mode note:** The Stronghold vault works fully in dev mode. localStorage data is encrypted with AES-256-GCM using a bootstrap key auto-generated on first run and stored at `_rdash_enc_boot`. To verify: open DevTools → Application → Local Storage — all values should be opaque base64 strings.

### First-time setup

1. Open the app → click **Settings** (gear icon)
2. Enter your **Redmine URL** — e.g. `https://redmine.company.com`
3. Enter your **API Token** — found at `My account → API access key` in Redmine
4. Set a **vault password** — used to unlock the app on each launch (min 4 characters)
5. Click **Save** — the token is encrypted and stored in the Stronghold vault immediately

No account registration, no cloud sync, no email verification. Just your Redmine URL and API token.

---

## Build

**macOS** → `.app` + `.dmg`:
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/
```

**Windows** → `.msi` + `.exe` (must run on a Windows machine or GitHub Actions):
```bash
npm run tauri:build
# Output: src-tauri/target/release/bundle/msi/
```

> Tauri does not support cross-compilation from macOS to Windows. Use GitHub Actions with a `windows-latest` runner or build on a real Windows machine.

---

## Architecture

```
redmine-dashboard/
├── app/                  # Next.js 16 App Router
├── components/           # React 19 components
│   ├── CalendarView      # Monthly calendar + context menu
│   ├── StatsView         # Personal stats chart
│   ├── TeamView          # Team hours table
│   ├── BulkLogModal      # Multi-day time logging
│   ├── FavoritesView     # Pinned issues management
│   ├── IssueSearchInput  # Shared autocomplete component
│   ├── SettingsModal     # Vault setup / unlock
│   └── AppContext        # Global state (React Context + useReducer)
├── lib/
│   ├── redmine.ts        # Redmine REST API client
│   ├── storage.ts        # AES-256-GCM encrypted localStorage wrapper
│   ├── vault.ts          # Tauri Stronghold integration
│   ├── favorites.ts      # Pinned issue persistence
│   └── types.ts          # Shared TypeScript types
└── src-tauri/            # Rust backend
    └── src/lib.rs        # HTTP proxy + Stronghold initialization
```

**Why Tauri instead of Electron?**

Tauri uses the operating system's native webview (WebKit on macOS, WebView2 on Windows) rather than bundling a full Chromium instance like Electron. The result: binaries roughly 10× smaller, significantly lower RAM usage, and a Rust backend that handles crypto and HTTP at the system level rather than through Node.js.
