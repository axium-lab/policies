import type { ZodError } from 'zod';

import type { PolicyIssue } from './types/issue.js';

export function toField(path: readonly (string | number)[]): string {
  return path.length === 0 ? '(root)' : path.join('.');
}

export function issue(path: (string | number)[], code: string, message: string): PolicyIssue {
  return { path, field: toField(path), code, message };
}

export function fromZodError(error: ZodError): PolicyIssue[] {
  return error.issues.map((raw) => {
    const path = raw.path.map((segment) => (typeof segment === 'number' ? segment : String(segment)));
    // Our own checks carry a stable code in `params`; zod's built-ins only have `code`.
    const params = (raw as { params?: { code?: unknown } }).params;
    const code = typeof params?.code === 'string' ? params.code : raw.code;
    return { path, field: toField(path), code, message: raw.message };
  });
}

export class PolicyValidationError extends Error {
  readonly issues: PolicyIssue[];

  constructor(issues: PolicyIssue[]) {
    super(`Policy inválida: ${issues.map((i) => `${i.field}: ${i.message}`).join('; ')}`);
    this.name = 'PolicyValidationError';
    this.issues = issues;
  }
}
