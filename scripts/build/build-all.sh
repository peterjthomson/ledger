#!/bin/bash
# ============================================================================
# build-all.sh - Multi-Platform Build Script for Ledger
# ============================================================================
# This script builds the Ledger application for multiple platforms in one run.
#
# WHAT THIS SCRIPT DOES:
# 1. Compiles the TypeScript/React code once
# 2. Packages the app for each selected platform
# 3. Provides a summary of all generated files
#
# USAGE:
#   ./build-all.sh                    # Build for current platform only
#   ./build-all.sh --mac --linux      # Build for macOS and Linux
#   ./build-all.sh --all              # Build for all platforms
#   ./build-all.sh --clean --all      # Clean build for all platforms
#
# IMPORTANT NOTES:
# - macOS builds can ONLY be done on macOS (Apple requirement)
# - Linux and Windows builds can be done from any platform
# - Code signing requires the respective platform's tools
#
# ============================================================================

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source (include) the common utilities
source "$SCRIPT_DIR/build-common.sh"

# ----------------------------------------------------------------------------
# MULTI-PLATFORM VARIABLES
# ----------------------------------------------------------------------------
# These are reset by reset_multi_state() for idempotency

# Reset multi-platform state to defaults
# Call this at the start of main() for idempotent behavior
reset_multi_state() {
    # Which platforms to build for
    BUILD_MAC=false
    BUILD_LINUX=false
    BUILD_WINDOWS=false
    BUILD_ALL_PLATFORMS=false

    # Track what was explicitly requested
    PLATFORMS_SPECIFIED=false

    # Track build results (reset the associative array)
    BUILD_RESULTS=()
}

# Initialize defaults
BUILD_MAC=false
BUILD_LINUX=false
BUILD_WINDOWS=false
BUILD_ALL_PLATFORMS=false
PLATFORMS_SPECIFIED=false
declare -A BUILD_RESULTS

# ----------------------------------------------------------------------------
# FUNCTIONS
# ----------------------------------------------------------------------------

# Display help information
show_help() {
    echo ""
    echo -e "${BOLD}Multi-Platform Build Script for Ledger${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo "  $0 [options]"
    echo ""
    echo -e "${BOLD}Platform Options:${NC}"
    echo "  --mac             Build for macOS (requires macOS)"
    echo "  --linux           Build for Linux"
    echo "  --windows, --win  Build for Windows"
    echo "  --all             Build for all platforms"
    echo ""
    echo "  If no platform is specified, builds for the current platform only."
    echo ""
    echo -e "${BOLD}Build Options:${NC}"
    echo "  --status          Show build directory status and disk usage"
    echo "  --skip-deps       Skip npm dependency installation"
    echo ""
    echo -e "${BOLD}Other Options:${NC}"
    echo "  --help, -h        Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0                          # Build for current platform"
    echo "  $0 --linux --windows        # Build for Linux and Windows"
    echo "  $0 --all --status           # Build all, show disk usage first"
    echo "  $0 --mac                    # Build for macOS only"
    echo ""
    echo -e "${BOLD}Platform Compatibility:${NC}"
    echo ""
    echo "  ${BOLD}From macOS, you can build for:${NC}"
    echo "    - macOS (native, with code signing and notarization)"
    echo "    - Linux (cross-compile)"
    echo "    - Windows (cross-compile, requires Wine for some features)"
    echo ""
    echo "  ${BOLD}From Linux, you can build for:${NC}"
    echo "    - Linux (native)"
    echo "    - Windows (cross-compile, requires Wine for some features)"
    echo "    - macOS: NOT POSSIBLE (Apple restriction)"
    echo ""
    echo "  ${BOLD}From Windows, you can build for:${NC}"
    echo "    - Windows (native, with code signing)"
    echo "    - Linux (may require WSL)"
    echo "    - macOS: NOT POSSIBLE (Apple restriction)"
    echo ""
    echo -e "${BOLD}Output Directory:${NC}"
    echo "  All builds are placed in: dist/"
    echo ""
}

# Parse multi-platform arguments
parse_multi_args() {
    for arg in "$@"; do
        case $arg in
            --mac)
                BUILD_MAC=true
                PLATFORMS_SPECIFIED=true
                ;;
            --linux)
                BUILD_LINUX=true
                PLATFORMS_SPECIFIED=true
                ;;
            --windows|--win)
                BUILD_WINDOWS=true
                PLATFORMS_SPECIFIED=true
                ;;
            --all)
                BUILD_ALL_PLATFORMS=true
                BUILD_MAC=true
                BUILD_LINUX=true
                BUILD_WINDOWS=true
                PLATFORMS_SPECIFIED=true
                ;;
        esac
    done

    # If no platform specified, build for current platform
    if [ "$PLATFORMS_SPECIFIED" = false ]; then
        detect_current_platform
    fi
}

# Detect and set current platform as build target
detect_current_platform() {
    local os_type=$(uname -s)

    case "$os_type" in
        Darwin)
            log_info "No platform specified, building for current platform: macOS"
            BUILD_MAC=true
            ;;
        Linux)
            log_info "No platform specified, building for current platform: Linux"
            BUILD_LINUX=true
            ;;
        MINGW*|MSYS*|CYGWIN*)
            log_info "No platform specified, building for current platform: Windows"
            BUILD_WINDOWS=true
            ;;
        *)
            log_warn "Unknown platform: $os_type"
            log_info "Defaulting to Linux build"
            BUILD_LINUX=true
            ;;
    esac
}

# Check if macOS build is possible
check_mac_capability() {
    if [ "$BUILD_MAC" = true ]; then
        if [[ "$(uname)" != "Darwin" ]]; then
            log_error "Cannot build for macOS from $(uname)"
            log_info "macOS builds require a macOS computer (Apple restriction)"
            log_info "Options:"
            log_info "  - Use a Mac computer"
            log_info "  - Use GitHub Actions with macos-latest runner"
            log_info "  - Use a macOS cloud service (MacStadium, AWS EC2 Mac)"
            BUILD_MAC=false
            BUILD_RESULTS["macOS"]="SKIPPED (requires macOS)"
        fi
    fi
}

# Display platforms to be built
show_build_plan() {
    log_header "Build Plan"

    echo "Platforms to build:"
    echo ""

    if [ "$BUILD_MAC" = true ]; then
        echo -e "  ${GREEN}[x]${NC} macOS"
    else
        echo -e "  ${YELLOW}[ ]${NC} macOS (not selected)"
    fi

    if [ "$BUILD_LINUX" = true ]; then
        echo -e "  ${GREEN}[x]${NC} Linux"
    else
        echo -e "  ${YELLOW}[ ]${NC} Linux (not selected)"
    fi

    if [ "$BUILD_WINDOWS" = true ]; then
        echo -e "  ${GREEN}[x]${NC} Windows"
    else
        echo -e "  ${YELLOW}[ ]${NC} Windows (not selected)"
    fi

    echo ""
}

# Build for macOS
build_mac() {
    if [ "$BUILD_MAC" = true ]; then
        log_header "Building for macOS"

        if "$SCRIPT_DIR/build-mac.sh" --skip-deps; then
            BUILD_RESULTS["macOS"]="SUCCESS"
            log_success "macOS build completed"
        else
            BUILD_RESULTS["macOS"]="FAILED"
            log_error "macOS build failed"
        fi
    fi
}

# Build for Linux
build_linux() {
    if [ "$BUILD_LINUX" = true ]; then
        log_header "Building for Linux"

        if "$SCRIPT_DIR/build-linux.sh" --skip-deps; then
            BUILD_RESULTS["Linux"]="SUCCESS"
            log_success "Linux build completed"
        else
            BUILD_RESULTS["Linux"]="FAILED"
            log_error "Linux build failed"
        fi
    fi
}

# Build for Windows
build_windows() {
    if [ "$BUILD_WINDOWS" = true ]; then
        log_header "Building for Windows"

        if "$SCRIPT_DIR/build-windows.sh" --skip-deps; then
            BUILD_RESULTS["Windows"]="SUCCESS"
            log_success "Windows build completed"
        else
            BUILD_RESULTS["Windows"]="FAILED"
            log_error "Windows build failed"
        fi
    fi
}

# Show final summary
show_final_summary() {
    log_header "Multi-Platform Build Summary"

    echo -e "${BOLD}Application:${NC} $APP_NAME v$APP_VERSION"
    echo ""

    echo -e "${BOLD}Build Results:${NC}"
    echo ""

    local has_success=false
    local has_failure=false

    for platform in "macOS" "Linux" "Windows"; do
        local result="${BUILD_RESULTS[$platform]}"
        if [ -n "$result" ]; then
            case "$result" in
                SUCCESS)
                    echo -e "  $platform: ${GREEN}SUCCESS${NC}"
                    has_success=true
                    ;;
                FAILED)
                    echo -e "  $platform: ${RED}FAILED${NC}"
                    has_failure=true
                    ;;
                SKIPPED*)
                    echo -e "  $platform: ${YELLOW}$result${NC}"
                    ;;
            esac
        fi
    done

    echo ""

    # List all generated files
    if [ "$has_success" = true ]; then
        echo -e "${BOLD}Generated Files:${NC}"
        echo ""

        # macOS files
        if [ "${BUILD_RESULTS[macOS]}" = "SUCCESS" ]; then
            echo "  macOS:"
            find "$DIST_DIR" -type d -name "*.app" 2>/dev/null | while read -r f; do
                echo "    $(basename "$f")"
            done
            find "$DIST_DIR" -name "*.dmg" -o -name "*mac*.zip" 2>/dev/null | while read -r f; do
                local size=$(get_file_size "$f")
                echo "    $(basename "$f") ($size)"
            done
            echo ""
        fi

        # Linux files
        if [ "${BUILD_RESULTS[Linux]}" = "SUCCESS" ]; then
            echo "  Linux:"
            find "$DIST_DIR" -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" 2>/dev/null | while read -r f; do
                local size=$(get_file_size "$f")
                echo "    $(basename "$f") ($size)"
            done
            echo ""
        fi

        # Windows files
        if [ "${BUILD_RESULTS[Windows]}" = "SUCCESS" ]; then
            echo "  Windows:"
            find "$DIST_DIR" -name "*.exe" -o -name "*.msi" 2>/dev/null | grep -v "win-unpacked" | while read -r f; do
                local size=$(get_file_size "$f")
                echo "    $(basename "$f") ($size)"
            done
            echo ""
        fi
    fi

    echo -e "${BOLD}Output Directory:${NC} $DIST_DIR"
    echo ""

    # Exit with error if any build failed
    if [ "$has_failure" = true ]; then
        log_warn "One or more builds failed. Check the logs above for details."
        return 1
    fi

    return 0
}

# ----------------------------------------------------------------------------
# MAIN EXECUTION
# ----------------------------------------------------------------------------

main() {
    # Reset state for idempotent behavior
    reset_build_state
    reset_multi_state

    # Parse arguments
    parse_common_args "$@"
    parse_multi_args "$@"

    # Show help if requested
    if [ "$SHOW_HELP" = true ]; then
        show_help
        exit 0
    fi

    log_header "Ledger Multi-Platform Build"
    log_info "Building version $APP_VERSION"

    # Check platform capabilities
    check_mac_capability

    # Show what we're going to build
    show_build_plan

    # Run common pre-build steps (once for all platforms)
    run_prebuild

    # Build for each platform
    build_mac
    build_linux
    build_windows

    # Show final summary
    show_final_summary

    print_footer

    # Count successes
    local success_count=0
    for result in "${BUILD_RESULTS[@]}"; do
        if [ "$result" = "SUCCESS" ]; then
            ((success_count++))
        fi
    done

    if [ $success_count -gt 0 ]; then
        log_success "Completed $success_count platform build(s) successfully!"
    else
        log_error "No builds completed successfully"
        exit 1
    fi
}

# Run main function with all command-line arguments
main "$@"
