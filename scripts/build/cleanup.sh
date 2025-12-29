#!/bin/bash
# ============================================================================
# cleanup.sh - Safe Build Artifact Cleanup Script
# ============================================================================
# This script helps you safely clean up old build artifacts.
# It is designed to be:
#   - SAFE: Never deletes without explicit confirmation
#   - IDEMPOTENT: Safe to run multiple times
#   - INFORMATIVE: Shows exactly what will be deleted before doing anything
#
# USAGE:
#   ./cleanup.sh              # Interactive mode - shows what can be cleaned
#   ./cleanup.sh --dry-run    # Same as above, explicitly no deletion
#   ./cleanup.sh --confirm    # Actually delete (with confirmation prompts)
#
# ============================================================================

set -e

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Directories that contain build artifacts
DIST_DIR="$PROJECT_ROOT/dist"
OUT_DIR="$PROJECT_ROOT/out"

# Colors for output
RED=$'\033[0;31m'
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
BLUE=$'\033[0;34m'
CYAN=$'\033[0;36m'
BOLD=$'\033[1m'
NC=$'\033[0m'

# Mode flags
DRY_RUN=true  # Default to dry-run (safe)
SHOW_HELP=false

# ============================================================================
# FUNCTIONS
# ============================================================================

show_help() {
    echo ""
    echo -e "${BOLD}Build Artifact Cleanup Script${NC}"
    echo ""
    echo -e "${BOLD}Usage:${NC}"
    echo "  $0 [options]"
    echo ""
    echo -e "${BOLD}Options:${NC}"
    echo "  --dry-run       Show what would be deleted without deleting (default)"
    echo "  --confirm       Actually delete files (will prompt for confirmation)"
    echo "  --help, -h      Show this help message"
    echo ""
    echo -e "${BOLD}What gets cleaned:${NC}"
    echo "  - dist/         Distribution packages (AppImage, .deb, .exe, etc.)"
    echo "  - out/          Intermediate build files (compiled JS)"
    echo ""
    echo -e "${BOLD}Safety Features:${NC}"
    echo "  - Defaults to dry-run mode (no deletion)"
    echo "  - Shows file sizes before deletion"
    echo "  - Requires explicit --confirm flag"
    echo "  - Prompts for confirmation even with --confirm"
    echo "  - Only operates within project directory"
    echo ""
    echo -e "${BOLD}Examples:${NC}"
    echo "  $0                    # See what can be cleaned (safe)"
    echo "  $0 --dry-run          # Same as above"
    echo "  $0 --confirm          # Clean with confirmation prompts"
    echo ""
}

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Format bytes to human readable
format_size() {
    local bytes=$1
    if [ "$bytes" -ge 1073741824 ]; then
        echo "$(echo "scale=1; $bytes / 1073741824" | bc)GB"
    elif [ "$bytes" -ge 1048576 ]; then
        echo "$(echo "scale=1; $bytes / 1048576" | bc)MB"
    elif [ "$bytes" -ge 1024 ]; then
        echo "$(echo "scale=1; $bytes / 1024" | bc)KB"
    else
        echo "${bytes}B"
    fi
}

# Get directory size in bytes
get_dir_size_bytes() {
    local dir="$1"
    if [ -d "$dir" ]; then
        du -sb "$dir" 2>/dev/null | cut -f1
    else
        echo "0"
    fi
}

# Get directory size human readable
get_dir_size() {
    local dir="$1"
    if [ -d "$dir" ]; then
        du -sh "$dir" 2>/dev/null | cut -f1
    else
        echo "0"
    fi
}

# Count files in directory
count_files() {
    local dir="$1"
    if [ -d "$dir" ]; then
        find "$dir" -type f 2>/dev/null | wc -l
    else
        echo "0"
    fi
}

# List build directories in dist/
list_builds() {
    local dir="$1"
    if [ -d "$dir" ]; then
        find "$dir" -maxdepth 1 -type d -name "v*" 2>/dev/null | sort
    fi
}

# Safely delete a directory with confirmation
safe_delete() {
    local dir="$1"
    local description="$2"

    # Safety check: ensure path is not empty
    if [ -z "$dir" ]; then
        log_error "Cannot delete: path is empty"
        return 1
    fi

    # Safety check: ensure path is within project
    case "$dir" in
        "$PROJECT_ROOT"/*) ;;
        *)
            log_error "SAFETY: Refusing to delete path outside project: $dir"
            return 1
            ;;
    esac

    # Safety check: path must exist
    if [ ! -d "$dir" ]; then
        log_info "$description does not exist, skipping"
        return 0
    fi

    local size
    size=$(get_dir_size "$dir")
    local file_count
    file_count=$(count_files "$dir")

    echo ""
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}Directory:${NC} $dir"
    echo -e "${BOLD}Size:${NC}      $size"
    echo -e "${BOLD}Files:${NC}     $file_count files"
    echo -e "${YELLOW}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}[DRY-RUN] Would delete: $dir${NC}"
        return 0
    fi

    # Prompt for confirmation
    echo ""
    echo -e "${RED}${BOLD}Are you sure you want to delete this directory?${NC}"
    echo -e "Type ${BOLD}yes${NC} to confirm, anything else to skip:"
    read -r response

    if [ "$response" = "yes" ]; then
        log_info "Deleting $dir..."
        rm -rf "$dir"
        if [ ! -d "$dir" ]; then
            log_success "Deleted: $dir"
        else
            log_error "Failed to delete: $dir"
            return 1
        fi
    else
        log_info "Skipped: $dir"
    fi
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    # Parse arguments
    for arg in "$@"; do
        case $arg in
            --dry-run)
                DRY_RUN=true
                ;;
            --confirm)
                DRY_RUN=false
                ;;
            --help|-h)
                SHOW_HELP=true
                ;;
        esac
    done

    if [ "$SHOW_HELP" = true ]; then
        show_help
        exit 0
    fi

    echo ""
    echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════${NC}"
    echo -e "${CYAN}${BOLD}  Build Artifact Cleanup${NC}"
    echo -e "${CYAN}${BOLD}════════════════════════════════════════════════════════════${NC}"
    echo ""

    if [ "$DRY_RUN" = true ]; then
        echo -e "${BLUE}Mode: ${BOLD}DRY-RUN${NC} (no files will be deleted)"
        echo -e "      Use ${BOLD}--confirm${NC} to actually delete files"
    else
        echo -e "${YELLOW}Mode: ${BOLD}CONFIRM${NC} (files will be deleted with confirmation)"
    fi

    echo ""
    echo -e "${BOLD}Project Root:${NC} $PROJECT_ROOT"
    echo ""

    # Calculate totals
    local total_size_bytes=0
    local total_files=0

    # Check out/ directory
    echo -e "${BOLD}Intermediate Build Files (out/):${NC}"
    if [ -d "$OUT_DIR" ]; then
        local out_size
        out_size=$(get_dir_size "$OUT_DIR")
        local out_files
        out_files=$(count_files "$OUT_DIR")
        local out_bytes
        out_bytes=$(get_dir_size_bytes "$OUT_DIR")

        echo "  Size:  $out_size"
        echo "  Files: $out_files"

        total_size_bytes=$((total_size_bytes + out_bytes))
        total_files=$((total_files + out_files))
    else
        echo "  (does not exist)"
    fi
    echo ""

    # Check dist/ directory
    echo -e "${BOLD}Distribution Packages (dist/):${NC}"
    if [ -d "$DIST_DIR" ]; then
        local dist_size
        dist_size=$(get_dir_size "$DIST_DIR")
        local dist_files
        dist_files=$(count_files "$DIST_DIR")
        local dist_bytes
        dist_bytes=$(get_dir_size_bytes "$DIST_DIR")

        echo "  Size:  $dist_size"
        echo "  Files: $dist_files"

        total_size_bytes=$((total_size_bytes + dist_bytes))
        total_files=$((total_files + dist_files))

        # List individual builds
        local builds
        builds=$(list_builds "$DIST_DIR")
        if [ -n "$builds" ]; then
            echo ""
            echo "  Build directories:"
            echo "$builds" | while read -r build_dir; do
                if [ -n "$build_dir" ]; then
                    local build_size
                    build_size=$(get_dir_size "$build_dir")
                    local build_name
                    build_name=$(basename "$build_dir")
                    echo "    - $build_name ($build_size)"
                fi
            done
        fi
    else
        echo "  (does not exist)"
    fi
    echo ""

    # Show totals
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    local total_human
    total_human=$(format_size "$total_size_bytes")
    echo -e "${BOLD}Total:${NC} $total_human across $total_files files"
    echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

    # If nothing to clean
    if [ "$total_size_bytes" -eq 0 ]; then
        echo ""
        log_success "Nothing to clean up!"
        exit 0
    fi

    echo ""

    # Cleanup prompts
    if [ "$DRY_RUN" = true ]; then
        echo -e "${CYAN}To delete these files, run:${NC}"
        echo -e "  ${BOLD}$0 --confirm${NC}"
        echo ""
        exit 0
    fi

    # Confirm mode - proceed with deletion
    echo -e "${YELLOW}${BOLD}Proceeding with cleanup...${NC}"

    # Clean out/ first (intermediate files, less important)
    if [ -d "$OUT_DIR" ]; then
        safe_delete "$OUT_DIR" "Intermediate build files"
    fi

    # Clean dist/
    if [ -d "$DIST_DIR" ]; then
        # Offer to clean individual builds or all
        echo ""
        echo -e "${BOLD}How would you like to clean dist/?${NC}"
        echo "  1) Delete ALL build artifacts"
        echo "  2) Delete individual builds (select which ones)"
        echo "  3) Skip dist/ cleanup"
        echo ""
        echo -n "Choice [1/2/3]: "
        read -r choice

        case $choice in
            1)
                safe_delete "$DIST_DIR" "All distribution packages"
                ;;
            2)
                local builds
                builds=$(list_builds "$DIST_DIR")
                if [ -n "$builds" ]; then
                    echo "$builds" | while read -r build_dir; do
                        if [ -n "$build_dir" ]; then
                            safe_delete "$build_dir" "Build: $(basename "$build_dir")"
                        fi
                    done
                else
                    log_info "No individual build directories found"
                fi
                ;;
            *)
                log_info "Skipping dist/ cleanup"
                ;;
        esac
    fi

    echo ""
    log_success "Cleanup complete!"
    echo ""
}

main "$@"
