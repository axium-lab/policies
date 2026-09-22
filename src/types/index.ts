export type { PolicyIssue } from './issue.js';
export type { PolicySection } from './section.js';
export type { Policies, ResolvedPolicies } from './document.js';
export type { ParseResult } from './result.js';
export type { PolicyBuilder } from './builder.js';

// Derived from `SECTIONS`, so they live next to it and are re-exported here.
export type { SectionInput, SectionKey, SectionSchema } from '../policies/index.js';
