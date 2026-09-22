import type { Policies } from './document.js';
import type { ParseResult } from './result.js';
import type { SectionInput, SectionKey } from '../policies/index.js';

export interface PolicyBuilder {
  set<Key extends SectionKey>(key: Key, value: SectionInput<Key>): PolicyBuilder;
  remove(key: SectionKey): PolicyBuilder;
  /** Validates and canonicalizes; throws `PolicyValidationError` if invalid. */
  build(): Policies;
  /** Same, without throwing, and with the warnings included. */
  safeBuild(): ParseResult;
}
