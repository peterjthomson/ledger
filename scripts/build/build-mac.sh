#!/bin/bash
# ============================================================================
# build-mac.sh - macOS Build Script for Ledger
# ============================================================================
# This script builds the Ledger application for macOS (Apple's operating system).
#
# WHAT THIS SCRIPT DOES:
# 1. Checks that you have the required tools installed
# 2. Compiles the TypeScript/React code into JavaScript
# 3. Packages everything into a macOS application (.app bundle)
# 4. Optionally signs the app with an Apple Developer certificate
# 5. Optionally notarizes the app with Apple (required for distribution)
#
# USAGE:
#   ./build-mac.sh                    # Build for current Mac architecture
#   ./build-mac.sh --arm64            # Build for Apple Silicon (M1/M2/M3)
#   ./build-mac.sh --x64              # Build for Intel Macs
#   ./build-mac.sh --universal        # Build for both architectures
#   ./build-mac.sh --clean            # Clean build directories first
#   ./build-mac.sh --skip-notarize    # Skip Apple notarization
#
# PREREQUISITES:
# - macOS operating system (this script must run on a Mac)
# - Node.js 18+ installed
# - Xcode Command Line Tools (for code signing)
# - Apple Developer certificate (for signed/notarized builds)
#
# ============================================================================

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source (include) the common utilities
source "$SCRIPT_DIR/build-common.sh"

# ----------------------------------------------------------------------------
# MACOS-SPECIFIC VARIABLES
# ----------------------------------------------------------------------------
# These are reset by reset_mac_state() for idempotency

# Reset macOS-specific state to defaults
# Call this at the start of main() for idempotent behavior
reset_mac_state() {
    BUILD_ARCH=""           # Will be set based on command-line args
    SKIP_NOTARIZE=false     # Whether to skip Apple notarization
    SKIP_SIGNING=false      # Whether to skip code signing
}

# Initialize defaults
reset_mac_state

# ----------------------------------------------------------------------------
# MACOS-SPECIFIC FUNCTIONS
# ----------------------------------------------------------------------------

# Display help information
show_help() {
    echo ""
    echo -e "${BOLD}macOS Build Script for Ledger${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo "  $0 [options]"
    echo ""
    echo -e "${BOLD}Architecture Options:${NC}"
    echo "  --arm64           Build for Apple Silicon Macs (M1, M2, M3, M4)"
    echo "                    These are the newer Macs with Apple's own processors"
    echo ""
    echo "  --x64             Build for Intel Macs"
    echo "                    These are older Macs with Intel processors"
    echo ""
    echo "  --universal       Build for BOTH architectures in one app"
    echo "                    The app works on any Mac, but file size is ~2x larger"
    echo ""
    echo -e "${BOLD}Build Options:${NC}"
    echo "  --status          Show build directory status and disk usage"
    echo "  --skip-deps       Skip npm dependency installation"
    echo "  --skip-notarize   Skip Apple notarization step"
    echo "  --skip-signing    Skip code signing (for development only)"
    echo ""
    echo -e "${BOLD}Other Options:${NC}"
    echo "  --help, -h        Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0 --arm64                    # Standard Apple Silicon build"
    echo "  $0 --x64 --status             # Intel build, show disk usage first"
    echo "  $0 --universal --skip-deps    # Universal build, skip npm install"
    echo ""
    echo -e "${BOLD}Output Locations:${NC}"
    echo "  App Bundle:    dist/mac-{arch}/Ledger.app"
    echo "  ZIP Archive:   dist/Ledger-{version}-{arch}.zip"
    echo "  DMG Installer: dist/Ledger-{version}-{arch}.dmg (if enabled)"
    echo ""
}

# Parse macOS-specific command-line arguments
parse_mac_args() {
    for arg in "$@"; do
        case $arg in
            --arm64)
                BUILD_ARCH="arm64"
                ;;
            --x64)
                BUILD_ARCH="x64"
                ;;
            --universal)
                BUILD_ARCH="universal"
                ;;
            --skip-notarize)
                SKIP_NOTARIZE=true
                ;;
            --skip-signing)
                SKIP_SIGNING=true
                ;;
        esac
    done

    # If no architecture specified, detect current system
    if [ -z "$BUILD_ARCH" ]; then
        detect_architecture
    fi
}

# Detect the current Mac's architecture
detect_architecture() {
    local arch=$(uname -m)
    case $arch in
        arm64)
            BUILD_ARCH="arm64"
            log_info "Detected Apple Silicon Mac (arm64)"
            ;;
        x86_64)
            BUILD_ARCH="x64"
            log_info "Detected Intel Mac (x64)"
            ;;
        *)
            log_warn "Unknown architecture: $arch, defaulting to arm64"
            BUILD_ARCH="arm64"
            ;;
    esac
}

# Check that we're running on macOS
check_macos() {
    if [[ "$(uname)" != "Darwin" ]]; then
        log_error "This script must be run on macOS"
        log_info "You are running: $(uname -s)"
        log_info "To build for macOS from another OS, you would need:"
        log_info "  - A macOS virtual machine, or"
        log_info "  - A CI/CD service with macOS runners (like GitHub Actions)"
        exit 1
    fi

    # Get macOS version
    local macos_version=$(sw_vers -productVersion)
    log_info "Running on macOS $macos_version"
}

# Check for Xcode Command Line Tools
check_xcode_tools() {
    log_step "Checking for Xcode Command Line Tools..."

    if ! xcode-select -p &> /dev/null; then
        log_warn "Xcode Command Line Tools not found"
        log_info "Installing... (this may take a while)"
        xcode-select --install

        log_info "Please complete the installation and run this script again"
        exit 1
    fi

    log_success "Xcode Command Line Tools found"
}

# Check for code signing certificate
check_signing_certificate() {
    if [ "$SKIP_SIGNING" = true ]; then
        log_info "Code signing will be skipped (--skip-signing)"
        return 0
    fi

    log_step "Checking for code signing certificate..."

    # List available signing identities
    local identities=$(security find-identity -v -p codesigning 2>/dev/null)

    if [ -z "$identities" ] || [[ "$identities" == *"0 valid identities found"* ]]; then
        log_warn "No code signing certificates found"
        log_info ""
        log_info "To distribute your app, you need an Apple Developer certificate."
        log_info "Options:"
        log_info "  1. Join Apple Developer Program (\$99/year): https://developer.apple.com/programs/"
        log_info "  2. Build unsigned for personal use (add --skip-signing)"
        log_info ""
        log_info "For now, continuing with unsigned build..."
        SKIP_SIGNING=true
    else
        log_success "Code signing certificate(s) found:"
        echo "$identities" | head -5 | while read -r line; do
            log_info "  $line"
        done
    fi
}

# Check for notarization credentials
check_notarization_credentials() {
    if [ "$SKIP_NOTARIZE" = true ] || [ "$SKIP_SIGNING" = true ]; then
        log_info "Notarization will be skipped"
        return 0
    fi

    log_step "Checking notarization configuration..."

    # electron-builder uses these environment variables for notarization
    if [ -z "$APPLE_ID" ] || [ -z "$APPLE_APP_SPECIFIC_PASSWORD" ]; then
        log_warn "Notarization credentials not configured"
        log_info ""
        log_info "To notarize your app (required for distribution), set these environment variables:"
        log_info "  export APPLE_ID='your-apple-id@email.com'"
        log_info "  export APPLE_APP_SPECIFIC_PASSWORD='your-app-specific-password'"
        log_info "  export APPLE_TEAM_ID='your-team-id' (optional)"
        log_info ""
        log_info "To generate an app-specific password:"
        log_info "  1. Go to https://appleid.apple.com/account/manage"
        log_info "  2. Sign in with your Apple ID"
        log_info "  3. Go to 'Sign-In and Security' > 'App-Specific Passwords'"
        log_info ""
        log_info "Continuing without notarization..."
        SKIP_NOTARIZE=true
    else
        log_success "Notarization credentials found"
    fi
}

# Run the macOS-specific build
# Idempotent: Safe to run multiple times (overwrites previous build)
run_mac_build() {
    log_header "Building for macOS ($BUILD_ARCH)"

    cd "$PROJECT_ROOT" || exit 1

    # Build the electron-builder command
    local build_cmd="npx electron-builder --mac"

    # Add architecture flag
    case $BUILD_ARCH in
        arm64)
            build_cmd="$build_cmd --arm64"
            ;;
        x64)
            build_cmd="$build_cmd --x64"
            ;;
        universal)
            build_cmd="$build_cmd --universal"
            ;;
    esac

    # Add configuration overrides if skipping signing
    if [ "$SKIP_SIGNING" = true ]; then
        # Set environment variable to skip signing
        export CSC_IDENTITY_AUTO_DISCOVERY=false
        log_info "Code signing disabled"
    fi

    # Handle notarization
    if [ "$SKIP_NOTARIZE" = true ]; then
        # Create a temporary config override to disable notarization
        export NOTARIZE=false
        log_info "Notarization disabled"
    fi

    log_step "Running: $build_cmd"
    log_info "This may take several minutes..."
    echo ""

    # Run the build
    eval "$build_cmd"

    # Post-build: Remove quarantine attribute (macOS security feature)
    # This allows the app to run without "unidentified developer" warnings
    local app_path="$DIST_DIR/mac-$BUILD_ARCH/Ledger.app"
    if [ -d "$app_path" ]; then
        log_step "Removing quarantine attribute..."
        xattr -cr "$app_path" 2>/dev/null || true
        log_success "Quarantine attribute removed"
    fi
}

# Verify macOS build output
verify_mac_build() {
    log_header "Verifying Build"

    local app_dir="$DIST_DIR/mac-$BUILD_ARCH"
    local app_path="$app_dir/Ledger.app"

    # Check for .app bundle
    if [ -d "$app_path" ]; then
        log_success "Application bundle created: $app_path"

        # Get app size
        local app_size=$(du -sh "$app_path" | cut -f1)
        log_info "Application size: $app_size"

        # Check if app is signed
        if codesign -v "$app_path" 2>/dev/null; then
            log_success "Application is properly signed"
        else
            if [ "$SKIP_SIGNING" = true ]; then
                log_info "Application is unsigned (--skip-signing was used)"
            else
                log_warn "Application signature could not be verified"
            fi
        fi
    else
        log_error "Application bundle not found at: $app_path"
        return 1
    fi

    # Check for distributable files (ZIP, DMG)
    log_step "Checking for distributable files..."

    local zip_files=$(find "$DIST_DIR" -name "*.zip" -type f 2>/dev/null)
    if [ -n "$zip_files" ]; then
        echo "$zip_files" | while read -r file; do
            local size=$(get_file_size "$file")
            log_success "ZIP archive: $file ($size)"
        done
    fi

    local dmg_files=$(find "$DIST_DIR" -name "*.dmg" -type f 2>/dev/null)
    if [ -n "$dmg_files" ]; then
        echo "$dmg_files" | while read -r file; do
            local size=$(get_file_size "$file")
            log_success "DMG installer: $file ($size)"
        done
    fi

    return 0
}

# Display macOS-specific build summary
show_mac_summary() {
    log_header "macOS Build Complete!"

    echo -e "${BOLD}Build Details:${NC}"
    echo "  Application:    $APP_NAME"
    echo "  Version:        $APP_VERSION"
    echo "  Architecture:   $BUILD_ARCH"
    echo "  Signed:         $([ "$SKIP_SIGNING" = true ] && echo 'No' || echo 'Yes')"
    echo "  Notarized:      $([ "$SKIP_NOTARIZE" = true ] && echo 'No' || echo 'Yes')"
    echo ""

    echo -e "${BOLD}Output Files:${NC}"
    local app_path="$DIST_DIR/mac-$BUILD_ARCH/Ledger.app"
    if [ -d "$app_path" ]; then
        echo "  App Bundle: $app_path"
    fi

    find "$DIST_DIR" -name "*.zip" -o -name "*.dmg" 2>/dev/null | while read -r file; do
        echo "  Distributable: $file"
    done
    echo ""

    echo -e "${BOLD}Next Steps:${NC}"
    if [ "$SKIP_SIGNING" = true ]; then
        echo "  - To distribute, you'll need to sign the app with an Apple Developer certificate"
    fi
    if [ "$SKIP_NOTARIZE" = true ]; then
        echo "  - To distribute outside the App Store, notarization is required"
    fi
    echo "  - To run the app: open $DIST_DIR/mac-$BUILD_ARCH/Ledger.app"
    echo ""
}

# ----------------------------------------------------------------------------
# MAIN EXECUTION
# ----------------------------------------------------------------------------

main() {
    # Reset state for idempotent behavior
    reset_build_state
    reset_mac_state

    # Parse all command-line arguments
    parse_common_args "$@"
    parse_mac_args "$@"

    # Show help if requested
    if [ "$SHOW_HELP" = true ]; then
        show_help
        exit 0
    fi

    log_header "Ledger macOS Build"
    log_info "Building version $APP_VERSION for $BUILD_ARCH"

    # macOS-specific checks
    check_macos
    check_xcode_tools
    check_signing_certificate
    check_notarization_credentials

    # Run common pre-build steps
    run_prebuild

    # Run macOS-specific build
    run_mac_build

    # Verify the build
    verify_mac_build

    # Show summary
    show_mac_summary

    print_footer

    log_success "macOS build completed successfully!"
}

# Run main function with all command-line arguments
main "$@" 
