import type { z } from 'zod';

import type { PolicyIssue } from './errors.js';
import { firewallSection } from './policies/firewall.js';

/**
 * Everything a policy section has to provide. Schema, defaults, cross-field rules
 * and warnings all live in the section's own file, so adding a policy is one new
 * file plus one line in `SECTIONS`.
 */
export interface PolicySection<Key extends string = string, Schema extends z.ZodType = z.ZodType> {
  readonly key: Key;
  readonly schema: Schema;
  /** Non-blocking findings. The document is still valid when these fire. */
  readonly lint?: (value: z.output<Schema>, path: (string | number)[]) => PolicyIssue[];
}

export const SECTIONS = {
  firewall: firewallSection,
} as const;

export type SectionKey = keyof typeof SECTIONS;
export type SectionSchema<Key extends SectionKey> = (typeof SECTIONS)[Key]['schema'];
