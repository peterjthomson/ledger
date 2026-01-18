# Entity Relationship Diagram (ERD) Visualization

## Overview

The ERD panel provides an interactive, infinite canvas visualization of database schemas. It automatically parses Laravel migrations, Rails schema.rb files, and Mermaid ERD syntax to render explorable entity-relationship diagrams.

## Accessing the ERD Panel

1. Open a repository in Ledger
2. In the Viz column, click the panel selector (dropdown at top)
3. Select **ERD** (◫ icon)

The panel will automatically detect your framework and parse the schema.

## Supported Frameworks

| Framework | Detection | Schema Sources |
|-----------|-----------|----------------|
| **Laravel** | `artisan` file present | `database/migrations/*.php`, `app/Models/*.php` |
| **Rails** | `Rakefile` + `config/application.rb` | `db/schema.rb`, `app/models/*.rb` |
| **Generic** | Fallback | `.mmd`, `.mermaid`, `.erd.md` files with Mermaid ERD syntax |

## Interface

### Canvas Controls

The ERD uses [tldraw](https://tldraw.dev/), providing:

- **Pan**: Click and drag on empty canvas
- **Zoom**: Scroll wheel or pinch gesture
- **Select**: Click on entities
- **Move**: Drag entities to reposition
- **Multi-select**: Shift+click or drag selection box

### Header Bar

- **Framework Badge**: Shows detected framework (🐘 Laravel / 💎 Rails)
- **Entity Count**: Number of tables and relationships displayed
- **Refresh** (↻): Re-parse schema from source files

### Entity Display

Each table/entity displays:

| Element | Description |
|---------|-------------|
| **Header** | Table name (highlighted accent color) |
| **🔑** | Primary key column |
| **🔗** | Foreign key column |
| **✦** | Unique constraint |
| **⚡** | Indexed column |
| *Italic name* | Nullable column |

### Relationships

Arrows connect related entities with cardinality:

- **One-to-One**: Single line endpoints
- **One-to-Many**: Arrow pointing to "many" side
- **Many-to-Many**: Double arrows

## Smart Filtering

On initial load, the ERD filters to show only "hub" entities—tables with 3+ relationships to other hub entities. This reduces visual noise in large schemas. Click **Refresh** to re-apply this filter after manual changes.

## Data Types

The parser recognizes common column types and displays them in abbreviated form:

| Laravel | Rails | Display |
|---------|-------|---------|
| `$table->id()` | `t.primary_key` | `bigint` (PK) |
| `$table->foreignId()` | `t.references` | `bigint` (FK) |
| `$table->string()` | `t.string` | `string` |
| `$table->text()` | `t.text` | `text` |
| `$table->timestamps()` | `t.timestamps` | `created_at`, `updated_at` |
| `$table->boolean()` | `t.boolean` | `bool` |
| `$table->json()` | `t.json` | `json` |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Schema Sources                        │
├──────────────────────────┬──────────────────────────────┤
│  Laravel                 │  Rails                       │
│  └─ database/migrations/ │  └─ db/schema.rb             │
│  └─ app/Models/          │  └─ app/models/              │
└──────────────────────────┴──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              ERD Parser Service (Main Process)           │
│  lib/services/erd/erd-parser-service.ts                 │
│  ├─ detectFramework(repoPath)                           │
│  ├─ parseSchema(repoPath) → ERDSchema                   │
│  └─ parseMermaidERD(content) → ERDSchema                │
└─────────────────────────────────────────────────────────┘
                           │ IPC
                           ▼
┌─────────────────────────────────────────────────────────┐
│              ERD Canvas Panel (Renderer)                 │
│  app/components/panels/viz/erd/                         │
│  ├─ ERDCanvasPanel.tsx    - Main panel component        │
│  ├─ EntityShapeUtil.tsx   - Custom tldraw shape         │
│  └─ erdUtils.ts           - Layout (Dagre) + rendering  │
└─────────────────────────────────────────────────────────┘
```

## IPC API

Available via `window.electronAPI`:

```typescript
// Get parsed ERD schema for current or specified repo
getERDSchema(repoPath?: string): Promise<ERDParseResult>

// Detect framework type without full parsing
detectERDFramework(repoPath?: string): Promise<ERDFrameworkResult>

// Parse Mermaid ERD content directly
parseMermaidERD(content: string): Promise<ERDParseResult>
```

## Mermaid ERD Support

You can create a `.mmd` or `.mermaid` file in your repo with Mermaid ERD syntax:

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    
    CUSTOMER {
        int id PK
        string name
        string email UK
        datetime created_at
    }
    
    ORDER {
        int id PK
        int customer_id FK
        decimal total
        datetime ordered_at
    }
```

## Dependencies

- **tldraw** `^4.2.3` - Infinite canvas SDK
- **dagre** `^0.8.5` - Directed graph layout algorithm

## Theming

The ERD canvas respects Ledger's theme (light/dark mode). CSS variables from `app/styles/app.css` are mapped to tldraw's theme system for consistent appearance.
