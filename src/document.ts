import { z } from 'zod';

import { SECTIONS, type SectionKey, type SectionSchema } from './policies/index.js';

export const POLICY_VERSION = 1;

type SectionShape = { [Key in SectionKey]: z.ZodOptional<SectionSchema<Key>> };

/**
 * A section exists only when it was configured, so every one of them is optional
 * and none carries a document-level default.
 */
const sectionShape = Object.fromEntries(
  Object.entries(SECTIONS).map(([key, section]) => [key, section.schema.optional()]),
) as SectionShape;

/**
 * The root is loose on purpose: an older deployment doing read-modify-write must
 * not silently drop a section written by a newer one. Inside each section the
 * schema is strict, so a typo in a known section is still an error.
 */
export const policiesSchema = z.looseObject({
  version: z.literal(POLICY_VERSION).default(POLICY_VERSION),
  ...sectionShape,
});

/**
 * JSON Schema for building forms. Derived from the *input* side: the front submits
 * what a person typed, before canonicalization.
 */
export function policiesJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(policiesSchema, { io: 'input' }) as Record<string, unknown>;
}
