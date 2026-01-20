# Renderer Architecture

## Overview

Ledger uses a modular renderer architecture that separates **domain data** from **visual engines**. This pattern allows the same data to be visualized using different rendering libraries while keeping parsers and data structures reusable.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     DATA LAYER (Main Process)                    │
├─────────────────────────────────────────────────────────────────┤
│  Parsers produce typed JSON/objects                              │
│                                                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ ERD Parser  │  │ Future:     │  │ Future:     │              │
│  │             │  │ Folder Tree │  │ Dependency  │              │
│  │ → ERDSchema │  │ Parser      │  │ Graph Parser│              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ IPC (typed, Zod-validated)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SHARED UTILITIES (Renderer)                    │
├─────────────────────────────────────────────────────────────────┤
│  Renderer-agnostic helpers                                       │
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ Layout Engines  │  │ Data Filters    │                       │
│  │ (Dagre, d3)     │  │ (relationship   │                       │
│  │                 │  │  count, etc.)   │                       │
│  └─────────────────┘  └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RENDERER LAYER (React)                        │
├─────────────────────────────────────────────────────────────────┤
│  Visual engines consume the same data                            │
│                                                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐    │
│  │  tldraw   │  │React Flow │  │  JSON     │  │  Future:  │    │
│  │  Renderer │  │ Renderer  │  │ Renderer  │  │ Mermaid   │    │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Data Contracts

### Domain Data Types

Each visualization domain defines a typed data structure that all renderers consume:

```typescript
// ERD Domain (lib/services/erd/erd-types.ts)
interface ERDSchema {
  entities: ERDEntity[]
  relationships: ERDRelationship[]
  framework: 'laravel' | 'rails' | 'generic'
  source: string
  parsedAt: string
}

interface ERDEntity {
  id: string
  name: string
  displayName: string
  attributes: ERDAttribute[]
  position?: { x: number; y: number }
}

interface ERDRelationship {
  id: string
  from: ERDRelationshipEndpoint
  to: ERDRelationshipEndpoint
  label?: string
  type: 'identifying' | 'non-identifying'
}
```

### Renderer Contract

Each renderer implements a simple interface:

```typescript
interface RendererProps<T> {
  schema: T | null  // The domain data
}

// Example: ERD Renderer
function TldrawRenderer({ schema }: { schema: ERDSchema | null }) {
  // Convert schema to tldraw shapes
  // Handle null/empty states
  // Return rendered visualization
}
```

### Layout Contract

Shared layout functions return renderer-agnostic position data:

```typescript
// layout/erd-layout.ts
interface EntityPosition {
  x: number
  y: number
  width: number
  height: number
}

function layoutEntities(schema: ERDSchema): Map<string, EntityPosition>
```

## Implementation Pattern

### 1. Define Domain Types

```typescript
// lib/services/{domain}/{domain}-types.ts
export interface DomainSchema {
  // Domain-specific fields
}
```

### 2. Create Parser Service

```typescript
// lib/services/{domain}/{domain}-parser-service.ts
export async function parseSchema(repoPath: string): Promise<DomainSchema> {
  // Parse source files
  // Return typed schema
}
```

### 3. Register IPC Handlers

```typescript
// lib/conveyor/handlers/{domain}-handler.ts
handle('get-{domain}-schema', async (repoPath?: string) => {
  const schema = await parseSchema(repoPath)
  return { success: true, data: schema }
})
```

### 4. Create Shared Layout

```typescript
// app/components/panels/viz/{domain}/layout/{domain}-layout.ts
export function layoutNodes(schema: DomainSchema): Map<string, Position> {
  // Use dagre, d3-force, or custom algorithm
  // Return renderer-agnostic positions
}
```

### 5. Implement Renderers

```typescript
// app/components/panels/viz/{domain}/renderers/
// TldrawRenderer.tsx - Infinite canvas
// ReactFlowRenderer.tsx - Node graph
// JsonRenderer.tsx - Data inspector
// MermaidRenderer.tsx - Diagram export
```

### 6. Create Panel with Selector

```typescript
// app/components/panels/viz/{domain}/{Domain}Panel.tsx
type RendererType = 'tldraw' | 'reactflow' | 'json'

function DomainPanel({ repoPath }) {
  const [renderer, setRenderer] = useState<RendererType>('tldraw')
  const [schema, setSchema] = useState<DomainSchema | null>(null)
  
  return (
    <div>
      <Header renderer={renderer} onRendererChange={setRenderer} />
      {renderer === 'tldraw' && <TldrawRenderer schema={schema} />}
      {renderer === 'reactflow' && <ReactFlowRenderer schema={schema} />}
      {renderer === 'json' && <JsonRenderer schema={schema} />}
    </div>
  )
}
```

## File Structure

```
app/components/panels/viz/{domain}/
├── index.ts                    # Exports
├── {Domain}Panel.tsx           # Main panel with renderer selector
├── layout/
│   └── {domain}-layout.ts      # Shared layout algorithms
└── renderers/
    ├── index.ts                # Renderer exports
    ├── TldrawRenderer.tsx      # tldraw implementation
    ├── ReactFlowRenderer.tsx   # React Flow implementation
    ├── JsonRenderer.tsx        # JSON tree viewer
    └── {Custom}Node.tsx        # Custom node components

lib/services/{domain}/
├── index.ts                    # Service exports
├── {domain}-types.ts           # Type definitions
└── {domain}-parser-service.ts  # Parsing logic

lib/conveyor/
├── schemas/{domain}-schema.ts  # Zod validation schemas
└── handlers/{domain}-handler.ts # IPC handlers
```

## Available Renderers

### tldraw (Canvas)

- **Use for**: Freeform exploration, annotations, screenshots
- **Features**: Infinite canvas, drawing tools, collaborative
- **Bundle**: ~500KB

```typescript
import { Tldraw, Editor } from 'tldraw'
import 'tldraw/tldraw.css'

function TldrawRenderer({ schema }) {
  const handleMount = (editor: Editor) => {
    // Create custom shapes from schema
  }
  
  return <Tldraw onMount={handleMount} shapeUtils={[CustomShapeUtil]} />
}
```

### React Flow (Graph)

- **Use for**: Structured editing, clean exports, large datasets
- **Features**: Built-in minimap, controls, better performance
- **Bundle**: ~150KB

```typescript
import { ReactFlow, Background, Controls, MiniMap } from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function ReactFlowRenderer({ schema }) {
  const [nodes, setNodes] = useNodesState(schemaToNodes(schema))
  const [edges, setEdges] = useEdgesState(schemaToEdges(schema))
  
  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={customNodeTypes}>
      <Background />
      <Controls />
      <MiniMap />
    </ReactFlow>
  )
}
```

### JSON Viewer (Data Inspector)

- **Use for**: Debugging, data inspection, export
- **Features**: Expandable tree, copy to clipboard
- **Bundle**: ~3KB

```typescript
import { JsonView, darkStyles, defaultStyles } from 'react-json-view-lite'
import 'react-json-view-lite/dist/index.css'

function JsonRenderer({ schema }) {
  return (
    <JsonView
      data={schema}
      shouldExpandNode={(level) => level < 2}
      style={isDark ? darkStyles : defaultStyles}
    />
  )
}
```

## Future Renderers

| Renderer | Library | Use Case |
|----------|---------|----------|
| **Mermaid** | mermaid.js | Export to Mermaid syntax |
| **D3 Force** | d3-force | Organic/physics-based layout |
| **SVG Export** | Custom | Static vector output |
| **Heatmap** | visx or custom | Activity/size visualization |

## Benefits

1. **Separation of Concerns**: Parsers don't know about rendering
2. **Flexibility**: Add new renderers without changing data layer
3. **Testing**: Test data parsing independently from UI
4. **Performance**: Choose optimal renderer for use case
5. **Consistency**: Shared layout ensures same positions across renderers

## Guidelines

### Do

- Keep domain types renderer-agnostic (no tldraw/React Flow types)
- Use shared layout for consistent positioning
- Validate data with Zod at IPC boundary
- Handle null/empty states gracefully in each renderer

### Don't

- Put rendering logic in parser services
- Import rendering libraries in shared layout
- Duplicate layout algorithms per renderer
- Assume specific renderer in domain types
