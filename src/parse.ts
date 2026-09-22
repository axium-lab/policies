import { policiesSchema } from './document.js';
import { fromZodError, PolicyValidationError } from './errors.js';
import { SECTIONS } from './policies/index.js';
import type { Policies, ResolvedPolicies } from './types/document.js';
import type { PolicyIssue } from './types/issue.js';
import type { ParseResult } from './types/result.js';

type AnySection = {
  key: string;
  schema: { parse: (input: unknown) => unknown };
  lint?: (value: never, path: (string | number)[]) => PolicyIssue[];
};

const sections = Object.values(SECTIONS) as unknown as AnySection[];

function lintAll(document: Policies): PolicyIssue[] {
  const record = document as Record<string, unknown>;
  const warnings: PolicyIssue[] = [];
  for (const section of sections) {
    const value = record[section.key];
    if (value === undefined || !section.lint) continue;
    warnings.push(...section.lint(value as never, [section.key]));
  }
  return warnings;
}

/**
 * Validates and canonicalizes. The returned document is what you persist: sections
 * the user never configured stay absent, and the ones present are complete.
 */
export function parsePolicies(input: unknown): ParseResult {
  const result = policiesSchema.safeParse(input);
  if (!result.success) return { ok: false, errors: fromZodError(result.error) };
  return { ok: true, value: result.data, warnings: lintAll(result.data) };
}

/** Same as `parsePolicies`, for callers that prefer an exception. */
export function assertPolicies(input: unknown): Policies {
  const result = parsePolicies(input);
  if (!result.ok) throw new PolicyValidationError(result.errors);
  return result.value;
}

/**
 * Fills in the sections that were never configured. This is what the proxy runtime
 * consumes; it is not what you write back to the database.
 */
export function resolvePolicies(input: unknown): ResolvedPolicies {
  const document = assertPolicies(input);
  const resolved = { ...document } as Record<string, unknown>;
  for (const section of sections) {
    if (resolved[section.key] === undefined) resolved[section.key] = section.schema.parse({});
  }
  return resolved as ResolvedPolicies;
}
