# Canvas Architecture

A modular layout system enabling N user-generated canvases with N custom panels.

## Architecture

```
app.tsx
  └─ <CanvasRenderer>          # Single entry point for all canvases
       └─ <Canvas>             # Renders columns based on config
            └─ <Column>        # Sizing, resize, drag-and-drop
                 └─ Panel      # PRList, BranchList, GitGraph, etc.
```

## Components

### Canvas System (`app/components/canvas/`)

| Component | Purpose |
|-----------|---------|
| `CanvasRenderer.tsx` | Main entry point - data/handlers → panels |
| `CanvasContext.tsx` | Global state, reducer, presets |
| `Canvas.tsx` | Column layout, visibility, drag state |
| `Column.tsx` | Width, resize, drag-and-drop |
| `EditorSlot.tsx` | Editor panel with back/forward nav |

### List Panels (`app/components/panels/list/`)

| Component | Purpose |
|-----------|---------|
| `PRList.tsx` | Pull requests with search/filter/sort |
| `BranchList.tsx` | Local/remote branches |
| `WorktreeList.tsx` | Worktrees with parent filtering |
| `StashList.tsx` | Stash entries |
| `UnifiedList.tsx` | All items in collapsible sections |
| `ListPanelHeader.tsx` | Shared header component |

### Viz Panels (`app/components/panels/viz/`)

| Component | Purpose |
|-----------|---------|
| `GitGraph.tsx` | Git commit graph with lanes |

## Canvas Presets

```typescript
RADAR_CANVAS  // 5 list columns: stashes, prs, worktrees, branches, remotes
FOCUS_CANVAS  // unified-list + git-graph + editor
GRAPH_CANVAS  // git-graph only
```

## Types

```typescript
interface Column {
  id: string
  slotType: 'list' | 'editor' | 'viz'
  panel: PanelType
  width: number | 'flex'
  minWidth?: number
  label?: string
  icon?: string
  visible?: boolean
  collapsible?: boolean
}

interface Canvas {
  id: string
  name: string
  columns: Column[]
  isPreset?: boolean
  icon?: string
}
```

## Adding a New Canvas

1. Create preset in `CanvasContext.tsx`:
```typescript
export const MY_CANVAS: Canvas = {
  id: 'my-canvas',
  name: 'My Canvas',
  icon: '🔮',
  isPreset: true,
  columns: [
    { id: 'col-1', slotType: 'list', panel: 'pr-list', width: 'flex' },
  ],
}
```

2. Add to `PRESET_CANVASES`

3. Add tab button in header (app.tsx)

## Adding a New Panel

1. Create component in `app/components/panels/list/` or `viz/`

2. Add to `CanvasRenderer.tsx`:
```typescript
case 'my-panel':
  return <MyPanel column={column} ... />
```

3. Add type to `app-types.ts`

## State Flow

```
CanvasContext (global state)
    ↓ dispatch actions
canvasReducer
    ↓ updates
activeCanvas, editorState
    ↓ consumed by
CanvasRenderer
    ↓ renders
Panels
```

## Files Changed in Migration

- `app/app.tsx`: 3475 → 1975 lines (-1500)
- Deleted: Old Radar/Focus inline JSX
- Deleted: `PanelRenderer.tsx` (replaced by `CanvasRenderer`)
- Added: `CanvasRenderer.tsx`, `UnifiedList.tsx`
