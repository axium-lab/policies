import { z } from 'zod';

import type { PolicySection } from '../types/section.js';

const schema = z.strictObject({
  /**
   * On by default, unlike every other switch here: the proxy already stored the
   * request record before this section existed, so an absent section has to keep
   * doing it.
   */
  enabled: z.boolean().default(true),
  /**
   * `input` and `output` rather than `prompt` and `response`, so the section still
   * reads right for requests that are not LLM calls.
   *
   * Both survive `enabled: false` on purpose: turning logs off and on again gives
   * back the same choice instead of resetting it.
   */
  input: z.boolean().default(false),
  output: z.boolean().default(false),
});

export type LogsPolicy = z.infer<typeof schema>;

export const logsSection = {
  key: 'logs',
  schema,
} as const satisfies PolicySection<'logs', typeof schema>;
