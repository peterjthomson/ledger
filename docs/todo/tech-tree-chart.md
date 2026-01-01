# Tech Tree Chart Implementation

## Overview

Create a StarCraft-inspired "Tech Tree" visualization panel showing branches merged to master as an inverted tree, where master is the final destination node and merged branches fan upward from it.

## To-Do List

- [ ] Add TechTreeNode and TechTreeData types to electron.d.ts
- [ ] Add getMergedBranchTree() function to git-service.ts
- [ ] Add IPC handler in main.ts and expose in preload.ts
- [ ] Create TechTreeChart.tsx component with SVG rendering
- [ ] Add StarCraft-inspired CSS styles for tech tree
- [ ] Export from viz/index.ts and add to CanvasRenderer.tsx

## Design

An inverted tech tree where **master/main is at the bottom** (the "final unlocked building") and each merged branch is a node above it, connected by glowing connector lines. StarCraft/Warhammer 40K-inspired dark theme with glowing borders and sci-fi aesthetic.

**Key principle: Visual variety through data-driven styling** - node size, color, icons, badges, and connector thickness all vary based on commit metadata.

## Visual Variety System

### Metadata-Driven Sizing (min/max/spread normalization)

Calculate statistics across all nodes, then categorize each into tiers:

```typescript
interface NodeStats {
  linesAdded: number      // +++ green lines
  linesRemoved: number    // --- red lines  
  filesChanged: number    // total files touched
  filesAdded: number      // new files
  filesRemoved: number    // deleted files
  commitCount: number     // commits on branch before merge
  daysSinceMerge: number  // age
}

// Normalize to 0-1 range, then bucket into tiers
type SizeTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
```

### Node Size Tiers (RELATIVE to visible data)

All thresholds are **percentile-based** within the visible dataset, ensuring visual spread regardless of repo size:

| Tier | Width | Height | Font | Percentile Range |
|------|-------|--------|------|------------------|
| **xs** | 120px | 40px | 10px | 0-10th percentile (smallest 10%) |
| **sm** | 150px | 55px | 11px | 10-30th percentile |
| **md** | 180px | 70px | 12px | 30-60th percentile |
| **lg** | 220px | 90px | 13px | 60-85th percentile |
| **xl** | 260px | 110px | 14px | 85-100th percentile (largest 15%) |

**Calculation:** Sort nodes by `linesAdded + linesRemoved`, assign tiers by position in sorted list.

### Connector Line Thickness (RELATIVE)

| Percentile | Stroke Width | Style |
|------------|--------------|-------|
| 0-10th | 1px | dashed |
| 10-30th | 2px | solid |
| 30-60th | 3px | solid + subtle glow |
| 60-85th | 4px | solid + glow |
| 85-100th | 6px | solid + strong glow + pulse |

**Result:** Every repo gets the full range of visual treatments - the smallest merge is always `xs`/dashed, the largest is always `xl`/pulsing.

### Color System (Branch Type + Intensity)

**Base colors by branch prefix:**

| Prefix | Color | Unicode Icon | Meaning |
|--------|-------|--------------|---------|
| `feature/` | Cyan `#56c8ff` | ◆ ⬡ ✦ | New functionality |
| `fix/` `bugfix/` `hotfix/` | Orange `#ff9640` | ⚠ ⚡ ✗ | Bug fixes, urgent |
| `chore/` `deps/` `build/` | Purple `#a080ff` | ⚙ ⛭ ◎ | Maintenance |
| `refactor/` | Teal `#40d9c0` | ⟳ ↻ ◇ | Code improvement |
| `docs/` | Blue `#6080ff` | ◈ ❖ ☰ | Documentation |
| `test/` | Green `#60d060` | ✓ ◉ ⬢ | Testing |
| `release/` | Gold `#ffc040` | ★ ⬟ ❋ | Releases |
| (default) | White `#c0c8d0` | ○ ◌ | Unknown |

**Intensity variation by size tier:**

- **xs/sm**: 60% opacity, subtle glow
- **md**: 80% opacity, normal glow  
- **lg/xl**: 100% opacity, strong glow + double border

### Badge System (RELATIVE thresholds)

Badges use **percentile-based** or **boolean** conditions for visual variety:

| Badge | Icon | Condition (Relative) | Position |
|-------|------|----------------------|----------|
| **Massive** | 🔥 ▲ | Top 10% by total LOC | top-right |
| **Destructive** | 💀 ☠ | Top 15% by lines removed | top-right |
| **Additive** | ✚ ⊕ | Top 15% by lines added | top-right |
| **Multi-file** | 📁 ⬡ | Top 20% by files changed | bottom-left |
| **Surgical** | ⚡ ◇ | Bottom 10% by LOC (tiny changes) | inline |
| **Ancient** | 🕸 ◌ | Top 15% oldest (by merge date) | corner, faded |
| **Fresh** | ✨ ★ | Top 15% newest (by merge date) | corner, bright |
| **PR** | #123 | Has PR number (boolean) | inline badge |

**Ensures:** Even a repo with tiny commits will show "Massive" badges on its largest ones, "Fresh" on newest, etc.

### Node Detail Levels

Based on size tier, show different amounts of info:

**xs (minimal):**
```
┌──────────────┐
│ ◆ fix/typo   │
└──────────────┘
```

**sm (compact):**
```
┌─────────────────┐
│ ◆ feature/auth  │
│ +234 -45        │
└─────────────────┘
```

**md (standard):**
```
┌──────────────────────┐
│ ◆ feature/api        │
│ +1,247 -382 ⬡12     │
│ ◷ 5d ago • alice    │
└──────────────────────┘
```

**lg (detailed):**
```
┌───────────────────────────┐
│ ⬡ feature/auth-system    │
│─────────────────────────│
│ +2,847 -892  ⬡ 23 files │
│ ▰▰▰▰▰▰▰▱▱▱ (large)      │
│ ◷ 3 days ago • @alice   │
└───────────────────────────┘
```

**xl (full):**
```
┌─────────────────────────────────┐
│ ★ release/v2.0.0          🔥   │
│═══════════════════════════════│
│ +8,234 -1,456   ⬡ 47 files    │
│ ████████░░ 85% additions       │
│ ◷ 2 days ago • @alice          │
│ PR #142 • 12 commits           │
└─────────────────────────────────┘
```

### Unicode Icon Library

**Structure/Shape:**
- ◆ ◇ ◈ ❖ - diamonds (features)
- ⬡ ⬢ ⎔ - hexagons (files/modules)
- ○ ● ◉ ◎ - circles (general)
- □ ■ ▣ ▢ - squares (builds)
- △ ▲ ▽ ▼ - triangles (warnings)

**Status/Action:**
- ✓ ✗ ✦ ★ - check/star
- ⚙ ⛭ ⚡ ⚠ - gear/warning
- ↻ ⟳ ↺ - refresh/cycle
- ◷ ◴ ◵ - clock/time

**Decorative:**
- ═ ─ │ ┌ ┐ └ ┘ - box drawing
- ▰ ▱ - progress bar segments
- ░ ▒ ▓ █ - density blocks

## Data Flow

1. Git service parses merge commits on master via `git log main --first-parent --merges` with `--stat`
2. Extract branch names from commit messages
3. Get diff stats for each merge (lines added/removed, files)
4. Calculate min/max/spread across all nodes
5. Return structured data with all metadata + normalized tiers
6. Frontend renders with data-driven visual variety

## Files to Modify

### Backend (3 files)

- `lib/main/git-service.ts` - Add `getMergedBranchTree()` with full stats
- `lib/main/main.ts` - Add IPC handler for `get-merged-branch-tree`
- `lib/preload/preload.ts` - Expose `getMergedBranchTree` to renderer

### Types (1 file)

- `app/types/electron.d.ts` - Add `TechTreeNode` and `TechTreeData` types with full metadata

### Frontend (3 files)

- `app/components/panels/viz/TechTreeChart.tsx` - New component with data-driven rendering
- `app/components/panels/viz/index.ts` - Export the new component
- `app/components/canvas/CanvasRenderer.tsx` - Add `tech-tree` panel case

### Styles (1 file)

- `app/styles/app.css` - Add `.tech-tree-*` styles with size/color variants

## Key Implementation Details

### Git Command (with stats)

```bash
git log main --first-parent --merges --format="%H|%ai|%an|%s" --stat -n 50
```

### Branch Name Extraction (regex patterns)

- `Merge branch '(.+)'` - standard git merge
- `Merge pull request #(\d+) from .+/(.+)` - GitHub PR merge (captures PR number)
- `Merge (.+) into` - alternative format

### Percentile-Based Tier Assignment

```typescript
type SizeTier = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

function assignTiers(nodes: TechTreeNode[]): Map<string, SizeTier> {
  // Sort by total LOC (additions + deletions)
  const sorted = [...nodes].sort((a, b) => 
    (a.linesAdded + a.linesRemoved) - (b.linesAdded + b.linesRemoved)
  )
  
  const tiers = new Map<string, SizeTier>()
  const n = sorted.length
  
  sorted.forEach((node, index) => {
    const percentile = index / n
    let tier: SizeTier
    if (percentile < 0.10) tier = 'xs'       // Bottom 10%
    else if (percentile < 0.30) tier = 'sm'  // 10-30%
    else if (percentile < 0.60) tier = 'md'  // 30-60%
    else if (percentile < 0.85) tier = 'lg'  // 60-85%
    else tier = 'xl'                          // Top 15%
    
    tiers.set(node.id, tier)
  })
  
  return tiers
}
```

### Visual Style Summary

- Dark background `#0a0c10` with subtle grid
- Scanline overlay for CRT effect
- Faction-colored nodes with glow intensity by size
- Variable connector thickness with glow
- Badges for exceptional metrics
- Master node: gold/brass, larger, pulsing glow
