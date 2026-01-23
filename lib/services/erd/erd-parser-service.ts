/**
 * ERD Parser Service
 *
 * Parses database schemas from Laravel and Rails projects to generate ERD data.
 * Also supports parsing Mermaid ERD syntax directly.
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import {
  ERDSchema,
  ERDEntity,
  ERDRelationship,
  ERDAttribute,
  ERDConstraint,
  ERDFramework,
  ERDCardinality,
} from './erd-types'

/**
 * Detect framework based on project files
 */
export async function detectFramework(repoPath: string): Promise<ERDFramework> {
  try {
    // Check for Laravel (artisan file)
    const artisanPath = path.join(repoPath, 'artisan')
    try {
      await fs.access(artisanPath)
      return 'laravel'
    } catch {
      // Not Laravel
    }

    // Check for Rails (Rakefile + config/application.rb)
    const rakefilePath = path.join(repoPath, 'Rakefile')
    const railsConfigPath = path.join(repoPath, 'config', 'application.rb')
    try {
      await fs.access(rakefilePath)
      await fs.access(railsConfigPath)
      return 'rails'
    } catch {
      // Not Rails
    }

    return 'generic'
  } catch {
    return 'generic'
  }
}

/**
 * Parse ERD schema from a repository
 */
export async function parseSchema(repoPath: string): Promise<ERDSchema> {
  const framework = await detectFramework(repoPath)

  switch (framework) {
    case 'laravel':
      return parseLaravelSchema(repoPath)
    case 'rails':
      return parseRailsSchema(repoPath)
    default:
      // Try to find a Mermaid ERD file
      return parseGenericSchema(repoPath)
  }
}

/**
 * Parse Laravel schema from migrations and models
 */
async function parseLaravelSchema(repoPath: string): Promise<ERDSchema> {
  const entities: ERDEntity[] = []
  const relationships: ERDRelationship[] = []

  // Parse migrations
  const migrationsPath = path.join(repoPath, 'database', 'migrations')
  try {
    const files = await fs.readdir(migrationsPath)
    const migrationFiles = files.filter((f) => f.endsWith('.php'))

    for (const file of migrationFiles) {
      const content = await fs.readFile(path.join(migrationsPath, file), 'utf-8')
      const parsed = parseLaravelMigration(content)
      entities.push(...parsed.entities)
    }
  } catch {
    // No migrations directory
  }

  // Parse models for relationships
  const modelsPath = path.join(repoPath, 'app', 'Models')
  try {
    const files = await fs.readdir(modelsPath)
    const modelFiles = files.filter((f) => f.endsWith('.php'))

    for (const file of modelFiles) {
      const content = await fs.readFile(path.join(modelsPath, file), 'utf-8')
      const parsed = parseLaravelModel(content, entities)
      relationships.push(...parsed)
    }
  } catch {
    // No models directory - try app/ directly (older Laravel)
    try {
      const files = await fs.readdir(path.join(repoPath, 'app'))
      const modelFiles = files.filter((f) => f.endsWith('.php') && !f.includes('Controller'))

      for (const file of modelFiles) {
        const content = await fs.readFile(path.join(repoPath, 'app', file), 'utf-8')
        const parsed = parseLaravelModel(content, entities)
        relationships.push(...parsed)
      }
    } catch {
      // No app directory
    }
  }

  return {
    entities: deduplicateEntities(entities),
    relationships: deduplicateRelationships(relationships),
    framework: 'laravel',
    source: repoPath,
    parsedAt: new Date().toISOString(),
  }
}

/**
 * Parse a single Laravel migration file
 */
function parseLaravelMigration(content: string): { entities: ERDEntity[] } {
  const entities: ERDEntity[] = []

  // Match Schema::create calls
  const createRegex = /Schema::create\s*\(\s*['"](\w+)['"]\s*,\s*function\s*\([^)]*\)\s*\{([\s\S]*?)\}\s*\)/g

  let match
  while ((match = createRegex.exec(content)) !== null) {
    const tableName = match[1]
    const tableBody = match[2]

    const attributes = parseLaravelColumns(tableBody)

    entities.push({
      id: tableName,
      name: tableName,
      displayName: toDisplayName(tableName),
      attributes,
    })
  }

  return { entities }
}

/**
 * Parse Laravel Blueprint column definitions
 */
function parseLaravelColumns(tableBody: string): ERDAttribute[] {
  const attributes: ERDAttribute[] = []

  // Common Laravel column patterns
  const patterns = [
    // $table->id() or $table->bigIncrements('id')
    { regex: /\$table->id\s*\(\s*(?:['"](\w+)['"])?\s*\)/g, type: 'bigint', pk: true },
    { regex: /\$table->bigIncrements\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'bigint', pk: true },
    { regex: /\$table->increments\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'int', pk: true },

    // Foreign keys
    { regex: /\$table->foreignId\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'bigint', fk: true },
    { regex: /\$table->unsignedBigInteger\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'bigint' },

    // Standard types
    { regex: /\$table->string\s*\(\s*['"](\w+)['"](?:\s*,\s*\d+)?\s*\)/g, type: 'string' },
    { regex: /\$table->text\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'text' },
    { regex: /\$table->longText\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'longtext' },
    { regex: /\$table->integer\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'int' },
    { regex: /\$table->bigInteger\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'bigint' },
    { regex: /\$table->smallInteger\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'smallint' },
    { regex: /\$table->tinyInteger\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'tinyint' },
    { regex: /\$table->float\s*\(\s*['"](\w+)['"].*?\)/g, type: 'float' },
    { regex: /\$table->double\s*\(\s*['"](\w+)['"].*?\)/g, type: 'double' },
    { regex: /\$table->decimal\s*\(\s*['"](\w+)['"].*?\)/g, type: 'decimal' },
    { regex: /\$table->boolean\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'bool' },
    { regex: /\$table->date\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'date' },
    { regex: /\$table->dateTime\s*\(\s*['"](\w+)['"].*?\)/g, type: 'datetime' },
    { regex: /\$table->timestamp\s*\(\s*['"](\w+)['"].*?\)/g, type: 'timestamp' },
    { regex: /\$table->time\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'time' },
    { regex: /\$table->year\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'year' },
    { regex: /\$table->json\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'json' },
    { regex: /\$table->jsonb\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'jsonb' },
    { regex: /\$table->binary\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'binary' },
    { regex: /\$table->uuid\s*\(\s*['"](\w+)['"]\s*\)/g, type: 'uuid' },
    { regex: /\$table->enum\s*\(\s*['"](\w+)['"].*?\)/g, type: 'enum' },

    // Timestamps helper (creates created_at and updated_at)
    { regex: /\$table->timestamps\s*\(\s*\)/g, type: 'timestamps', special: true },
    { regex: /\$table->softDeletes\s*\(\s*\)/g, type: 'softDeletes', special: true },
  ]

  for (const pattern of patterns) {
    let match
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)

    while ((match = regex.exec(tableBody)) !== null) {
      if (pattern.special) {
        // Handle special cases
        if (pattern.type === 'timestamps') {
          attributes.push(
            { name: 'created_at', type: 'timestamp', constraints: ['nullable'] },
            { name: 'updated_at', type: 'timestamp', constraints: ['nullable'] }
          )
        } else if (pattern.type === 'softDeletes') {
          attributes.push({ name: 'deleted_at', type: 'timestamp', constraints: ['nullable'] })
        }
      } else {
        const name = match[1] || 'id'
        const constraints: ERDConstraint[] = []

        if (pattern.pk) constraints.push('PK')
        if (pattern.fk) {
          constraints.push('FK')
          // Try to infer the referenced table
          const refTable = name.replace(/_id$/, '')
          attributes.push({
            name,
            type: pattern.type,
            constraints,
            foreignKey: { table: refTable + 's', column: 'id' },
          })
          continue
        }

        // Check for nullable/unique modifiers
        const lineStart = tableBody.lastIndexOf('\n', match.index) + 1
        const lineEnd = tableBody.indexOf('\n', match.index + match[0].length)
        const line = tableBody.substring(lineStart, lineEnd === -1 ? undefined : lineEnd)

        if (line.includes('->nullable()')) constraints.push('nullable')
        if (line.includes('->unique()')) constraints.push('UK')
        if (line.includes('->index()')) constraints.push('indexed')

        attributes.push({ name, type: pattern.type, constraints })
      }
    }
  }

  return attributes
}

/**
 * Parse Laravel model for relationships
 */
function parseLaravelModel(content: string, _entities: ERDEntity[]): ERDRelationship[] {
  const relationships: ERDRelationship[] = []

  // Extract class name
  const classMatch = content.match(/class\s+(\w+)\s+extends/)
  if (!classMatch) return relationships

  const modelName = classMatch[1]
  const tableName = toSnakeCase(modelName) + 's' // Laravel convention

  // Find relationship methods
  const relationPatterns = [
    { regex: /function\s+(\w+)\s*\(\s*\)[\s\S]*?return\s+\$this->hasMany\s*\(\s*(\w+)::class/g, type: 'hasMany' },
    { regex: /function\s+(\w+)\s*\(\s*\)[\s\S]*?return\s+\$this->hasOne\s*\(\s*(\w+)::class/g, type: 'hasOne' },
    { regex: /function\s+(\w+)\s*\(\s*\)[\s\S]*?return\s+\$this->belongsTo\s*\(\s*(\w+)::class/g, type: 'belongsTo' },
    { regex: /function\s+(\w+)\s*\(\s*\)[\s\S]*?return\s+\$this->belongsToMany\s*\(\s*(\w+)::class/g, type: 'belongsToMany' },
  ]

  for (const pattern of relationPatterns) {
    let match
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)

    while ((match = regex.exec(content)) !== null) {
      const relatedModel = match[2]
      const relatedTable = toSnakeCase(relatedModel) + 's'

      let from: { entity: string; cardinality: ERDCardinality }
      let to: { entity: string; cardinality: ERDCardinality }

      switch (pattern.type) {
        case 'hasMany':
          from = { entity: tableName, cardinality: 'one' }
          to = { entity: relatedTable, cardinality: 'many' }
          break
        case 'hasOne':
          from = { entity: tableName, cardinality: 'one' }
          to = { entity: relatedTable, cardinality: 'zero-or-one' }
          break
        case 'belongsTo':
          from = { entity: tableName, cardinality: 'many' }
          to = { entity: relatedTable, cardinality: 'one' }
          break
        case 'belongsToMany':
          from = { entity: tableName, cardinality: 'many' }
          to = { entity: relatedTable, cardinality: 'many' }
          break
        default:
          continue
      }

      relationships.push({
        id: `${tableName}_${relatedTable}_${pattern.type}`,
        from,
        to,
        label: match[1], // Method name
        type: 'identifying',
      })
    }
  }

  return relationships
}

/**
 * Parse Rails schema from schema.rb
 */
async function parseRailsSchema(repoPath: string): Promise<ERDSchema> {
  const entities: ERDEntity[] = []
  const relationships: ERDRelationship[] = []

  // Parse schema.rb
  const schemaPath = path.join(repoPath, 'db', 'schema.rb')
  try {
    const content = await fs.readFile(schemaPath, 'utf-8')
    const parsed = parseRailsSchemaFile(content)
    entities.push(...parsed.entities)
    relationships.push(...parsed.relationships)
  } catch {
    // Try structure.sql instead
    try {
      const structurePath = path.join(repoPath, 'db', 'structure.sql')
      const _content = await fs.readFile(structurePath, 'utf-8')
      // TODO: Parse SQL CREATE TABLE statements
    } catch {
      // No schema file found
    }
  }

  // Parse models for additional relationships
  const modelsPath = path.join(repoPath, 'app', 'models')
  try {
    const files = await fs.readdir(modelsPath)
    const modelFiles = files.filter((f) => f.endsWith('.rb'))

    for (const file of modelFiles) {
      const content = await fs.readFile(path.join(modelsPath, file), 'utf-8')
      const parsed = parseRailsModel(content, entities)
      relationships.push(...parsed)
    }
  } catch {
    // No models directory
  }

  return {
    entities: deduplicateEntities(entities),
    relationships: deduplicateRelationships(relationships),
    framework: 'rails',
    source: repoPath,
    parsedAt: new Date().toISOString(),
  }
}

/**
 * Parse Rails schema.rb file
 */
function parseRailsSchemaFile(content: string): { entities: ERDEntity[]; relationships: ERDRelationship[] } {
  const entities: ERDEntity[] = []
  const relationships: ERDRelationship[] = []

  // Match create_table blocks
  const tableRegex = /create_table\s+"(\w+)"(?:\s*,[^\n]*)?\s+do\s+\|t\|([\s\S]*?)^\s*end/gm

  let match
  while ((match = tableRegex.exec(content)) !== null) {
    const tableName = match[1]
    const tableBody = match[2]

    const attributes = parseRailsColumns(tableBody)

    // Add implicit id column if not explicitly defined
    if (!attributes.some((a) => a.name === 'id')) {
      attributes.unshift({ name: 'id', type: 'bigint', constraints: ['PK'] })
    }

    entities.push({
      id: tableName,
      name: tableName,
      displayName: toDisplayName(tableName),
      attributes,
    })

    // Extract foreign key relationships from column names
    for (const attr of attributes) {
      if (attr.foreignKey) {
        relationships.push({
          id: `${tableName}_${attr.foreignKey.table}`,
          from: { entity: tableName, cardinality: 'many', attribute: attr.name },
          to: { entity: attr.foreignKey.table, cardinality: 'one', attribute: attr.foreignKey.column },
          type: 'identifying',
        })
      }
    }
  }

  return { entities, relationships }
}

/**
 * Parse Rails column definitions
 */
function parseRailsColumns(tableBody: string): ERDAttribute[] {
  const attributes: ERDAttribute[] = []
  const seenColumns = new Set<string>() // Track seen column names to avoid duplicates

  // Rails column patterns
  // Note: t.references patterns are ordered so more specific pattern comes first
  // and we use seenColumns to prevent duplicates
  const patterns = [
    { regex: /t\.primary_key\s+"(\w+)"/g, type: 'bigint', pk: true },
    { regex: /t\.references\s+"(\w+)"/g, type: 'bigint', fk: true },
    { regex: /t\.bigint\s+"(\w+)"/g, type: 'bigint' },
    { regex: /t\.integer\s+"(\w+)"/g, type: 'int' },
    { regex: /t\.string\s+"(\w+)"/g, type: 'string' },
    { regex: /t\.text\s+"(\w+)"/g, type: 'text' },
    { regex: /t\.boolean\s+"(\w+)"/g, type: 'bool' },
    { regex: /t\.datetime\s+"(\w+)"/g, type: 'datetime' },
    { regex: /t\.date\s+"(\w+)"/g, type: 'date' },
    { regex: /t\.time\s+"(\w+)"/g, type: 'time' },
    { regex: /t\.timestamp\s+"(\w+)"/g, type: 'timestamp' },
    { regex: /t\.decimal\s+"(\w+)"/g, type: 'decimal' },
    { regex: /t\.float\s+"(\w+)"/g, type: 'float' },
    { regex: /t\.json\s+"(\w+)"/g, type: 'json' },
    { regex: /t\.jsonb\s+"(\w+)"/g, type: 'jsonb' },
    { regex: /t\.uuid\s+"(\w+)"/g, type: 'uuid' },
    { regex: /t\.binary\s+"(\w+)"/g, type: 'binary' },
    { regex: /t\.timestamps/g, type: 'timestamps', special: true },
  ]

  for (const pattern of patterns) {
    let match
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)

    while ((match = regex.exec(tableBody)) !== null) {
      if (pattern.special) {
        if (pattern.type === 'timestamps') {
          attributes.push(
            { name: 'created_at', type: 'datetime', constraints: [] },
            { name: 'updated_at', type: 'datetime', constraints: [] }
          )
        }
      } else {
        const name = match[1]
        const constraints: ERDConstraint[] = []

        if (pattern.pk) constraints.push('PK')
        if (pattern.fk) {
          constraints.push('FK')
          const colName = name + '_id'
          // Skip if we've already seen this column (prevents duplicates from overlapping patterns)
          if (seenColumns.has(colName)) continue
          seenColumns.add(colName)
          attributes.push({
            name: colName,
            type: pattern.type,
            constraints,
            foreignKey: { table: name + 's', column: 'id' },
          })
          continue
        }

        // Skip if we've already seen this column
        if (seenColumns.has(name)) continue
        seenColumns.add(name)

        // Check for modifiers
        const lineStart = tableBody.lastIndexOf('\n', match.index) + 1
        const lineEnd = tableBody.indexOf('\n', match.index + match[0].length)
        const line = tableBody.substring(lineStart, lineEnd === -1 ? undefined : lineEnd)

        if (line.includes('null: false')) {
          // Not nullable (no constraint added)
        } else if (line.includes('null: true') || !line.includes('null:')) {
          constraints.push('nullable')
        }

        if (line.includes('index: true') || line.includes('index: {')) {
          constraints.push('indexed')
        }

        attributes.push({ name, type: pattern.type, constraints })
      }
    }
  }

  return attributes
}

/**
 * Parse Rails model for relationships
 */
function parseRailsModel(content: string, _entities: ERDEntity[]): ERDRelationship[] {
  const relationships: ERDRelationship[] = []

  // Extract class name
  const classMatch = content.match(/class\s+(\w+)\s+<\s+(?:ApplicationRecord|ActiveRecord::Base)/)
  if (!classMatch) return relationships

  const modelName = classMatch[1]
  const tableName = toSnakeCase(modelName) + 's'

  // Find relationship declarations
  const relationPatterns = [
    { regex: /has_many\s+:(\w+)/g, type: 'hasMany' },
    { regex: /has_one\s+:(\w+)/g, type: 'hasOne' },
    { regex: /belongs_to\s+:(\w+)/g, type: 'belongsTo' },
    { regex: /has_and_belongs_to_many\s+:(\w+)/g, type: 'habtm' },
  ]

  for (const pattern of relationPatterns) {
    let match
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags)

    while ((match = regex.exec(content)) !== null) {
      const relatedName = match[1]
      // Rails convention: association name is singular for belongs_to/has_one, plural for has_many/habtm
      // Table names are always plural, so we pluralize singular association names
      const relatedTable =
        pattern.type === 'belongsTo' || pattern.type === 'hasOne' ? relatedName + 's' : relatedName

      let from: { entity: string; cardinality: ERDCardinality }
      let to: { entity: string; cardinality: ERDCardinality }

      switch (pattern.type) {
        case 'hasMany':
          from = { entity: tableName, cardinality: 'one' }
          to = { entity: relatedTable, cardinality: 'many' }
          break
        case 'hasOne':
          from = { entity: tableName, cardinality: 'one' }
          to = { entity: relatedTable, cardinality: 'zero-or-one' }
          break
        case 'belongsTo':
          from = { entity: tableName, cardinality: 'many' }
          to = { entity: relatedTable, cardinality: 'one' }
          break
        case 'habtm':
          from = { entity: tableName, cardinality: 'many' }
          to = { entity: relatedTable, cardinality: 'many' }
          break
        default:
          continue
      }

      relationships.push({
        id: `${tableName}_${relatedTable}_${pattern.type}`,
        from,
        to,
        label: relatedName,
        type: 'identifying',
      })
    }
  }

  return relationships
}

/**
 * Parse Mermaid ERD syntax
 */
export function parseMermaidERD(content: string): ERDSchema {
  const entities: ERDEntity[] = []
  const relationships: ERDRelationship[] = []

  // Remove erDiagram declaration
  const body = content.replace(/erDiagram\s*/i, '').trim()

  // Parse entity blocks
  const entityRegex = /(\w+)\s*\{([^}]*)\}/g
  let match
  while ((match = entityRegex.exec(body)) !== null) {
    const entityName = match[1]
    const attributesBlock = match[2]

    const attributes: ERDAttribute[] = []
    const attrLines = attributesBlock.trim().split('\n')

    for (const line of attrLines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Parse: type name [PK|FK|UK] ["comment"]
      const attrMatch = trimmed.match(/(\w+)\s+(\w+)(?:\s+(PK|FK|UK)(?:,\s*(PK|FK|UK))?)?(?:\s+"([^"]*)")?/)
      if (attrMatch) {
        const constraints: ERDConstraint[] = []
        if (attrMatch[3]) constraints.push(attrMatch[3] as ERDConstraint)
        if (attrMatch[4]) constraints.push(attrMatch[4] as ERDConstraint)

        attributes.push({
          name: attrMatch[2],
          type: attrMatch[1],
          constraints,
          comment: attrMatch[5],
        })
      }
    }

    entities.push({
      id: entityName,
      name: entityName,
      displayName: toDisplayName(entityName),
      attributes,
    })
  }

  // Parse relationships
  // Syntax: ENTITY1 cardinality--cardinality ENTITY2 : label
  // Cardinality patterns: || (one), |o/o| (zero-or-one), |{/}| (one-or-more), o{/}o (zero-or-more)
  // Use symmetric pattern for both sides to handle all valid Mermaid notations
  const cardinalityPattern = '(?:\\|[|o]|o[|{]|[{}][|o]?)'
  const relationRegex = new RegExp(
    `(\\w+)\\s+(${cardinalityPattern})--(${cardinalityPattern})\\s+(\\w+)\\s*(?::\\s*"?([^"\\n]*)"?)?`,
    'g'
  )

  while ((match = relationRegex.exec(body)) !== null) {
    const fromEntity = match[1]
    const fromCard = parseMermaidCardinality(match[2])
    const toCard = parseMermaidCardinality(match[3])
    const toEntity = match[4]
    const label = match[5]?.trim()

    relationships.push({
      id: `${fromEntity}_${toEntity}`,
      from: { entity: fromEntity, cardinality: fromCard },
      to: { entity: toEntity, cardinality: toCard },
      label,
      type: 'identifying',
    })
  }

  return {
    entities,
    relationships,
    framework: 'generic',
    source: 'mermaid',
    parsedAt: new Date().toISOString(),
  }
}

/**
 * Parse Mermaid cardinality notation
 */
function parseMermaidCardinality(notation: string): ERDCardinality {
  // || = exactly one
  // |o or o| = zero or one
  // }| or |{ = one or more
  // }o or o{ = zero or more

  if (notation.includes('{') || notation.includes('}')) {
    if (notation.includes('o')) return 'many'
    return 'one-or-more'
  }
  if (notation.includes('o')) return 'zero-or-one'
  return 'one'
}

/**
 * Try to parse a generic schema (look for Mermaid files)
 */
async function parseGenericSchema(repoPath: string): Promise<ERDSchema> {
  // Look for .mmd or .mermaid files
  const extensions = ['.mmd', '.mermaid', '.erd.md']

  for (const ext of extensions) {
    try {
      const files = await findFilesWithExtension(repoPath, ext)
      for (const file of files) {
        const content = await fs.readFile(file, 'utf-8')
        if (content.toLowerCase().includes('erdiagram')) {
          return parseMermaidERD(content)
        }
      }
    } catch {
      // Continue searching
    }
  }

  // Return empty schema
  return {
    entities: [],
    relationships: [],
    framework: 'generic',
    source: repoPath,
    parsedAt: new Date().toISOString(),
  }
}

/**
 * Find files with a specific extension recursively
 */
async function findFilesWithExtension(dir: string, ext: string, maxDepth = 3): Promise<string[]> {
  const results: string[] = []

  async function search(currentDir: string, depth: number) {
    if (depth > maxDepth) return

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)

        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          await search(fullPath, depth + 1)
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
          results.push(fullPath)
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  await search(dir, 0)
  return results
}

// Utility functions

function toDisplayName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/s$/, '') // Remove trailing 's' for singular form
}

function toSnakeCase(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
}

function deduplicateEntities(entities: ERDEntity[]): ERDEntity[] {
  const seen = new Map<string, ERDEntity>()

  for (const entity of entities) {
    const existing = seen.get(entity.id)
    if (!existing || entity.attributes.length > existing.attributes.length) {
      seen.set(entity.id, entity)
    }
  }

  return Array.from(seen.values())
}

function deduplicateRelationships(relationships: ERDRelationship[]): ERDRelationship[] {
  const seen = new Set<string>()
  const result: ERDRelationship[] = []

  for (const rel of relationships) {
    // Include attribute or label in key to preserve multiple FKs between same tables
    // e.g., orders.customer_id -> users and orders.salesperson_id -> users are distinct
    const discriminator = rel.from.attribute || rel.label || ''
    const key = `${rel.from.entity}-${rel.to.entity}-${discriminator}`
    const reverseKey = `${rel.to.entity}-${rel.from.entity}-${discriminator}`

    if (!seen.has(key) && !seen.has(reverseKey)) {
      seen.add(key)
      result.push(rel)
    }
  }

  return result
}
