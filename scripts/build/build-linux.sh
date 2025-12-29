#!/bin/bash
# ============================================================================
# build-linux.sh - Linux Build Script for Ledger
# ============================================================================
# This script builds the Ledger application for Linux operating systems.
#
# WHAT THIS SCRIPT DOES:
# 1. Checks that you have the required tools installed
# 2. Installs any missing Linux build dependencies
# 3. Compiles the TypeScript/React code into JavaScript
# 4. Packages everything into Linux distributable formats
#
# OUTPUT FORMATS:
# - AppImage:  A portable, single-file executable that works on most Linux distros
# - .deb:      A package for Debian/Ubuntu-based distributions
# - .rpm:      A package for Fedora/RHEL-based distributions (optional)
# - .snap:     A Snap package for Ubuntu Snap Store (optional)
#
# USAGE:
#   ./build-linux.sh                    # Build AppImage and .deb (default)
#   ./build-linux.sh --appimage         # Build only AppImage
#   ./build-linux.sh --deb              # Build only .deb package
#   ./build-linux.sh --rpm              # Build only .rpm package
#   ./build-linux.sh --all              # Build all formats
#   ./build-linux.sh --clean            # Clean before building
#
# PREREQUISITES:
# - Linux operating system (or WSL on Windows)
# - Node.js 18+ installed
# - Various build tools (script will help install them)
#
# ============================================================================

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source (include) the common utilities
source "$SCRIPT_DIR/build-common.sh"

# ----------------------------------------------------------------------------
# LINUX-SPECIFIC VARIABLES
# ----------------------------------------------------------------------------
# These are reset by reset_linux_state() for idempotency

# Reset Linux-specific state to defaults
# Call this at the start of main() for idempotent behavior
reset_linux_state() {
    # Default targets to build
    BUILD_APPIMAGE=true
    BUILD_DEB=true
    BUILD_RPM=false
    BUILD_SNAP=false
    BUILD_ALL=false

    # Architecture (Linux builds typically target x64)
    BUILD_ARCH="x64"

    # Distribution info (will be detected)
    DISTRO=""
    DISTRO_VERSION=""
}

# Initialize defaults
reset_linux_state

# ----------------------------------------------------------------------------
# LINUX-SPECIFIC FUNCTIONS
# ----------------------------------------------------------------------------

# Display help information
show_help() {
    echo ""
    echo -e "${BOLD}Linux Build Script for Ledger${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo "  $0 [options]"
    echo ""
    echo -e "${BOLD}Target Options:${NC}"
    echo "  --appimage        Build AppImage (portable, works on any distro)"
    echo "  --deb             Build .deb package (Debian, Ubuntu, Linux Mint, Pop!_OS)"
    echo "  --rpm             Build .rpm package (Fedora, RHEL, CentOS, openSUSE)"
    echo "  --snap            Build .snap package (Ubuntu Snap Store)"
    echo "  --all             Build all available formats"
    echo ""
    echo "  If no target is specified, builds AppImage and .deb by default."
    echo ""
    echo -e "${BOLD}Build Options:${NC}"
    echo "  --status          Show build directory status and disk usage"
    echo "  --skip-deps       Skip npm dependency installation"
    echo "  --arm64           Build for ARM64 architecture (e.g., Raspberry Pi)"
    echo ""
    echo -e "${BOLD}Other Options:${NC}"
    echo "  --help, -h        Show this help message"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0                           # Build AppImage and .deb"
    echo "  $0 --appimage --status       # Build AppImage, show disk usage first"
    echo "  $0 --all                     # Build all formats"
    echo "  $0 --deb --rpm               # Build .deb and .rpm"
    echo ""
    echo -e "${BOLD}Output Locations:${NC}"
    echo "  AppImage:  dist/ledger-{version}.AppImage"
    echo "  Deb:       dist/ledger_{version}_amd64.deb"
    echo "  RPM:       dist/ledger-{version}.x86_64.rpm"
    echo "  Snap:      dist/ledger_{version}_amd64.snap"
    echo ""
    echo -e "${BOLD}About the Formats:${NC}"
    echo ""
    echo "  ${BOLD}AppImage${NC} (Recommended for most users)"
    echo "    - Single executable file that works on any Linux distribution"
    echo "    - No installation required - just download and run"
    echo "    - Self-contained with all dependencies included"
    echo "    - To run: chmod +x file.AppImage && ./file.AppImage"
    echo ""
    echo "  ${BOLD}.deb${NC} (For Debian/Ubuntu-based systems)"
    echo "    - Standard package format for apt-based systems"
    echo "    - Integrates with system package manager"
    echo "    - To install: sudo dpkg -i file.deb"
    echo "                  sudo apt install -f  # Fix dependencies if needed"
    echo ""
    echo "  ${BOLD}.rpm${NC} (For Red Hat-based systems)"
    echo "    - Standard package format for yum/dnf-based systems"
    echo "    - Integrates with system package manager"
    echo "    - To install: sudo rpm -i file.rpm"
    echo "              or: sudo dnf install file.rpm"
    echo ""
}

# Parse Linux-specific command-line arguments
parse_linux_args() {
    # Track if any target was explicitly specified
    local target_specified=false

    for arg in "$@"; do
        case $arg in
            --appimage)
                BUILD_APPIMAGE=true
                target_specified=true
                ;;
            --deb)
                BUILD_DEB=true
                target_specified=true
                ;;
            --rpm)
                BUILD_RPM=true
                target_specified=true
                ;;
            --snap)
                BUILD_SNAP=true
                target_specified=true
                ;;
            --all)
                BUILD_ALL=true
                BUILD_APPIMAGE=true
                BUILD_DEB=true
                BUILD_RPM=true
                target_specified=true
                ;;
            --arm64)
                BUILD_ARCH="arm64"
                ;;
        esac
    done

    # If explicit targets were specified, turn off defaults
    if [ "$target_specified" = true ] && [ "$BUILD_ALL" = false ]; then
        # Reset defaults only if not building all
        if [[ " $@ " != *" --appimage "* ]] && [[ " $@ " != *" --all "* ]]; then
            BUILD_APPIMAGE=false
        fi
        if [[ " $@ " != *" --deb "* ]] && [[ " $@ " != *" --all "* ]]; then
            BUILD_DEB=false
        fi
    fi
}

# Detect the Linux distribution
detect_distro() {
    log_step "Detecting Linux distribution..."

    if [ -f /etc/os-release ]; then
        # Most modern Linux distributions have this file
        source /etc/os-release
        DISTRO="$ID"
        DISTRO_VERSION="$VERSION_ID"
        log_info "Detected: $PRETTY_NAME"
    elif [ -f /etc/lsb-release ]; then
        # Fallback for older Ubuntu versions
        source /etc/lsb-release
        DISTRO="$DISTRIB_ID"
        DISTRO_VERSION="$DISTRIB_RELEASE"
        log_info "Detected: $DISTRIB_DESCRIPTION"
    else
        log_warn "Could not detect Linux distribution"
        DISTRO="unknown"
    fi
}

# Check that we're running on Linux
check_linux() {
    if [[ "$(uname)" != "Linux" ]]; then
        log_error "This script must be run on Linux"
        log_info "You are running: $(uname -s)"

        if [[ "$(uname)" == "Darwin" ]]; then
            log_info "Tip: Use build-mac.sh for macOS builds"
        elif [[ "$(uname -s)" == *"MINGW"* ]] || [[ "$(uname -s)" == *"CYGWIN"* ]]; then
            log_info "Tip: Use WSL (Windows Subsystem for Linux) to run this script"
            log_info "     Or use build-windows.sh for Windows builds"
        fi
        exit 1
    fi

    detect_distro
}

# Install required build dependencies based on distro
install_build_deps() {
    log_header "Checking Build Dependencies"

    log_info "Checking for required packages..."
    log_info "These are needed to build Electron applications on Linux"

    local missing_deps=()

    # Check for common required tools
    local required_commands=("fakeroot" "dpkg")

    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done

    # Check for rpm build tools if building RPM
    if [ "$BUILD_RPM" = true ]; then
        if ! command -v rpmbuild &> /dev/null; then
            missing_deps+=("rpm-build")
        fi
    fi

    # If nothing is missing, we're good
    if [ ${#missing_deps[@]} -eq 0 ]; then
        log_success "All required build dependencies are installed"
        return 0
    fi

    log_warn "Missing dependencies: ${missing_deps[*]}"
    log_info ""

    # Provide installation instructions based on distro
    case "$DISTRO" in
        ubuntu|debian|linuxmint|pop|elementary)
            log_info "Installing dependencies using apt..."
            local apt_packages=""

            for dep in "${missing_deps[@]}"; do
                case "$dep" in
                    fakeroot) apt_packages+=" fakeroot" ;;
                    dpkg) apt_packages+=" dpkg" ;;
                    rpm-build) apt_packages+=" rpm" ;;
                    *) apt_packages+=" $dep" ;;
                esac
            done

            log_step "Running: sudo apt-get update && sudo apt-get install -y$apt_packages"
            echo ""
            echo "This will require administrator (sudo) privileges."
            echo ""

            sudo apt-get update
            sudo apt-get install -y $apt_packages
            ;;

        fedora|rhel|centos|rocky|alma)
            log_info "Installing dependencies using dnf/yum..."
            local rpm_packages=""

            for dep in "${missing_deps[@]}"; do
                case "$dep" in
                    fakeroot) rpm_packages+=" fakeroot" ;;
                    dpkg) rpm_packages+=" dpkg" ;;
                    rpm-build) rpm_packages+=" rpm-build" ;;
                    *) rpm_packages+=" $dep" ;;
                esac
            done

            log_step "Running: sudo dnf install -y$rpm_packages"
            sudo dnf install -y $rpm_packages 2>/dev/null || sudo yum install -y $rpm_packages
            ;;

        arch|manjaro)
            log_info "Installing dependencies using pacman..."
            local arch_packages=""

            for dep in "${missing_deps[@]}"; do
                case "$dep" in
                    fakeroot) arch_packages+=" fakeroot" ;;
                    dpkg) arch_packages+=" dpkg" ;;
                    rpm-build) arch_packages+=" rpm-tools" ;;
                    *) arch_packages+=" $dep" ;;
                esac
            done

            log_step "Running: sudo pacman -S --noconfirm$arch_packages"
            sudo pacman -S --noconfirm $arch_packages
            ;;

        opensuse*|suse)
            log_info "Installing dependencies using zypper..."
            local suse_packages=""

            for dep in "${missing_deps[@]}"; do
                case "$dep" in
                    fakeroot) suse_packages+=" fakeroot" ;;
                    dpkg) suse_packages+=" dpkg" ;;
                    rpm-build) suse_packages+=" rpm-build" ;;
                    *) suse_packages+=" $dep" ;;
                esac
            done

            log_step "Running: sudo zypper install -y$suse_packages"
            sudo zypper install -y $suse_packages
            ;;

        *)
            log_error "Automatic dependency installation not supported for: $DISTRO"
            log_info ""
            log_info "Please manually install these packages:"
            for dep in "${missing_deps[@]}"; do
                log_info "  - $dep"
            done
            log_info ""
            log_info "Then run this script again."
            exit 1
            ;;
    esac

    log_success "Build dependencies installed"
}

# Build the target list string for electron-builder
# Returns space-separated targets (electron-builder expects this format)
get_build_targets() {
    local targets=""

    if [ "$BUILD_APPIMAGE" = true ]; then
        targets+="AppImage "
    fi

    if [ "$BUILD_DEB" = true ]; then
        targets+="deb "
    fi

    if [ "$BUILD_RPM" = true ]; then
        targets+="rpm "
    fi

    if [ "$BUILD_SNAP" = true ]; then
        targets+="snap "
    fi

    # Remove trailing space
    targets="${targets% }"

    echo "$targets"
}

# Run the Linux-specific build
# Idempotent: Safe to run multiple times (overwrites previous build)
run_linux_build() {
    local targets
    targets=$(get_build_targets)

    log_header "Building for Linux"
    log_info "Targets: $targets"
    log_info "Architecture: $BUILD_ARCH"

    cd "$PROJECT_ROOT" || exit 1

    # Build the electron-builder command
    local build_cmd="npx electron-builder --linux $targets"

    # Add architecture
    if [ "$BUILD_ARCH" = "arm64" ]; then
        build_cmd+=" --arm64"
    else
        build_cmd+=" --x64"
    fi

    log_step "Running: $build_cmd"
    log_info "This may take several minutes..."
    echo ""

    # Run the build
    eval "$build_cmd"
}

# Verify Linux build output
verify_linux_build() {
    log_header "Verifying Build"

    local found_any=false

    # Check for AppImage
    if [ "$BUILD_APPIMAGE" = true ]; then
        local appimage=$(find "$DIST_DIR" -name "*.AppImage" -type f 2>/dev/null | head -1)
        if [ -n "$appimage" ]; then
            local size=$(get_file_size "$appimage")
            log_success "AppImage created: $appimage ($size)"
            found_any=true

            # Make sure it's executable
            chmod +x "$appimage"
            log_info "  Made executable: chmod +x applied"
        else
            log_warn "AppImage not found (was expected)"
        fi
    fi

    # Check for .deb
    if [ "$BUILD_DEB" = true ]; then
        local deb=$(find "$DIST_DIR" -name "*.deb" -type f 2>/dev/null | head -1)
        if [ -n "$deb" ]; then
            local size=$(get_file_size "$deb")
            log_success ".deb package created: $deb ($size)"
            found_any=true
        else
            log_warn ".deb package not found (was expected)"
        fi
    fi

    # Check for .rpm
    if [ "$BUILD_RPM" = true ]; then
        local rpm=$(find "$DIST_DIR" -name "*.rpm" -type f 2>/dev/null | head -1)
        if [ -n "$rpm" ]; then
            local size=$(get_file_size "$rpm")
            log_success ".rpm package created: $rpm ($size)"
            found_any=true
        else
            log_warn ".rpm package not found (was expected)"
        fi
    fi

    # Check for .snap
    if [ "$BUILD_SNAP" = true ]; then
        local snap=$(find "$DIST_DIR" -name "*.snap" -type f 2>/dev/null | head -1)
        if [ -n "$snap" ]; then
            local size=$(get_file_size "$snap")
            log_success ".snap package created: $snap ($size)"
            found_any=true
        else
            log_warn ".snap package not found (was expected)"
        fi
    fi

    if [ "$found_any" = false ]; then
        log_error "No build artifacts were created"
        return 1
    fi

    return 0
}

# Display Linux-specific build summary
show_linux_summary() {
    log_header "Linux Build Complete!"

    echo -e "${BOLD}Build Details:${NC}"
    echo "  Application:    $APP_NAME"
    echo "  Version:        $APP_VERSION"
    echo "  Distribution:   $DISTRO $DISTRO_VERSION"
    echo "  Architecture:   $BUILD_ARCH"
    echo ""

    echo -e "${BOLD}Generated Packages:${NC}"

    find "$DIST_DIR" -type f \( -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.snap" \) 2>/dev/null | while read -r file; do
        local size=$(get_file_size "$file")
        local filename=$(basename "$file")
        echo "  $filename ($size)"
    done
    echo ""

    echo -e "${BOLD}Installation Instructions:${NC}"
    echo ""

    # AppImage
    local appimage=$(find "$DIST_DIR" -name "*.AppImage" -type f 2>/dev/null | head -1)
    if [ -n "$appimage" ]; then
        echo "  ${BOLD}AppImage (portable, any distro):${NC}"
        echo "    chmod +x $(basename "$appimage")"
        echo "    ./$(basename "$appimage")"
        echo ""
    fi

    # Deb
    local deb=$(find "$DIST_DIR" -name "*.deb" -type f 2>/dev/null | head -1)
    if [ -n "$deb" ]; then
        echo "  ${BOLD}.deb (Debian/Ubuntu):${NC}"
        echo "    sudo dpkg -i $(basename "$deb")"
        echo "    sudo apt install -f  # if there are dependency issues"
        echo ""
    fi

    # RPM
    local rpm=$(find "$DIST_DIR" -name "*.rpm" -type f 2>/dev/null | head -1)
    if [ -n "$rpm" ]; then
        echo "  ${BOLD}.rpm (Fedora/RHEL):${NC}"
        echo "    sudo dnf install $(basename "$rpm")"
        echo "    # or: sudo rpm -i $(basename "$rpm")"
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
    reset_linux_state

    # Parse all command-line arguments
    parse_common_args "$@"
    parse_linux_args "$@"

    # Show help if requested
    if [ "$SHOW_HELP" = true ]; then
        show_help
        exit 0
    fi

    log_header "Ledger Linux Build"
    log_info "Building version $APP_VERSION"

    # Linux-specific checks
    check_linux
    install_build_deps

    # Run common pre-build steps
    run_prebuild

    # Run Linux-specific build
    run_linux_build

    # Verify the build
    verify_linux_build

    # Show summary
    show_linux_summary

    print_footer

    log_success "Linux build completed successfully!"
}

# Run main function with all command-line arguments
main "$@"
