import { z } from 'zod';

import type { PolicySection } from '../types/section.js';

const schema = z.strictObject({
  /**
   * Named after the existing `capture_samples` column rather than something that
   * reads better, so the two stay recognisably the same setting.
   */
  samples: z.boolean().default(false),
});

export type CapturePolicy = z.infer<typeof schema>;

export const captureSection = {
  key: 'capture',
  schema,
} as const satisfies PolicySection<'capture', typeof schema>;
