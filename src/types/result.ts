import type { Policies } from './document.js';
import type { PolicyIssue } from './issue.js';

export type ParseResult =
  | { ok: true; value: Policies; warnings: PolicyIssue[] }
  | { ok: false; errors: PolicyIssue[] };
