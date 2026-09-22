import type { z } from 'zod';

import type { policiesSchema } from '../document.js';
import type { SectionKey, SectionSchema } from '../policies/index.js';

/** What you persist: sections that were never configured stay absent. */
export type Policies = z.infer<typeof policiesSchema>;

type SectionOutputs = { [Key in SectionKey]: z.output<SectionSchema<Key>> };

/** Every section present, for the runtime that has to act on a decision. */
export type ResolvedPolicies = Omit<Policies, SectionKey> & SectionOutputs;
