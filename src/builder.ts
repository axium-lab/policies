import type { z } from 'zod';

import { assertPolicies, parsePolicies, type ParseResult } from './parse.js';
import type { Policies } from './document.js';
import { POLICY_VERSION } from './document.js';
import type { SectionKey, SectionSchema } from './registry.js';

/** What a caller passes in, before defaults and canonicalization are applied. */
export type SectionInput<Key extends SectionKey> = z.input<SectionSchema<Key>>;

export interface PolicyBuilder {
  set<Key extends SectionKey>(key: Key, value: SectionInput<Key>): PolicyBuilder;
  remove(key: SectionKey): PolicyBuilder;
  /** Validates and canonicalizes; throws `PolicyValidationError` if invalid. */
  build(): Policies;
  /** Same, without throwing, and with the warnings included. */
  safeBuild(): ParseResult;
}

/**
 * Immutable builder: every call returns a new one, so a draft can be shared
 * without anybody mutating it from under you.
 */
export function policy(initial: Record<string, unknown> = { version: POLICY_VERSION }): PolicyBuilder {
  const draft = { ...initial };

  return {
    set(key, value) {
      return policy({ ...draft, [key]: value });
    },
    remove(key) {
      const { [key]: _removed, ...rest } = draft;
      return policy(rest);
    },
    build() {
      return assertPolicies(draft);
    },
    safeBuild() {
      return parsePolicies(draft);
    },
  };
}
