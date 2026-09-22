import type { z } from 'zod';

import type { PolicyIssue } from './issue.js';

/**
 * The contract every policy file fulfils. Schema, defaults, cross-field rules and
 * warnings all live in the section's own file, so adding a policy is one new file
 * plus one line in `SECTIONS`.
 */
export interface PolicySection<Key extends string = string, Schema extends z.ZodType = z.ZodType> {
  readonly key: Key;
  readonly schema: Schema;
  /** Non-blocking findings. The document is still valid when these fire. */
  readonly lint?: (value: z.output<Schema>, path: (string | number)[]) => PolicyIssue[];
}
