import { z } from 'zod'

import { relativePosixPathSchema, schemaVersionSchema } from './primitives.js'

export const GENERATED_RESULT_MANIFEST_PATH = '.vibe-helper/result.json' as const

const generatedResultUrlPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(240)
  .refine(
    (value) =>
      value.startsWith('/') &&
      !value.startsWith('//') &&
      !value.includes('\\') &&
      !value.includes('?') &&
      !value.includes('#') &&
      !value.split('/').includes('..'),
    'Generated web result path must be a local absolute URL path',
  )

export const generatedResultManifestSchema = z.strictObject({
  schemaVersion: schemaVersionSchema,
  kind: z.literal('WEB'),
  entry: relativePosixPathSchema.refine(
    (value) => /\.(?:cjs|mjs|js)$/.test(value),
    'Generated web result entry must be compiled JavaScript',
  ),
  healthPath: generatedResultUrlPathSchema,
  openPath: generatedResultUrlPathSchema.default('/'),
})

export type GeneratedResultManifest = z.infer<typeof generatedResultManifestSchema>
