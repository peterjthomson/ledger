# ERD Panel - Developer Notes

Work in progress notes, known issues, and planned improvements for the Entity Relationship Diagram feature.

## Current Status

**Phase**: Initial implementation complete (Phases 1-5 from plan)

### Implemented

- [x] tldraw canvas integration with custom shape
- [x] Laravel migration parser (`Schema::create`, column types)
- [x] Laravel model parser (hasMany, hasOne, belongsTo, belongsToMany)
- [x] Rails schema.rb parser (create_table, column types)
- [x] Rails model parser (has_many, has_one, belongs_to, habtm)
- [x] Mermaid ERD syntax parser
- [x] Framework auto-detection
- [x] Dagre-based auto-layout
- [x] Relationship arrows (using tldraw built-in arrows)
- [x] Smart filtering (3+ relationship threshold)
- [x] IPC handlers with Zod validation
- [x] Loading/error/empty state UI
- [x] CSS theming (light/dark mode)
- [x] CSP updated for tldraw CDN assets

### Not Yet Implemented

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

### Layout Issues

1. **NaN Coordinates**: Dagre can return NaN for disconnected nodes
   - **Mitigated**: Grid fallback layout in `erdUtils.ts` lines 129-132
   - **Symptom**: Orphan entities appear in grid pattern at top-left

2. **Overlapping Labels**: Relationship labels can overlap on dense diagrams
   - **Current**: Labels disabled (empty string returned from `formatRelationshipLabel`)

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

### Why tldraw over alternatives?

| Option | Pros | Cons |
|--------|------|------|
| **tldraw** | Full-featured, MIT, infinite canvas | 500KB+ bundle |
| **react-flow** | Lighter, node-based | Less drawing flexibility |
| **Fabric.js** | Low-level control | More manual work |
| **Custom Canvas** | Full control | Significant dev time |

**Decision**: tldraw's features (pan/zoom/select/undo) outweigh bundle size concerns.

### Why Dagre for layout?

- Produces readable hierarchical layouts
- Handles directed graphs well (FK relationships are directional)
- Stable/deterministic output
- Alternative: d3-force for organic layouts (not implemented)

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
├── index.ts              # Module exports
├── ERDCanvasPanel.tsx    # Main panel component
├── EntityShapeUtil.tsx   # tldraw custom shape
└── erdUtils.ts           # Layout + rendering helpers

lib/services/erd/
├── index.ts              # Service exports
├── erd-types.ts          # Type definitions
└── erd-parser-service.ts # Schema parsers

lib/conveyor/
├── schemas/erd-schema.ts # Zod schemas
└── handlers/erd-handler.ts # IPC handlers
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

- **Bundle Impact**: tldraw adds ~500KB to renderer bundle
  - Consider lazy-loading ERD panel on demand
  
- **Large Schemas**: 100+ entities may slow initial render
  - Dagre layout is O(V+E), acceptable
  - tldraw handles rendering efficiently
  - Filter threshold (3+) helps reduce default view

- **Memory**: Each entity shape holds ERDEntity data
  - Minimal overhead for typical schemas (<100KB)

---

## Future Improvements

### Phase 6 (UI Polish) - Planned

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

5. **Search/Filter**: 
   - Search by table/column name
   - Filter by relationship type
   - Slider for relationship threshold

### Beyond

- Diff visualization (show schema changes between commits)
- Live reload on migration file changes
- Support for other ORMs (Prisma, TypeORM, Sequelize)
- SQL file parsing (CREATE TABLE statements)
