import { POLICY_VERSION } from './document.js';
import { assertPolicies, parsePolicies } from './parse.js';
import type { PolicyBuilder } from './types/builder.js';

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
