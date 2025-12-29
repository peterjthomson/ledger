#!/bin/bash
# ============================================================================
# build-windows.sh - Windows Build Script for Ledger
# ============================================================================
# This script builds the Ledger application for Windows operating systems.
#
# WHAT THIS SCRIPT DOES:
# 1. Checks that you have the required tools installed
# 2. Compiles the TypeScript/React code into JavaScript
# 3. Packages everything into Windows distributable formats
# 4. Optionally signs the executable with a code signing certificate
#
# OUTPUT FORMATS:
# - NSIS Installer:  A traditional .exe installer with install/uninstall
# - Portable:        A standalone .exe that runs without installation
# - MSI:             Windows Installer package for enterprise deployment
#
# USAGE:
#   ./build-windows.sh                    # Build NSIS installer (default)
#   ./build-windows.sh --portable         # Build portable .exe
#   ./build-windows.sh --msi              # Build MSI installer
#   ./build-windows.sh --all              # Build all formats
#   ./build-windows.sh --clean            # Clean before building
#
# PREREQUISITES:
# - Windows 10/11, or Linux/macOS with Wine installed
# - Node.js 18+ installed
# - For code signing: Windows SDK with signtool, or osslsigncode on Linux/macOS
#
# CROSS-PLATFORM BUILDING:
# You CAN build Windows apps from macOS or Linux! This script supports that.
# Wine is used to run Windows-specific build tools.
#
# ============================================================================

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source (include) the common utilities
source "$SCRIPT_DIR/build-common.sh"

# ----------------------------------------------------------------------------
# WINDOWS-SPECIFIC VARIABLES
# ----------------------------------------------------------------------------
# These are reset by reset_windows_state() for idempotency

# Reset Windows-specific state to defaults
# Call this at the start of main() for idempotent behavior
reset_windows_state() {
    # Default targets to build
    BUILD_NSIS=true        # Traditional installer
    BUILD_PORTABLE=false   # Portable .exe (no installation)
    BUILD_MSI=false        # MSI package
    BUILD_ALL=false

    # Architecture
    BUILD_ARCH="x64"       # x64 (64-bit) or ia32 (32-bit) or both

    # Cross-compilation support
    IS_CROSS_BUILD=false
    HAS_WINE=false

    # Code signing
    SKIP_SIGNING=false
    SIGN_CERT_FILE=""
    SIGN_CERT_PASSWORD=""
}

# Initialize defaults
reset_windows_state

# ----------------------------------------------------------------------------
# WINDOWS-SPECIFIC FUNCTIONS
# ----------------------------------------------------------------------------

# Display help information
show_help() {
    echo ""
    echo -e "${BOLD}Windows Build Script for Ledger${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo "  $0 [options]"
    echo ""
    echo -e "${BOLD}Target Options:${NC}"
    echo "  --nsis            Build NSIS installer (traditional .exe installer)"
    echo "  --portable        Build portable version (single .exe, no install needed)"
    echo "  --msi             Build MSI installer (for enterprise/IT deployment)"
    echo "  --all             Build all formats"
    echo ""
    echo "  If no target is specified, builds NSIS installer by default."
    echo ""
    echo -e "${BOLD}Architecture Options:${NC}"
    echo "  --x64             Build for 64-bit Windows (default, recommended)"
    echo "  --ia32            Build for 32-bit Windows (legacy support)"
    echo "  --both            Build for both 32-bit and 64-bit"
    echo ""
    echo -e "${BOLD}Build Options:${NC}"
    echo "  --status          Show build directory status and disk usage"
    echo "  --skip-deps       Skip npm dependency installation"
    echo "  --skip-signing    Skip code signing"
    echo ""
    echo -e "${BOLD}Code Signing Options:${NC}"
    echo "  --cert=FILE       Path to .pfx certificate file"
    echo "  --crt-pass=PASS  Certificate password (or use CSC_KEY_PASSWORD env var)"
    echo ""
    echo -e "${BOLD}Other Options:${NC}"
    echo "  --help, -h        Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0                                  # Build NSIS installer"
    echo "  $0 --portable --status              # Portable build, show disk usage first"
    echo "  $0 --all --x64                      # All formats, 64-bit only"
    echo "  $0 --nsis --cert=cert.pfx           # Signed NSIS installer"
    echo ""
    echo -e "${BOLD}Output Locations:${NC}"
    echo "  NSIS Installer:  dist/ledger-{version}-setup.exe"
    echo "  Portable:        dist/ledger-{version}-portable.exe"
    echo "  MSI:             dist/ledger-{version}.msi"
    echo ""
    echo -e "${BOLD}About the Formats:${NC}"
    echo ""
    echo "  ${BOLD}NSIS Installer${NC} (Recommended for most users)"
    echo "    - Traditional Windows installer with wizard interface"
    echo "    - Creates Start Menu shortcuts and desktop icon"
    echo "    - Includes uninstaller for clean removal"
    echo "    - Users double-click to install, then run from Start Menu"
    echo ""
    echo "  ${BOLD}Portable${NC} (For USB drives, no admin rights needed)"
    echo "    - Single .exe file that runs without installation"
    echo "    - Settings stored alongside the executable"
    echo "    - Great for running from USB drives"
    echo "    - No admin privileges required"
    echo ""
    echo "  ${BOLD}MSI${NC} (For IT/Enterprise deployment)"
    echo "    - Windows Installer format for Group Policy deployment"
    echo "    - Silent installation support"
    echo "    - Used by IT departments for mass deployment"
    echo ""
    echo -e "${BOLD}Cross-Platform Building:${NC}"
    echo "  You can build Windows apps from macOS or Linux!"
    echo "  The script will automatically use Wine if needed."
    echo "  Install Wine: brew install wine (macOS) or apt install wine (Linux)"
    echo ""
}

# Parse Windows-specific command-line arguments
parse_windows_args() {
    local target_specified=false

    for arg in "$@"; do
        case $arg in
            --nsis)
                BUILD_NSIS=true
                target_specified=true
                ;;
            --portable)
                BUILD_PORTABLE=true
                target_specified=true
                ;;
            --msi)
                BUILD_MSI=true
                target_specified=true
                ;;
            --all)
                BUILD_ALL=true
                BUILD_NSIS=true
                BUILD_PORTABLE=true
                BUILD_MSI=true
                target_specified=true
                ;;
            --x64)
                BUILD_ARCH="x64"
                ;;
            --ia32)
                BUILD_ARCH="ia32"
                ;;
            --both)
                BUILD_ARCH="both"
                ;;
            --skip-signing)
                SKIP_SIGNING=true
                ;;
            --cert=*)
                SIGN_CERT_FILE="${arg#*=}"
                ;;
            --cert-pass=*)
                SIGN_CERT_PASSWORD="${arg#*=}"
                ;;
        esac
    done

    # Reset non-specified targets if explicit targets given
    if [ "$target_specified" = true ] && [ "$BUILD_ALL" = false ]; then
        if [[ " $@ " != *" --nsis "* ]] && [[ " $@ " != *" --all "* ]]; then
            BUILD_NSIS=false
        fi
    fi
}

# Check if we're on Windows or need to cross-compile
check_platform() {
    log_step "Checking build platform..."

    local os_type=$(uname -s)

    case "$os_type" in
        MINGW*|MSYS*|CYGWIN*)
            log_info "Running on Windows (native)"
            IS_CROSS_BUILD=false
            ;;
        Linux)
            log_info "Running on Linux (cross-compilation mode)"
            IS_CROSS_BUILD=true
            check_wine
            ;;
        Darwin)
            log_info "Running on macOS (cross-compilation mode)"
            IS_CROSS_BUILD=true
            check_wine
            ;;
        *)
            log_warn "Unknown operating system: $os_type"
            log_info "Attempting build anyway..."
            IS_CROSS_BUILD=true
            ;;
    esac
}

# Check for Wine (needed for cross-compilation)
check_wine() {
    log_step "Checking for Wine (needed for cross-compilation)..."

    if command -v wine &> /dev/null; then
        HAS_WINE=true
        local wine_version=$(wine --version 2>/dev/null || echo "unknown")
        log_success "Wine found: $wine_version"
    else
        HAS_WINE=false
        log_warn "Wine is not installed"
        log_info ""
        log_info "Wine is recommended for building Windows apps from Linux/macOS."
        log_info "Without Wine, some build features may not work."
        log_info ""

        if [[ "$(uname)" == "Darwin" ]]; then
            log_info "To install Wine on macOS:"
            log_info "  brew install wine-stable"
            log_info "  # or for better compatibility:"
            log_info "  brew install --cask wine-stable"
        else
            log_info "To install Wine on Linux:"
            log_info "  Ubuntu/Debian: sudo apt install wine64 wine32"
            log_info "  Fedora:        sudo dnf install wine"
            log_info "  Arch:          sudo pacman -S wine"
        fi
        log_info ""
        log_info "Continuing without Wine (build may still work)..."
    fi
}

# Check for code signing tools
check_signing_tools() {
    if [ "$SKIP_SIGNING" = true ]; then
        log_info "Code signing will be skipped (--skip-signing)"
        return 0
    fi

    log_step "Checking code signing configuration..."

    # Check if certificate file was provided
    if [ -n "$SIGN_CERT_FILE" ]; then
        if [ -f "$SIGN_CERT_FILE" ]; then
            log_success "Certificate file found: $SIGN_CERT_FILE"

            # Set environment variables for electron-builder
            export CSC_LINK="$SIGN_CERT_FILE"

            if [ -n "$SIGN_CERT_PASSWORD" ]; then
                export CSC_KEY_PASSWORD="$SIGN_CERT_PASSWORD"
            elif [ -n "$CSC_KEY_PASSWORD" ]; then
                log_info "Using CSC_KEY_PASSWORD from environment"
            else
                log_warn "No certificate password provided"
                log_info "Set --cert-pass=PASSWORD or CSC_KEY_PASSWORD environment variable"
            fi
        else
            log_error "Certificate file not found: $SIGN_CERT_FILE"
            log_info "Build will continue without code signing"
            SKIP_SIGNING=true
        fi
    else
        # Check for environment variable
        if [ -n "$CSC_LINK" ]; then
            log_success "Certificate configured via CSC_LINK environment variable"
        else
            log_info "No code signing certificate configured"
            log_info ""
            log_info "To sign your Windows app, you need a code signing certificate."
            log_info "Options:"
            log_info "  1. Purchase from a Certificate Authority (DigiCert, Sectigo, etc.)"
            log_info "  2. Use Azure SignTool for EV certificates"
            log_info "  3. Create a self-signed certificate for testing"
            log_info ""
            log_info "Configure signing by:"
            log_info "  - Using --cert=path/to/certificate.pfx"
            log_info "  - Setting CSC_LINK and CSC_KEY_PASSWORD environment variables"
            log_info ""
            log_info "Building without code signing..."
            SKIP_SIGNING=true
        fi
    fi

    if [ "$SKIP_SIGNING" = true ]; then
        # Disable auto-discovery
        export CSC_IDENTITY_AUTO_DISCOVERY=false
    fi
}

# Build the target list string for electron-builder
# Returns space-separated targets (electron-builder expects this format)
get_build_targets() {
    local targets=""

    if [ "$BUILD_NSIS" = true ]; then
        targets+="nsis "
    fi

    if [ "$BUILD_PORTABLE" = true ]; then
        targets+="portable "
    fi

    if [ "$BUILD_MSI" = true ]; then
        targets+="msi "
    fi

    # Remove trailing space
    targets="${targets% }"

    echo "$targets"
}

# Run the Windows-specific build
# Idempotent: Safe to run multiple times (overwrites previous build)
run_windows_build() {
    local targets
    targets=$(get_build_targets)

    log_header "Building for Windows"
    log_info "Targets: $targets"
    log_info "Architecture: $BUILD_ARCH"
    log_info "Cross-build: $IS_CROSS_BUILD"

    cd "$PROJECT_ROOT" || exit 1

    # Build the electron-builder command
    local build_cmd="npx electron-builder --win $targets"

    # Add architecture
    case $BUILD_ARCH in
        x64)
            build_cmd+=" --x64"
            ;;
        ia32)
            build_cmd+=" --ia32"
            ;;
        both)
            build_cmd+=" --x64 --ia32"
            ;;
    esac

    log_step "Running: $build_cmd"
    log_info "This may take several minutes..."

    if [ "$IS_CROSS_BUILD" = true ] && [ "$HAS_WINE" = false ]; then
        log_warn "Building without Wine - some features may not work"
    fi

    echo ""

    # Run the build
    eval "$build_cmd"
}

# Verify Windows build output
verify_windows_build() {
    log_header "Verifying Build"

    local found_any=false

    # Check for NSIS installer
    if [ "$BUILD_NSIS" = true ]; then
        local nsis=$(find "$DIST_DIR" -name "*-setup.exe" -type f 2>/dev/null | head -1)
        if [ -n "$nsis" ]; then
            local size=$(get_file_size "$nsis")
            log_success "NSIS installer created: $nsis ($size)"
            found_any=true
        else
            log_warn "NSIS installer not found (was expected)"
        fi
    fi

    # Check for portable
    if [ "$BUILD_PORTABLE" = true ]; then
        local portable=$(find "$DIST_DIR" -name "*-portable.exe" -o -name "*.exe" -path "*/win-unpacked/*" -type f 2>/dev/null | head -1)
        if [ -n "$portable" ]; then
            local size=$(get_file_size "$portable")
            log_success "Portable executable created: $portable ($size)"
            found_any=true
        fi
    fi

    # Check for MSI
    if [ "$BUILD_MSI" = true ]; then
        local msi=$(find "$DIST_DIR" -name "*.msi" -type f 2>/dev/null | head -1)
        if [ -n "$msi" ]; then
            local size=$(get_file_size "$msi")
            log_success "MSI installer created: $msi ($size)"
            found_any=true
        else
            log_warn "MSI installer not found (was expected)"
        fi
    fi

    # Check for any .exe files as fallback
    if [ "$found_any" = false ]; then
        local any_exe=$(find "$DIST_DIR" -name "*.exe" -type f 2>/dev/null | head -1)
        if [ -n "$any_exe" ]; then
            local size=$(get_file_size "$any_exe")
            log_success "Executable found: $any_exe ($size)"
            found_any=true
        fi
    fi

    if [ "$found_any" = false ]; then
        log_error "No build artifacts were created"
        return 1
    fi

    return 0
}

# Display Windows-specific build summary
show_windows_summary() {
    log_header "Windows Build Complete!"

    echo -e "${BOLD}Build Details:${NC}"
    echo "  Application:    $APP_NAME"
    echo "  Version:        $APP_VERSION"
    echo "  Architecture:   $BUILD_ARCH"
    echo "  Cross-build:    $([ "$IS_CROSS_BUILD" = true ] && echo 'Yes' || echo 'No')"
    echo "  Signed:         $([ "$SKIP_SIGNING" = true ] && echo 'No' || echo 'Yes')"
    echo ""

    echo -e "${BOLD}Generated Installers:${NC}"

    find "$DIST_DIR" -type f \( -name "*.exe" -o -name "*.msi" \) 2>/dev/null | grep -v "win-unpacked" | while read -r file; do
        local size=$(get_file_size "$file")
        local filename=$(basename "$file")
        echo "  $filename ($size)"
    done
    echo ""

    echo -e "${BOLD}Installation Instructions:${NC}"
    echo ""

    # NSIS
    local nsis=$(find "$DIST_DIR" -name "*-setup.exe" -type f 2>/dev/null | head -1)
    if [ -n "$nsis" ]; then
        echo "  ${BOLD}NSIS Installer:${NC}"
        echo "    1. Copy $(basename "$nsis") to a Windows computer"
        echo "    2. Double-click to run the installer"
        echo "    3. Follow the installation wizard"
        echo "    4. Launch from Start Menu or Desktop shortcut"
        echo ""
    fi

    # MSI
    local msi=$(find "$DIST_DIR" -name "*.msi" -type f 2>/dev/null | head -1)
    if [ -n "$msi" ]; then
        echo "  ${BOLD}MSI Installer:${NC}"
        echo "    Double-click: $(basename "$msi")"
        echo "    Command line: msiexec /i $(basename "$msi")"
        echo "    Silent install: msiexec /i $(basename "$msi") /quiet"
        echo ""
    fi

    if [ "$SKIP_SIGNING" = true ]; then
        echo -e "${YELLOW}${BOLD}Security Notice:${NC}"
        echo "  The executables are NOT code-signed."
        echo "  Windows SmartScreen may show a warning when users try to run them."
        echo "  To avoid this, sign your app with a code signing certificate."
        echo ""
    fi

    echo -e "${BOLD}Output Directory:${NC}"
    echo "  $DIST_DIR"
    echo ""
}

# ----------------------------------------------------------------------------
# MAIN EXECUTION
# ----------------------------------------------------------------------------

main() {
    # Reset state for idempotent behavior
    reset_build_state
    reset_windows_state

    # Parse all command-line arguments
    parse_common_args "$@"
    parse_windows_args "$@"

    # Show help if requested
    if [ "$SHOW_HELP" = true ]; then
        show_help
        exit 0
    fi

    log_header "Ledger Windows Build"
    log_info "Building version $APP_VERSION"

    # Windows-specific checks
    check_platform
    check_signing_tools

    # Run common pre-build steps
    run_prebuild

    # Run Windows-specific build
    run_windows_build

    # Verify the build
    verify_windows_build

    # Show summary
    show_windows_summary

    print_footer

    log_success "Windows build completed successfully!"
}

# Run main function with all command-line arguments
main "$@"
