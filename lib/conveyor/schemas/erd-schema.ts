import { z } from 'zod'

export const ERDFrameworkSchema = z.enum(['laravel', 'rails', 'generic'])
export const ERDConstraintSchema = z.enum(['PK', 'FK', 'UK', 'nullable', 'indexed'])
export const ERDCardinalitySchema = z.enum(['one', 'zero-or-one', 'many', 'one-or-more'])
export const ERDRelationshipTypeSchema = z.enum(['identifying', 'non-identifying'])

export const ERDForeignKeySchema = z.object({
  table: z.string(),
  column: z.string(),
})

export const ERDAttributeSchema = z.object({
  name: z.string(),
  type: z.string(),
  constraints: z.array(ERDConstraintSchema),
  foreignKey: ERDForeignKeySchema.optional(),
  defaultValue: z.string().optional(),
  comment: z.string().optional(),
})

export const ERDEntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  displayName: z.string(),
  attributes: z.array(ERDAttributeSchema),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
    })
    .optional(),
})

export const ERDRelationshipEndpointSchema = z.object({
  entity: z.string(),
  attribute: z.string().optional(),
  cardinality: ERDCardinalitySchema,
})

export const ERDRelationshipSchema = z.object({
  id: z.string(),
  from: ERDRelationshipEndpointSchema,
  to: ERDRelationshipEndpointSchema,
  label: z.string().optional(),
  type: ERDRelationshipTypeSchema,
})

export const ERDSchemaSchema = z.object({
  entities: z.array(ERDEntitySchema),
  relationships: z.array(ERDRelationshipSchema),
  framework: ERDFrameworkSchema,
  source: z.string(),
  parsedAt: z.string(),
})

export const ERDParseResultSchema = z.object({
  success: z.boolean(),
  data: ERDSchemaSchema.optional(),
  message: z.string().optional(),
})

export const ERDFrameworkResultSchema = z.object({
  success: z.boolean(),
  data: ERDFrameworkSchema.optional(),
  message: z.string().optional(),
})

export const erdIpcSchema = {
  'get-erd-schema': {
    args: z.tuple([z.string().optional()]),
    return: ERDParseResultSchema,
  },
  'detect-erd-framework': {
    args: z.tuple([z.string().optional()]),
    return: ERDFrameworkResultSchema,
  },
  'parse-mermaid-erd': {
    args: z.tuple([z.string()]),
    return: ERDParseResultSchema,
  },
}

export type ERDFramework = z.infer<typeof ERDFrameworkSchema>
export type ERDConstraint = z.infer<typeof ERDConstraintSchema>
export type ERDCardinality = z.infer<typeof ERDCardinalitySchema>
export type ERDRelationshipType = z.infer<typeof ERDRelationshipTypeSchema>
export type ERDForeignKey = z.infer<typeof ERDForeignKeySchema>
export type ERDAttribute = z.infer<typeof ERDAttributeSchema>
export type ERDEntity = z.infer<typeof ERDEntitySchema>
export type ERDRelationshipEndpoint = z.infer<typeof ERDRelationshipEndpointSchema>
export type ERDRelationship = z.infer<typeof ERDRelationshipSchema>
export type ERDSchema = z.infer<typeof ERDSchemaSchema>
export type ERDParseResult = z.infer<typeof ERDParseResultSchema>
export type ERDFrameworkResult = z.infer<typeof ERDFrameworkResultSchema>
