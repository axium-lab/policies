import { z } from 'zod';

import type { PolicySection } from '../types/section.js';

/** Mirrors euro-pii's `Action`. Adding one before the engine honours it accepts policies nobody enforces. */
export const DLP_ACTIONS = ['mask', 'block', 'keep'] as const;
/** What the core runs euro-pii over. A file is scanned on its extracted text. */
export const DLP_TARGETS = ['file', 'prompt'] as const;

/**
 * Shape only. Whether `ES_NIF` exists is the core's call against euro-pii's live
 * catalog: copying it here would mean a release every time the engine adds an entity.
 */
const name = z.string().regex(/^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/, {
  error: 'Invalid format: uppercase with underscores (e.g. ES_NIF, IBAN_CODE)',
});
const country = z.string().regex(/^([A-Z]{2}|GLOBAL)$/, {
  error: 'ISO 3166-1 alpha-2 code (e.g. ES) or GLOBAL',
});
const action = z.enum(DLP_ACTIONS);

/**
 * A set, so sorted and deduplicated: equivalent policies come out byte-identical.
 * Empty is rejected because euro-pii reads an omitted field as "unrestricted", and
 * `[]` reading as either "nothing" or "everything" is a trap.
 */
const setOf = <T extends string>(item: z.ZodType<T>) =>
  z
    .array(item)
    .min(1, { error: 'Cannot be empty: omit the field to leave it unrestricted' })
    .transform((list) => [...new Set(list)].sort())
    .optional();

/** Keys sorted for the same reason the sets are. */
const actionsBy = (key: z.ZodString) =>
  z
    .record(key, action)
    .default({})
    .transform((map) => Object.fromEntries(Object.entries(map).sort(([a], [b]) => (a < b ? -1 : 1))));

/**
 * euro-pii's `AnonymizeOptions`, field for field, so the core hands it over as-is.
 * What to scan is the selection (`countries`, `kinds`, `entities`, `except`); what
 * to do with each hit is `policy`, most specific first: entities > kinds > default.
 */
const options = z.strictObject({
  countries: setOf(country),
  kinds: setOf(name),
  entities: setOf(name),
  except: setOf(name),
  policy: z
    .strictObject({
      default: action.default('mask'),
      kinds: actionsBy(name),
      entities: actionsBy(name),
    })
    .prefault({}),
});

/**
 * `options` is euro-pii's contract and everything around it is ours, so a field we
 * add later never collides with one the engine adds.
 */
const schema = z
  .strictObject({
    /** Off by default, so pausing DLP keeps its configuration and `{}` changes nothing. */
    enabled: z.boolean().default(false),
    /** One configuration for every target: what is scanned and done is the same on each. */
    targets: setOf(z.enum(DLP_TARGETS)),
    options: options.prefault({}),
  })
  .superRefine((value, ctx) => {
    const { countries, kinds, entities, except, policy } = value.options;

    if (value.enabled && !value.targets) {
      ctx.addIssue({
        code: 'custom',
        path: ['targets'],
        message: 'An enabled DLP needs at least one target: file, prompt or both',
        params: { code: 'dlp.targets_required' },
      });
    }

    // euro-pii scans all of its catalog when nothing is selected.
    if (value.enabled && !countries && !kinds && !entities) {
      ctx.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'An enabled DLP needs a selection: countries, kinds or entities',
        params: { code: 'dlp.selection_required' },
      });
    }

    // euro-pii throws on this at runtime; better caught on save.
    except?.forEach((entity, index) => {
      if (policy.entities[entity] === 'block') {
        ctx.addIssue({
          code: 'custom',
          path: ['options', 'except', index],
          message: `${entity} is in except and also marked as block in policy.entities`,
          params: { code: 'dlp.block_excepted' },
        });
      }
    });
  });

export type DlpPolicy = z.infer<typeof schema>;
export type DlpAction = (typeof DLP_ACTIONS)[number];
export type DlpTarget = (typeof DLP_TARGETS)[number];

export const dlpSection = {
  key: 'dlp',
  schema,
} as const satisfies PolicySection<'dlp', typeof schema>;
