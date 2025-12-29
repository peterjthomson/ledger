#!/bin/bash
# ============================================================================
# build-common.sh - Shared Build Utilities for Ledger
# ============================================================================
# This file contains common functions and variables used by all build scripts.
# It should be "sourced" (included) by other scripts, not run directly.
#
# Usage: source ./build-common.sh
#
# IDEMPOTENCY: This script can be safely sourced multiple times.
# ============================================================================

# ----------------------------------------------------------------------------
# SOURCE GUARD - Prevent multiple loading
# ----------------------------------------------------------------------------
# This pattern ensures the script is only fully executed once per shell session.
# If sourced again, it returns early without re-executing.
# ----------------------------------------------------------------------------
if [ -n "$_BUILD_COMMON_LOADED" ]; then
    # Already loaded, skip re-initialization
    return 0 2>/dev/null || exit 0
fi
_BUILD_COMMON_LOADED=1

# ----------------------------------------------------------------------------
# WHAT IS THIS FILE?
# ----------------------------------------------------------------------------
# In software development, we often have code that multiple scripts need.
# Instead of copying the same code everywhere (which makes updates hard),
# we put shared code in one file and "source" (include) it in other scripts.
#
# Think of it like a recipe book that other recipes reference.
# ----------------------------------------------------------------------------

# Exit immediately if any command fails (safety measure)
# Use 'set +e' temporarily if you need to handle failures gracefully
set -e

# ----------------------------------------------------------------------------
# COLOR CODES FOR TERMINAL OUTPUT
# ----------------------------------------------------------------------------
# These make our terminal output easier to read by adding colors.
# \033[ is an "escape sequence" that tells the terminal to change colors.
# The numbers after it specify which color to use.
# Using $'...' syntax for proper escape sequence interpretation.
# ----------------------------------------------------------------------------
RED=$'\033[0;31m'      # For errors
GREEN=$'\033[0;32m'    # For success messages
YELLOW=$'\033[1;33m'   # For warnings
BLUE=$'\033[0;34m'     # For informational messages
CYAN=$'\033[0;36m'     # For headers
BOLD=$'\033[1m'        # Makes text bold
NC=$'\033[0m'          # NC = "No Color" - resets to default

# Export color codes so subshells can use them
export RED GREEN YELLOW BLUE CYAN BOLD NC

# ----------------------------------------------------------------------------
# PROJECT PATHS
# ----------------------------------------------------------------------------
# These variables store important directory locations.
# Using variables instead of hardcoded paths makes the scripts more flexible.
# ----------------------------------------------------------------------------

# Get the directory where this script is located
# This works even if someone runs the script from a different folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Project root is two levels up from scripts/build/
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Output directories where built applications will be placed
DIST_DIR="$PROJECT_ROOT/dist"
OUT_DIR="$PROJECT_ROOT/out"

# Export paths for subshells
export SCRIPT_DIR PROJECT_ROOT DIST_DIR OUT_DIR

# ----------------------------------------------------------------------------
# VERSION INFORMATION
# ----------------------------------------------------------------------------
# We read the version from package.json so all builds use the same version.
# This prevents confusion about which version was actually built.
# ----------------------------------------------------------------------------

# Extract version from package.json using grep and sed
# grep finds the line with "version", sed extracts just the version number
get_version() {
    local version_line
    version_line=$(grep '"version"' "$PROJECT_ROOT/package.json" 2>/dev/null || echo '"version": "0.0.0"')
    echo "$version_line" | sed 's/.*"version": "\(.*\)".*/\1/'
}

# Store version in a variable for easy access (only if not already set)
: "${APP_VERSION:=$(get_version)}"
: "${APP_NAME:=Ledger}"

export APP_VERSION APP_NAME

# ----------------------------------------------------------------------------
# LOGGING FUNCTIONS
# ----------------------------------------------------------------------------
# These functions provide consistent, colored output across all scripts.
# Using functions instead of raw echo commands makes the code cleaner.
# ----------------------------------------------------------------------------

# Print an informational message (blue)
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

# Print a success message (green)
log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Print a warning message (yellow)
log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Print an error message (red)
log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Print a section header (cyan, bold)
log_header() {
    echo ""
    echo -e "${CYAN}${BOLD}========================================${NC}"
    echo -e "${CYAN}${BOLD}  $1${NC}"
    echo -e "${CYAN}${BOLD}========================================${NC}"
    echo ""
}

# Print a step indicator (for multi-step processes)
log_step() {
    echo -e "${BOLD}➜${NC} $1"
}

# ----------------------------------------------------------------------------
# UTILITY FUNCTIONS
# ----------------------------------------------------------------------------

# Check if a command/program is installed and available
# Usage: check_command "node" "Node.js"
# Returns: 0 if found, 1 if not found
check_command() {
    local cmd="$1"      # The command to check (e.g., "node")
    local name="$2"     # Human-readable name (e.g., "Node.js")

    if ! command -v "$cmd" &> /dev/null; then
        log_error "$name ($cmd) is not installed or not in PATH"
        return 1
    fi
    log_info "$name found: $(command -v "$cmd")"
    return 0
}

# Check if Node.js and npm are installed with correct versions
# Idempotent: Safe to call multiple times
check_node_environment() {
    log_header "Checking Node.js Environment"

    # Check Node.js
    if ! check_command "node" "Node.js"; then
        log_error "Please install Node.js from https://nodejs.org/"
        log_info "Recommended version: 18.x or higher (LTS)"
        exit 1
    fi

    # Check npm
    if ! check_command "npm" "npm"; then
        log_error "npm should come with Node.js. Please reinstall Node.js."
        exit 1
    fi

    # Display versions
    local node_version
    local npm_version
    node_version=$(node --version)
    npm_version=$(npm --version)

    log_info "Node.js version: $node_version"
    log_info "npm version: $npm_version"

    # Check if Node.js version is at least 18
    # This is required for modern JavaScript features
    local major_version
    major_version=$(echo "$node_version" | sed 's/v\([0-9]*\).*/\1/')
    if [ "$major_version" -lt 18 ]; then
        log_warn "Node.js 18 or higher is recommended. You have $node_version"
    fi

    log_success "Node.js environment is ready"
}

# Check if Git is installed (required for version control info in builds)
# Idempotent: Safe to call multiple times
check_git() {
    if ! check_command "git" "Git"; then
        log_warn "Git is not installed. Some features may not work."
        return 1
    fi
    return 0
}

# Install project dependencies
# Idempotent: Skips installation if dependencies are up to date
install_dependencies() {
    log_header "Installing Dependencies"

    cd "$PROJECT_ROOT" || exit 1

    # Check if node_modules exists and is up to date
    if [ -d "node_modules" ]; then
        log_info "node_modules directory exists"

        # Check if package-lock.json is newer than node_modules
        # Use -nt (newer than) with fallback for missing files
        if [ -f "package-lock.json" ] && [ "package-lock.json" -nt "node_modules" ]; then
            log_info "package-lock.json has changed, reinstalling..."
            npm ci
        else
            log_info "Dependencies appear up to date"
            log_info "Run 'npm ci' manually if you need to force reinstall"
        fi
    else
        log_info "Installing dependencies for the first time..."
        log_info "This may take a few minutes..."
        npm ci
    fi

    # Touch node_modules to update its timestamp
    touch "node_modules" 2>/dev/null || true

    log_success "Dependencies are ready"
}

# Generate a timestamped build directory name
# Format: v{version}_{YYYYMMDD}_{HHMMSS}
get_build_timestamp() {
    echo "v${APP_VERSION}_$(date +%Y%m%d_%H%M%S)"
}

# Get the current build output directory (timestamped)
# This ensures each build gets its own directory
get_timestamped_dist_dir() {
    local timestamp
    timestamp=$(get_build_timestamp)
    echo "$DIST_DIR/$timestamp"
}

# Clean/manage previous build artifacts
# NOTE: This function does NOT automatically delete anything
# It provides information and guidance to the user
clean_build() {
    log_header "Build Directory Status"

    cd "$PROJECT_ROOT" || exit 1

    # Check output directory
    if [ -d "$OUT_DIR" ]; then
        local out_size
        out_size=$(du -sh "$OUT_DIR" 2>/dev/null | cut -f1)
        log_info "Intermediate build files exist: $OUT_DIR ($out_size)"
        log_info "These will be overwritten by the new build"
    else
        log_info "No intermediate build files found"
    fi

    # Check dist directory for previous builds
    if [ -d "$DIST_DIR" ]; then
        local dist_size
        local build_count
        dist_size=$(du -sh "$DIST_DIR" 2>/dev/null | cut -f1)
        build_count=$(find "$DIST_DIR" -maxdepth 1 -type d | wc -l)
        ((build_count--))  # Subtract 1 for the dist dir itself

        log_info "Distribution directory exists: $DIST_DIR ($dist_size)"
        if [ "$build_count" -gt 0 ]; then
            log_info "Contains $build_count previous build(s)"
            log_info "Previous builds are preserved (timestamped directories)"
        fi
    else
        log_info "No previous builds found"
    fi

    echo ""
    log_info "To manually clean old builds, run:"
    log_info "  ls -la $DIST_DIR/           # List all builds"
    log_info "  rm -rf $DIST_DIR/v0.1.0_*   # Remove specific version"
    echo ""

    log_success "Build directories checked"
}

# Run the Vite build (compiles TypeScript and bundles the app)
# Idempotent: Will overwrite existing output
run_vite_build() {
    log_header "Building Application with Vite"

    cd "$PROJECT_ROOT" || exit 1

    log_step "Compiling TypeScript and bundling..."
    log_info "This compiles your source code into optimized JavaScript"

    # Run the build (this will overwrite existing files)
    npm run vite:build:app

    if [ -d "$OUT_DIR" ]; then
        log_success "Vite build completed successfully"
        log_info "Output directory: $OUT_DIR"
    else
        log_error "Vite build failed - output directory not created"
        exit 1
    fi
}

# Display build summary
show_build_summary() {
    local platform="$1"
    local output_path="$2"

    log_header "Build Summary"

    echo -e "${BOLD}Application:${NC} $APP_NAME"
    echo -e "${BOLD}Version:${NC}     $APP_VERSION"
    echo -e "${BOLD}Platform:${NC}    $platform"
    echo -e "${BOLD}Output:${NC}      $output_path"
    echo ""

    # List output files (safely handle missing directory)
    if [ -d "$output_path" ]; then
        log_info "Generated files:"
        ls -lh "$output_path" 2>/dev/null || echo "  (empty or error listing files)"
    fi
}

# Calculate file size in human-readable format
# Returns "N/A" if file doesn't exist
get_file_size() {
    local file="$1"
    if [ -f "$file" ]; then
        ls -lh "$file" | awk '{print $5}'
    else
        echo "N/A"
    fi
}

# Verify the build was successful by checking for expected files
verify_build() {
    local platform="$1"
    local expected_pattern="$2"

    log_step "Verifying build output..."

    # Safely handle case where DIST_DIR doesn't exist
    if [ ! -d "$DIST_DIR" ]; then
        log_error "Build verification failed: $DIST_DIR does not exist"
        return 1
    fi

    local found_files
    found_files=$(find "$DIST_DIR" -name "$expected_pattern" 2>/dev/null | head -5)

    if [ -z "$found_files" ]; then
        log_error "Build verification failed: No files matching '$expected_pattern' found"
        return 1
    fi

    log_success "Build verification passed"
    echo "$found_files" | while read -r file; do
        local size
        size=$(get_file_size "$file")
        log_info "  $file ($size)"
    done

    return 0
}

# Display help for common options
show_common_help() {
    echo ""
    echo -e "${BOLD}Common Options:${NC}"
    echo "  --status      Show build directory status and disk usage"
    echo "  --skip-deps   Skip dependency installation"
    echo "  --help, -h    Show this help message"
    echo ""
    echo -e "${BOLD}Note:${NC} Builds are saved to timestamped directories (e.g., dist/v0.1.1_20241229_143022/)"
    echo "      Previous builds are preserved. Clean up manually when needed."
    echo ""
}

# ----------------------------------------------------------------------------
# GLOBAL STATE VARIABLES
# ----------------------------------------------------------------------------
# These are reset each time a script runs (not when this file is sourced).
# The calling script should call reset_build_state() at the start.
# ----------------------------------------------------------------------------

# Reset build state to defaults
# Call this at the start of each build script's main() function
reset_build_state() {
    SKIP_DEPS=false
    SHOW_STATUS=false
    SHOW_HELP=false
}

# Initialize defaults (will be overwritten by reset_build_state)
SKIP_DEPS=false
SHOW_STATUS=false
SHOW_HELP=false

# Parse common command-line arguments
# This function sets global variables based on arguments
# Idempotent: Can be called multiple times with same args
parse_common_args() {
    for arg in "$@"; do
        case $arg in
            --status|--clean)
                # --clean is kept for backwards compatibility but now just shows status
                SHOW_STATUS=true
                ;;
            --skip-deps)
                SKIP_DEPS=true
                ;;
            --help|-h)
                SHOW_HELP=true
                ;;
        esac
    done
}

# Run pre-build steps (common to all platforms)
# Idempotent: Safe to run multiple times
run_prebuild() {
    log_header "Pre-Build Steps"

    # Check Node.js environment
    check_node_environment

    # Check Git (optional but recommended)
    check_git || true  # Don't fail if git is missing

    # Show build status if requested
    if [ "$SHOW_STATUS" = true ]; then
        clean_build  # This now just shows status, doesn't delete
    fi

    # Install dependencies unless skipped
    if [ "$SKIP_DEPS" = false ]; then
        install_dependencies
    else
        log_info "Skipping dependency installation (--skip-deps)"
    fi

    # Run Vite build
    run_vite_build
}

# Print script footer
print_footer() {
    echo ""
    echo -e "${CYAN}─────────────────────────────────────────────────────${NC}"
    echo -e "${BOLD}Build completed at:${NC} $(date)"
    echo -e "${CYAN}─────────────────────────────────────────────────────${NC}"
    echo ""
}

# ----------------------------------------------------------------------------
# INITIALIZATION COMPLETE
# ----------------------------------------------------------------------------
log_info "Build utilities loaded from: $SCRIPT_DIR"
