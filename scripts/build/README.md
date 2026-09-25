# Build Scripts for Ledger

This directory contains shell scripts to build the Ledger application for macOS, Windows, and Linux. This documentation is written for beginners who may not be familiar with Electron, React, or software building in general.

---

## Table of Contents

1. [Introduction: What is "Building" an Application?](#introduction-what-is-building-an-application)
2. [Prerequisites: What You Need Before Building](#prerequisites-what-you-need-before-building)
3. [Quick Start: Building Your First Copy](#quick-start-building-your-first-copy)
4. [Available Scripts](#available-scripts)
5. [Platform-Specific Guides](#platform-specific-guides)
   - [Building for macOS](#building-for-macos)
   - [Building for Linux](#building-for-linux)
   - [Building for Windows](#building-for-windows)
6. [Understanding the Build Process](#understanding-the-build-process)
7. [Output Files Explained](#output-files-explained)
8. [Code Signing and Distribution](#code-signing-and-distribution)
9. [Idempotency: Safe to Run Multiple Times](#idempotency-safe-to-run-multiple-times)
10. [Cleanup: Managing Build Artifacts](#cleanup-managing-build-artifacts)
11. [Troubleshooting](#troubleshooting)
12. [Glossary](#glossary)

---

## Introduction: What is "Building" an Application?

### The Basics

When developers write software, they write it in programming languages that humans can read and understand (like TypeScript, JavaScript, etc.). However, computers need these programs converted into a format they can actually run. This conversion process is called **building** or **compiling**.

Think of it like this:
- **Source code** = A recipe written in English
- **Building** = Translating that recipe into a format the kitchen (computer) understands
- **Built application** = The actual dish you can eat (run)

### What Ledger is Built With

Ledger uses several technologies:

| Technology | What It Does |
|------------|--------------|
| **Electron** | A framework that lets you build desktop apps using web technologies. It bundles a web browser (Chromium) with your app, so the same code runs on Mac, Windows, and Linux. |
| **React** | A JavaScript library for building user interfaces. It makes the buttons, lists, and panels you see in Ledger. |
| **TypeScript** | A programming language that's like JavaScript but with extra safety features. It helps catch bugs before they happen. |
| **Vite** | A build tool that compiles and bundles all the code together quickly. |
| **electron-builder** | A tool specifically for packaging Electron apps into distributable installers. |

### Why Do We Need Build Scripts?

Building an application involves many steps:
1. Installing dependencies (other code libraries the app needs)
2. Compiling TypeScript to JavaScript
3. Bundling all the code together
4. Packaging into a platform-specific format (.app, .exe, .deb, etc.)
5. Optionally signing the code (proving it's from a trusted source)

These scripts automate all of that, so you just run one command instead of many.

---

## Prerequisites: What You Need Before Building

### Required Software

#### 1. Node.js (Required)

Node.js is a JavaScript runtime that lets you run JavaScript outside of a web browser. All the build tools run on Node.js.

**How to check if you have it:**
```bash
node --version
# Should show something like: v20.10.0
```

**How to install it:**
- **All platforms**: Download from [nodejs.org](https://nodejs.org/) (use the LTS version)
- **macOS with Homebrew**: `brew install node`
- **Ubuntu/Debian**: `sudo apt install nodejs npm`
- **Fedora**: `sudo dnf install nodejs npm`

**Which version?** You need Node.js 18 or newer. The LTS (Long Term Support) version is recommended.

#### 2. Git (Recommended)

Git is version control software used to track changes in code. While not strictly required to build, many development workflows depend on it.

**How to check if you have it:**
```bash
git --version
# Should show something like: git version 2.40.0
```

**How to install it:**
- **macOS**: It's included with Xcode Command Line Tools. Run `xcode-select --install`
- **Windows**: Download from [git-scm.com](https://git-scm.com/)
- **Linux**: `sudo apt install git` (Debian/Ubuntu) or `sudo dnf install git` (Fedora)

#### 3. Platform-Specific Requirements

**For macOS builds:**
- Xcode Command Line Tools: Run `xcode-select --install`
- Apple Developer account (only for distribution)

**For Linux builds:**
- Build essentials: `sudo apt install build-essential fakeroot dpkg`
- RPM tools (for .rpm): `sudo apt install rpm` or `sudo dnf install rpm-build`

**For Windows builds:**
- Windows 10/11, or
- Linux/macOS with Wine (for cross-compilation)

---

## Quick Start: Building Your First Copy

Here's the fastest way to build Ledger for your current operating system:

### Step 1: Open a Terminal

- **macOS**: Open Terminal (in Applications > Utilities)
- **Windows**: Open PowerShell or Command Prompt
- **Linux**: Open your terminal emulator

### Step 2: Navigate to the Project

```bash
cd /path/to/ledger
```

### Step 3: Make Scripts Executable (First Time Only)

```bash
chmod +x scripts/build/*.sh
```

This command gives the scripts permission to run. You only need to do this once.

### Step 4: Run the Build

**On macOS:**
```bash
./scripts/build/build-mac.sh
```

**On Linux:**
```bash
./scripts/build/build-linux.sh
```

**On Windows (using Git Bash or WSL):**
```bash
./scripts/build/build-windows.sh
```

### Step 5: Find Your Built Application

After the build completes, look in the `dist/` folder:

```bash
ls -la dist/
```

You'll find your application ready to use!

---

## Available Scripts

| Script | Purpose |
|--------|---------|
| `build-common.sh` | Shared utilities used by all other scripts (not meant to be run directly) |
| `build-mac.sh` | Builds for macOS (Apple computers) |
| `build-linux.sh` | Builds for Linux distributions |
| `build-windows.sh` | Builds for Windows |
| `build-all.sh` | Builds for multiple platforms in one run |
| `cleanup.sh` | Safe cleanup of old build artifacts (dry-run by default) |

### Common Options (All Scripts)

| Option | Description |
|--------|-------------|
| `--status` | Show build directory status and disk usage before building |
| `--skip-deps` | Skip installing npm dependencies (faster if you know they're up to date) |
| `--help` | Show help information |

**Note:** Builds are saved to timestamped directories (e.g., `dist/v0.1.1_20241229_143022/`). Previous builds are preserved - you control when to clean up.

---

## Platform-Specific Guides

### Building for macOS

macOS is Apple's operating system for Mac computers.

#### Architecture: Apple Silicon vs Intel

Modern Macs come with two types of processors:

- **Apple Silicon (arm64)**: M1, M2, M3, M4 chips - newer Macs (2020+)
- **Intel (x64)**: Intel processors - older Macs (pre-2020)

You can build for:
- Just Apple Silicon (smaller file, only works on newer Macs)
- Just Intel (works on older Macs)
- Universal (works on both, but file is ~2x larger)

#### Commands

```bash
# Build for current Mac's architecture (auto-detected)
./scripts/build/build-mac.sh

# Build specifically for Apple Silicon
./scripts/build/build-mac.sh --arm64

# Build specifically for Intel
./scripts/build/build-mac.sh --x64

# Build for both (Universal binary)
./scripts/build/build-mac.sh --universal

# Clean build (remove old files first)
./scripts/build/build-mac.sh --clean
```

#### Output Files

| File | Description |
|------|-------------|
| `dist/mac-arm64/Ledger.app` | The macOS application (Apple Silicon) |
| `dist/mac-x64/Ledger.app` | The macOS application (Intel) |
| `dist/Ledger-x.x.x-arm64.zip` | Compressed archive for distribution |
| `dist/Ledger-x.x.x-arm64.dmg` | Disk image installer (if enabled) |

#### Running Your Built App

```bash
# Method 1: Double-click in Finder
open dist/mac-arm64/Ledger.app

# Method 2: From terminal
open dist/mac-arm64/Ledger.app
```

#### macOS-Specific Notes

1. **Quarantine Warning**: The first time you run an unsigned app, macOS may show "unidentified developer" warning. The script removes the quarantine attribute, but you may still need to right-click > Open.

2. **Code Signing**: To distribute your app, you need an Apple Developer certificate ($99/year). Use `--skip-signing` for personal use.

3. **Notarization**: Apple requires apps to be notarized for distribution. Configure `APPLE_ID` and `APPLE_APP_SPECIFIC_PASSWORD` environment variables.

---

### Building for Linux

Linux comes in many "distributions" (distros) like Ubuntu, Fedora, Arch, etc. This script supports the most common ones.

#### Package Formats Explained

| Format | Best For | How to Install |
|--------|----------|----------------|
| **AppImage** | Any distro, portable | Just run it (`chmod +x file.AppImage && ./file.AppImage`) |
| **DEB** | Debian, Ubuntu, Mint, Pop!_OS | `sudo dpkg -i file.deb` |
| **RPM** | Fedora, RHEL, CentOS, openSUSE | `sudo dnf install file.rpm` |

**Recommendation**: AppImage is the most universal and easiest to use.

#### Commands

```bash
# Build AppImage and .deb (default)
./scripts/build/build-linux.sh

# Build only AppImage
./scripts/build/build-linux.sh --appimage

# Build only .deb
./scripts/build/build-linux.sh --deb

# Build only .rpm
./scripts/build/build-linux.sh --rpm

# Build all formats
./scripts/build/build-linux.sh --all

# Clean build
./scripts/build/build-linux.sh --clean
```

#### Output Files

| File | Description |
|------|-------------|
| `dist/ledger-x.x.x.AppImage` | Portable executable (works anywhere) |
| `dist/ledger_x.x.x_amd64.deb` | Debian/Ubuntu package |
| `dist/ledger-x.x.x.x86_64.rpm` | Fedora/RHEL package |

#### Installing and Running

**AppImage (any distro):**
```bash
# Make executable
chmod +x dist/ledger-*.AppImage

# Run it
./dist/ledger-*.AppImage
```

**Debian/Ubuntu (.deb):**
```bash
# Install
sudo dpkg -i dist/ledger_*_amd64.deb

# Fix any dependency issues
sudo apt install -f

# Run (will be in your applications menu)
ledger
```

**Fedora/RHEL (.rpm):**
```bash
# Install
sudo dnf install dist/ledger-*.x86_64.rpm

# Run
ledger
```

---

### Building for Windows

Windows is Microsoft's operating system, used on most PCs.

#### Installer Formats Explained

| Format | Best For | Description |
|--------|----------|-------------|
| **NSIS** | Most users | Traditional installer with wizard, creates shortcuts |
| **Portable** | USB drives | Single .exe, no installation needed |
| **MSI** | IT/Enterprise | For Group Policy deployment |

#### Commands

```bash
# Build NSIS installer (default)
./scripts/build/build-windows.sh

# Build portable version
./scripts/build/build-windows.sh --portable

# Build MSI installer
./scripts/build/build-windows.sh --msi

# Build all formats
./scripts/build/build-windows.sh --all

# Clean build
./scripts/build/build-windows.sh --clean
```

#### Cross-Compilation (Building Windows Apps from Mac/Linux)

You can build Windows apps from macOS or Linux! The script will:
1. Detect that you're not on Windows
2. Use Wine (if installed) for compatibility
3. Build the Windows packages

**To install Wine:**
```bash
# macOS
brew install --cask wine-stable

# Ubuntu/Debian
sudo apt install wine64 wine32

# Fedora
sudo dnf install wine
```

#### Output Files

| File | Description |
|------|-------------|
| `dist/ledger-x.x.x-setup.exe` | NSIS installer |
| `dist/ledger-x.x.x-portable.exe` | Portable executable |
| `dist/ledger-x.x.x.msi` | MSI installer |

#### Windows SmartScreen Warning

If your app isn't signed with a code signing certificate, Windows will show a SmartScreen warning saying the app is "unrecognized." Users can click "More info" > "Run anyway" to proceed.

---

## Understanding the Build Process

Here's what happens when you run a build script:

### Step 1: Environment Check

The script verifies:
- Node.js is installed and is the right version
- npm (Node Package Manager) is available
- Platform-specific tools are installed

### Step 2: Dependency Installation

```
npm ci
```

This installs all the libraries (dependencies) listed in `package.json`. These are other people's code that our app uses, like React, Electron, etc.

**What's the difference between `npm ci` and `npm install`?**
- `npm install`: Flexible, might update versions
- `npm ci`: Strict, uses exact versions from `package-lock.json` (more reproducible)

### Step 3: Vite Build

```
npm run vite:build:app
```

This step:
1. Compiles TypeScript (.ts, .tsx files) to JavaScript
2. Processes CSS and other assets
3. Bundles everything together for efficiency
4. Outputs to the `out/` directory

**What's "bundling"?**
Instead of having hundreds of separate files, bundling combines them into a few optimized files. This makes the app start faster.

### Step 4: Electron Builder

```
npx electron-builder --platform --arch
```

This step:
1. Takes the bundled code from `out/`
2. Packages it with Electron (the browser that runs the app)
3. Creates platform-specific installers
4. Outputs to the `dist/` directory

### Visual Overview

```
Source Code                 Compiled Code               Distributable
─────────────              ─────────────               ─────────────
lib/                       out/
├── main/                  ├── main/
│   └── main.ts    ──┐     │   └── main.js      ──┐
app/                 │     ├── preload/           │
├── app.tsx        ──┼──▶  │   └── preload.js   ──┼──▶  dist/
├── components/      │     └── renderer/          │     ├── Ledger.app (mac)
└── styles/        ──┘         └── index.html   ──┘     ├── ledger.AppImage (linux)
                                                        └── ledger-setup.exe (win)

  TypeScript/React    Vite Build    JavaScript    electron-builder    Installers
```

---

## Output Files Explained

After a successful build, you'll find files in the `dist/` directory:

### Directory Structure

```
dist/
├── mac-arm64/              # macOS Apple Silicon build
│   └── Ledger.app/         # The macOS application bundle
├── mac-x64/                # macOS Intel build
│   └── Ledger.app/
├── linux-unpacked/         # Linux unpacked files (for debugging)
│   └── ledger
├── win-unpacked/           # Windows unpacked files (for debugging)
│   └── Ledger.exe
├── Ledger-0.1.0-arm64.zip  # macOS distribution archive
├── ledger-0.1.0.AppImage   # Linux portable executable
├── ledger_0.1.0_amd64.deb  # Linux Debian package
├── ledger-0.1.0-setup.exe  # Windows NSIS installer
└── builder-effective-config.yaml  # Build configuration used
```

### What Are "-unpacked" Directories?

These contain the "raw" application before it's packaged into an installer. They're useful for:
- Testing without going through installation
- Debugging issues with the packaged app
- Seeing exactly what files are included

---

## Code Signing and Distribution

### Why Sign Your Code?

Code signing is like a digital signature that proves:
1. The app comes from who it claims to come from (you)
2. The code hasn't been modified since you signed it

Without code signing:
- **macOS**: Shows "unidentified developer" warning, may refuse to open
- **Windows**: Shows SmartScreen warning, may refuse to run
- **Linux**: Generally doesn't require signing (users trust package managers)

### macOS Code Signing

**Requirements:**
- Apple Developer account ($99/year)
- Developer ID Application certificate
- For distribution: Notarization with Apple

**Setup:**
1. Join Apple Developer Program: https://developer.apple.com/programs/
2. Create a Developer ID Application certificate in Xcode
3. The scripts will automatically find and use your certificate

**Skip signing for personal use:**
```bash
./scripts/build/build-mac.sh --skip-signing
```

### Windows Code Signing

**Requirements:**
- Code signing certificate from a Certificate Authority (e.g., DigiCert, Sectigo)
- Usually costs $100-500/year

**Setup:**
```bash
# Option 1: Command line
./scripts/build/build-windows.sh --cert=path/to/certificate.pfx --cert-pass=YourPassword

# Option 2: Environment variables
export CSC_LINK=path/to/certificate.pfx
export CSC_KEY_PASSWORD=YourPassword
./scripts/build/build-windows.sh
```

### Linux Distribution

Linux apps are typically distributed through:
- **AppImage**: Self-contained, no signing needed
- **Package managers**: Debian repos, Fedora COPR, etc. (require GPG signing)
- **Snap Store**: Requires Snapcraft account
- **Flathub**: Requires Flatpak manifest

---

## Idempotency: Safe to Run Multiple Times

### What is Idempotency?

**Idempotency** means that running a script multiple times produces the same result as running it once. These build scripts are designed to be idempotent, which means:

- You can run the same build command twice in a row without errors
- Previous build outputs are safely overwritten
- State is reset at the start of each run
- No side effects accumulate from repeated runs

### Why Does This Matter?

Idempotency is important because:

1. **Retry Safety**: If a build fails halfway through, you can simply run it again
2. **No Manual Cleanup**: You don't need to manually delete files between builds
3. **Consistent Results**: Each run starts from a clean state
4. **CI/CD Friendly**: Works well in automated pipelines where scripts may be retried

### How the Scripts Achieve Idempotency

| Mechanism | What It Does |
|-----------|--------------|
| **Source Guards** | The shared `build-common.sh` file is only loaded once per session, even if sourced multiple times |
| **State Reset** | Each script resets all its variables at the start of `main()` |
| **Timestamped Outputs** | Each build creates a new timestamped directory, preserving previous builds |
| **No Auto-Deletion** | Scripts never delete files automatically; cleanup is user-directed |
| **Error Handling** | Commands use `|| exit 1` to fail gracefully |

### Examples of Idempotent Behavior

```bash
# Run build twice in a row - works fine, creates timestamped outputs
./scripts/build/build-linux.sh
./scripts/build/build-linux.sh  # Creates new timestamped build, preserves previous

# Build with different options - state resets properly
./scripts/build/build-linux.sh --appimage
./scripts/build/build-linux.sh --deb  # Previous options don't carry over

# Check status multiple times - safe, just displays info
./scripts/build/build-linux.sh --status
./scripts/build/build-linux.sh --status  # Safe, no side effects

# Interrupt and retry - works fine
./scripts/build/build-linux.sh  # Ctrl+C to cancel
./scripts/build/build-linux.sh  # Retry works fine
```

### Technical Details

The scripts use several patterns to ensure idempotency:

```bash
# Source guard - prevents multiple loading
if [ -n "$_BUILD_COMMON_LOADED" ]; then
    return 0 2>/dev/null || exit 0
fi
_BUILD_COMMON_LOADED=1

# State reset function - called at start of main()
reset_build_state() {
    SKIP_DEPS=false
    SHOW_STATUS=false
    SHOW_HELP=false
}

# Timestamped build directories - each build is unique
get_build_timestamp() {
    echo "v${APP_VERSION}_$(date +%Y%m%d_%H%M%S)"
}

# Safe cd with error handling
cd "$PROJECT_ROOT" || exit 1

# Default value patterns (set only if not already set)
: "${APP_VERSION:=$(get_version)}"
```

---

## Cleanup: Managing Build Artifacts

Build artifacts (the files created during builds) can accumulate over time and use significant disk space. The `cleanup.sh` script helps you safely manage these files.

### Safety First Philosophy

The cleanup script is designed with safety as the top priority:

1. **Dry-run by default**: Running without flags only shows what would be deleted
2. **Explicit confirmation required**: Must use `--confirm` flag to enable deletion
3. **Interactive prompts**: Even with `--confirm`, you must type "yes" for each deletion
4. **Path safety**: Refuses to delete anything outside the project directory
5. **Idempotent**: Safe to run multiple times with no side effects

### Commands

```bash
# See what can be cleaned (safe, no deletion)
./scripts/build/cleanup.sh

# Same as above - explicit dry-run
./scripts/build/cleanup.sh --dry-run

# Actually delete (with confirmation prompts)
./scripts/build/cleanup.sh --confirm

# Show help
./scripts/build/cleanup.sh --help
```

### What Gets Cleaned

| Directory | Contents | Description |
|-----------|----------|-------------|
| `dist/` | Distribution packages | AppImage, .deb, .exe, .dmg, .app, etc. |
| `out/` | Intermediate files | Compiled JavaScript, bundled code |

### Example: Dry-Run Output

```
════════════════════════════════════════════════════════════
  Build Artifact Cleanup
════════════════════════════════════════════════════════════

Mode: DRY-RUN (no files will be deleted)
      Use --confirm to actually delete files

Project Root: /home/user/ledger

Intermediate Build Files (out/):
  Size:  45MB
  Files: 1234

Distribution Packages (dist/):
  Size:  892MB
  Files: 15

  Build directories:
    - v0.1.0_20241228_140322 (312MB)
    - v0.1.0_20241229_091500 (580MB)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 937MB across 1249 files
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

To delete these files, run:
  ./scripts/build/cleanup.sh --confirm
```

### Example: Confirm Mode

When you run with `--confirm`, the script will:

1. Show you each directory to be deleted
2. Display the size and file count
3. Ask you to type "yes" to confirm each deletion

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Directory: /home/user/ledger/out
Size:      45MB
Files:     1234 files
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Are you sure you want to delete this directory?
Type yes to confirm, anything else to skip:
```

### Selective Cleanup

For the `dist/` directory, you can choose to:
- Delete ALL build artifacts
- Delete individual build directories (by version/timestamp)
- Skip dist/ cleanup entirely

### Manual Cleanup Alternative

If you prefer manual control, you can always delete files directly:

```bash
# Delete specific version builds
rm -rf dist/v0.1.0_20241228_*

# Delete all builds for a version
rm -rf dist/v0.1.0_*

# Delete all dist files
rm -rf dist/*

# Delete intermediate files
rm -rf out/
```

**Warning:** Manual `rm -rf` is irreversible. The cleanup script provides a safer alternative with confirmation prompts.

---

## Troubleshooting

### Common Issues and Solutions

#### "Permission denied" when running scripts

**Problem:** You see `bash: ./scripts/build/build-mac.sh: Permission denied`

**Solution:** Make the scripts executable:
```bash
chmod +x scripts/build/*.sh
```

#### "node: command not found"

**Problem:** Node.js isn't installed or isn't in your PATH.

**Solution:**
1. Install Node.js from https://nodejs.org/
2. Restart your terminal
3. Verify with `node --version`

#### "npm ci" fails with errors

**Problem:** Dependencies can't be installed.

**Solutions:**
1. Delete `node_modules` and `package-lock.json`, then run `npm install`
2. Check your Node.js version (need 18+)
3. Check your internet connection

#### Build succeeds but app won't start

**Problem:** The app crashes or shows a blank window.

**Solutions:**
1. Check the developer console (View > Toggle Developer Tools)
2. Look for errors in the terminal output
3. Try a clean build: `./scripts/build/build-xxx.sh --clean`

#### "App is damaged and can't be opened" (macOS)

**Problem:** Quarantine attribute or unsigned app.

**Solution:**
```bash
# Remove quarantine attribute
xattr -cr dist/mac-arm64/Ledger.app

# Or right-click > Open instead of double-clicking
```

#### Windows SmartScreen blocks the app

**Problem:** App isn't signed or is newly signed.

**Solution for users:**
1. Click "More info"
2. Click "Run anyway"

**Long-term solution:** Sign with an EV (Extended Validation) certificate.

#### Build takes forever / hangs

**Problem:** Build process seems stuck.

**Solutions:**
1. First build downloads many files - be patient (can take 10-20 min)
2. Check disk space (need several GB free)
3. Check RAM (building uses a lot of memory)
4. Kill and restart with `--clean` flag

### Getting More Help

1. **Check the logs:** Scripts print detailed output - scroll up to find errors
2. **Run with verbose output:** Most issues are printed clearly
3. **Check GitHub Issues:** https://github.com/peterjthomson/ledger/issues

---

## Glossary

| Term | Definition |
|------|------------|
| **Architecture** | The type of processor a computer uses (arm64 for Apple Silicon, x64 for Intel/AMD) |
| **Bundle** | Multiple files combined into one for efficiency |
| **Compile** | Convert human-readable code to computer-executable format |
| **Cross-compile** | Build for a different platform than you're running on (e.g., build Windows app on Mac) |
| **Dependency** | A library or package that your code relies on |
| **Electron** | Framework for building desktop apps with web technologies |
| **Node.js** | JavaScript runtime that runs outside browsers |
| **npm** | Node Package Manager - installs JavaScript libraries |
| **Notarization** | Apple's process to verify apps are safe (required for distribution) |
| **Package** | A distributable unit of software (like an installer) |
| **PATH** | List of directories where your computer looks for executable programs |
| **Signing** | Cryptographically proving who created the software |
| **Terminal** | Text-based interface for running commands |
| **Vite** | Fast build tool for modern web projects |

---

## Script Architecture

For developers who want to understand or modify these scripts:

```
scripts/build/
├── build-common.sh     # Shared utilities (sourced by other scripts)
│   ├── Color codes for terminal output
│   ├── Logging functions (log_info, log_error, etc.)
│   ├── Environment checks (Node.js, Git)
│   ├── Dependency installation
│   ├── Vite build wrapper
│   └── Common argument parsing
│
├── build-mac.sh        # macOS-specific build
│   ├── Sources build-common.sh
│   ├── Architecture detection (arm64/x64)
│   ├── Xcode tools check
│   ├── Signing certificate check
│   ├── Notarization handling
│   └── Quarantine removal
│
├── build-linux.sh      # Linux-specific build
│   ├── Sources build-common.sh
│   ├── Distribution detection
│   ├── Package manager integration
│   ├── AppImage/deb/rpm target handling
│   └── Build dependency installation
│
├── build-windows.sh    # Windows-specific build
│   ├── Sources build-common.sh
│   ├── Cross-compilation detection
│   ├── Wine check (for cross-compile)
│   ├── NSIS/portable/MSI targets
│   └── Code signing configuration
│
├── build-all.sh        # Multi-platform orchestrator
│   ├── Sources build-common.sh
│   ├── Platform capability checking
│   ├── Calls individual build scripts
│   └── Aggregates results
│
└── cleanup.sh          # Safe artifact cleanup
    ├── Standalone (does not source build-common.sh)
    ├── Dry-run by default (no deletion)
    ├── Requires --confirm flag for deletion
    ├── Interactive confirmation prompts
    └── Path safety (only deletes within project)
```

---

## License

These build scripts are part of the Ledger project and are licensed under the MIT License.
