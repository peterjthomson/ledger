# ERD Panel - Developer Notes

Work in progress notes, known issues, and planned improvements for the Entity Relationship Diagram feature.

## Current Status

**Phase**: Multi-renderer architecture implemented

### Implemented

- [x] tldraw canvas integration with custom shape
- [x] React Flow graph renderer (alternative to tldraw)
- [x] JSON tree viewer renderer (for debugging/inspection)
- [x] Renderer toggle UI (Canvas/Graph/JSON)
- [x] Laravel migration parser (`Schema::create`, column types)
- [x] Laravel model parser (hasMany, hasOne, belongsTo, belongsToMany)
- [x] Rails schema.rb parser (create_table, column types)
- [x] Rails model parser (has_many, has_one, belongs_to, habtm)
- [x] Mermaid ERD syntax parser
- [x] Framework auto-detection
- [x] Dagre-based auto-layout (shared across renderers)
- [x] Relationship arrows (tldraw arrows, React Flow edges)
- [x] Smart filtering (3+ relationship threshold)
- [x] IPC handlers with Zod validation
- [x] Loading/error/empty state UI
- [x] CSS theming (light/dark mode)
- [x] CSP updated for tldraw CDN assets
- [x] Fix tldraw canvas drag interference (column draggable moved to handle only)

### Not Yet Implemented

- [ ] React Flow edges not rendering (debugging in progress)
- [ ] Custom RelationshipShapeUtil with crow's foot notation
- [ ] Entity position persistence (save/load layout)
- [ ] Export to PNG/SVG/Mermaid
- [ ] Entity search/filter
- [ ] Layout algorithm selector (Dagre/Force/Manual)
- [ ] Click entity → show in editor panel
- [ ] Hover relationship → highlight connected entities
- [ ] Context menu for entities
- [ ] structure.sql parsing for Rails

---

## Known Issues

### React Flow Renderer

1. **Edges Not Rendering**: Relationship lines don't appear in Graph view
   - Handles have explicit IDs, edges use `smoothstep` type
   - CSS explicitly styles `.react-flow__edge-path` with `!important`
   - Debug logging was removed for production cleanliness

### Parser Edge Cases

1. **Irregular Plurals**: Table name inference uses naive `+ 's'` pluralization
   - `Person` → `persons` (should be `people`)
   - `Goose` → `gooses` (should be `geese`)
   - **Workaround**: Relationships may not connect if table names don't match

2. **Custom Table Names**: Models with explicit `$table` or `self.table_name` aren't detected
   ```php
   // Not parsed correctly
   protected $table = 'custom_users';
   ```

3. **Polymorphic Relationships**: Not yet supported
   ```php
   $this->morphMany(Comment::class, 'commentable');
   ```

4. **Through Relationships**: Not yet supported
   ```php
   $this->hasManyThrough(Post::class, User::class);
   ```

5. **Laravel Schema Facades**: Only `Schema::create` parsed, not `Schema::table` modifications

### Canvas Interaction (macOS)

1. ~~**Blue Selection/Drag in tldraw**~~: Fixed by moving `draggable` attribute from column to drag handle only
   - **Root cause**: Column had `draggable={true}` which captured pointer events before tldraw
   - **Fix**: Only the drag handle (⋮⋮) is now draggable, content area works normally
2. **Pen release bug (3-finger drag)**: Partially mitigated by handling `pointercancel` events
   - **Root cause**: macOS Tahoe (26) has a system-level bug where 3-finger drag doesn't properly send "drag ended" signals
   - **Workaround**: Use click+drag instead of 3-finger drag, or press Escape to cancel stuck drawing
   - **Reference**: https://discussions.apple.com/thread/256144289

### Layout Issues

1. **NaN Coordinates**: Dagre can return NaN for disconnected nodes
   - **Mitigated**: Grid fallback layout in `erd-layout.ts`
   - **Symptom**: Orphan entities appear in grid pattern at top-left

2. **Orphan Arrows (tldraw)**: Relationships referencing filtered-out entities
   - **Mitigated**: Added validation to skip relationships with missing entities

3. **Initial Zoom**: Large schemas may not fit viewport on first render
   - **Mitigated**: `zoomToERDShapes` with maxZoom 0.8, inset 160

### tldraw Integration

1. **Shape Type Registration**: Must use string literal `'erd-entity' as const`
   - Module augmentation not working as documented

2. **HTMLContainer Styling**: Some CSS properties don't apply inside tldraw shapes
   - Use inline styles or `!important` as needed

3. **CDN Assets**: tldraw loads fonts/icons from `cdn.tldraw.com`
   - CSP updated in `app/index.html` to allow this

---

## Architecture Decisions

### Why Multiple Renderers?

The multi-renderer architecture separates domain data (ERDSchema) from visual engines:

| Renderer | Engine | Best For |
|----------|--------|----------|
| **Canvas** | tldraw | Freeform exploration, annotations, screenshots |
| **Graph** | React Flow | Structured editing, clean exports, performance |
| **JSON** | react-json-view-lite | Debugging, data inspection, copy/paste |

This pattern enables:
- Adding more visualization engines without changing parsers
- Reusing the same data for different visualizations
- Testing data independently from rendering

### Why tldraw?

| Option | Pros | Cons |
|--------|------|------|
| **tldraw** | Full-featured, MIT, infinite canvas | 500KB+ bundle |
| **React Flow** | Lighter, node-based, better edges | Less drawing flexibility |
| **Fabric.js** | Low-level control | More manual work |
| **Custom Canvas** | Full control | Significant dev time |

**Decision**: Offer both tldraw (freeform) and React Flow (structured) via toggle.

### Why Dagre for layout?

- Produces readable hierarchical layouts
- Handles directed graphs well (FK relationships are directional)
- Stable/deterministic output
- Shared across all renderers via `erd-layout.ts`

### Why filter by relationship count?

Large schemas (50+ tables) create visual noise. The iterative filtering algorithm:

1. Starts with all entities
2. Counts relationships between remaining entities
3. Removes entities with < N relationships
4. Repeats until stable

This ensures all displayed entities actually connect to other displayed entities.

---

## File Reference

```
app/components/panels/viz/erd/
├── index.ts                    # Module exports
├── ERDCanvasPanel.tsx          # Main panel with renderer selector
├── EntityShapeUtil.tsx         # tldraw custom shape
├── erdUtils.ts                 # tldraw-specific utilities
├── layout/
│   └── erd-layout.ts           # Shared Dagre layout (renderer-agnostic)
└── renderers/
    ├── index.ts                # Renderer exports
    ├── TldrawRenderer.tsx      # tldraw infinite canvas
    ├── ReactFlowRenderer.tsx   # React Flow node graph
    ├── EntityNode.tsx          # React Flow custom node
    ├── RelationshipEdge.tsx    # React Flow custom edge (unused)
    └── JsonRenderer.tsx        # JSON tree viewer

lib/services/erd/
├── index.ts                    # Service exports
├── erd-types.ts                # Type definitions
└── erd-parser-service.ts       # Schema parsers

lib/conveyor/
├── schemas/erd-schema.ts       # Zod schemas
└── handlers/erd-handler.ts     # IPC handlers
```

---

## Testing Notes

### Manual Testing Checklist

- [ ] Laravel repo with migrations + models
- [ ] Rails repo with schema.rb + models
- [ ] Repo with .mmd Mermaid file
- [ ] Empty repo (no schema found)
- [ ] Large schema (50+ tables)
- [ ] Schema with cycles (A → B → C → A)
- [ ] Dark mode / light mode toggle
- [ ] Window resize during render
- [ ] Switch between Canvas/Graph/JSON renderers
- [ ] Rapid repo switching (tests race condition fix)

### Test Repos

```bash
# Laravel
git clone https://github.com/laravel/laravel.git

# Rails (has schema.rb)
git clone https://github.com/discourse/discourse.git

# Create test Mermaid file
echo 'erDiagram
    USER ||--o{ POST : writes
    USER { int id PK string name }
    POST { int id PK int user_id FK text content }
' > test.mmd
```

---

## Performance Considerations

- **Bundle Impact**: tldraw (~500KB) + React Flow (~150KB) + react-json-view-lite (~3KB)
  - Consider lazy-loading ERD panel on demand
  
- **Large Schemas**: 100+ entities may slow initial render
  - Dagre layout is O(V+E), acceptable
  - Both tldraw and React Flow handle rendering efficiently
  - Filter threshold (3+) helps reduce default view

- **Memory**: Each entity shape holds ERDEntity data
  - Minimal overhead for typical schemas (<100KB)

---

## Future Improvements

### Short Term (Bug Fixes)

1. ~~**Rails References Duplicate Columns**~~: Fixed - added seenColumns tracking
2. ~~**Relationship Deduplication**~~: Fixed - key now includes attribute/label
3. ~~**Rails has_one Pluralization**~~: Fixed - now pluralizes like belongs_to
4. ~~**Race Condition on Repo Switch**~~: Fixed - added version counter pattern
5. ~~**Mermaid Cardinality Patterns**~~: Fixed - symmetric regex for all notations
6. ~~**Zoom Max as Ceiling**~~: Fixed - calculates fit then clamps to max
7. **Fix React Flow Edges**: Debug why relationship lines don't render
   - Verify handle IDs match source/target
   - Test with simpler edge configuration

### Medium Term (UI Polish)

1. **Crow's Foot Notation**: Custom RelationshipShapeUtil with proper cardinality symbols
   - `||` exactly one
   - `o|` zero or one  
   - `|{` one or more
   - `o{` zero or more

2. **Entity Details Panel**: Click entity to see full column info in editor
   - Show foreign key references
   - Show indexes
   - Show constraints

3. **Position Persistence**: Save entity positions per repo
   - Store in `~/Library/Application Support/ledger/erd-layouts.json`
   - Key by repo path hash

4. **Export Options**:
   - PNG screenshot via tldraw's export
   - SVG for vector editing
   - Mermaid syntax generation
   - JSON copy (already available in JSON renderer)

5. **Search/Filter**: 
   - Search by table/column name
   - Filter by relationship type
   - Slider for relationship threshold

### Long Term (New Features)

- Diff visualization (show schema changes between commits)
- Live reload on migration file changes
- Support for other ORMs (Prisma, TypeORM, Sequelize)
- SQL file parsing (CREATE TABLE statements)
- Additional renderers (D3 force graph, Mermaid export)
