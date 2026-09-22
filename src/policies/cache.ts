import { z } from 'zod';

import type { PolicySection } from '../types/section.js';

/** The real Postgres enum, `rm.cache_mode_enum`. */
export const CACHE_MODES = ['off', 'strict', 'semantic'] as const;

export const CACHE_TTL_MIN_SECONDS = 1;
/** 30 days. Without a ceiling, one extra zero caches for a year unnoticed. */
export const CACHE_TTL_MAX_SECONDS = 2_592_000;
/**
 * Deliberately high: a low threshold serves more answers and gets more of them
 * wrong, and getting it wrong here means handing someone another request's answer.
 */
export const CACHE_DEFAULT_MIN_SIMILARITY = 0.95;

const base = z.strictObject({
  /**
   * `semantic` is exact match first, then a vector lookup on miss — not an
   * alternative to `strict` but a second attempt after it. Skipping the exact step
   * pays for an embedding round-trip on requests a hash lookup would have answered.
   */
  mode: z.enum(CACHE_MODES).default('off'),
  ttl_seconds: z
    .number()
    .int()
    .min(CACHE_TTL_MIN_SECONDS)
    .max(CACHE_TTL_MAX_SECONDS)
    .nullable()
    .default(null),
  /** Only meaningful for `semantic`: how close a stored prompt has to be to count. */
  min_similarity: z.number().min(0).max(1).nullable().default(null),
});

const validated = base.superRefine((value, ctx) => {
  if (value.mode === 'off' && value.ttl_seconds !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['ttl_seconds'],
      message: 'No se puede fijar un TTL con la caché apagada',
      params: { code: 'cache.ttl_not_allowed' },
    });
  }

  if (value.mode !== 'off' && value.ttl_seconds === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['ttl_seconds'],
      message: `Obligatorio con mode "${value.mode}" (entre ${CACHE_TTL_MIN_SECONDS} y ${CACHE_TTL_MAX_SECONDS} segundos)`,
      params: { code: 'cache.ttl_required' },
    });
  }

  if (value.mode !== 'semantic' && value.min_similarity !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['min_similarity'],
      message: `El umbral de similitud solo aplica con mode "semantic", no con "${value.mode}"`,
      params: { code: 'cache.similarity_not_allowed' },
    });
  }
});

/**
 * Filling the threshold after validation rather than defaulting the field keeps a
 * default from appearing on modes where it is not allowed.
 */
const schema = validated.transform((value) =>
  value.mode === 'semantic' && value.min_similarity === null
    ? { ...value, min_similarity: CACHE_DEFAULT_MIN_SIMILARITY }
    : value,
);

export type CachePolicy = z.infer<typeof schema>;
export type CacheMode = (typeof CACHE_MODES)[number];

export const cacheSection = {
  key: 'cache',
  schema,
} as const satisfies PolicySection<'cache', typeof schema>;
