import type { z } from 'zod';

import { cacheSection } from './cache.js';
import { firewallSection } from './firewall.js';

/**
 * Every policy the document knows about. Adding one is a new file in this folder
 * plus one line here; nothing else in the package names a section explicitly.
 */
export const SECTIONS = {
  cache: cacheSection,
  firewall: firewallSection,
} as const;

export type SectionKey = keyof typeof SECTIONS;
export type SectionSchema<Key extends SectionKey> = (typeof SECTIONS)[Key]['schema'];
/** What a caller passes in, before defaults and canonicalization are applied. */
export type SectionInput<Key extends SectionKey> = z.input<SectionSchema<Key>>;
