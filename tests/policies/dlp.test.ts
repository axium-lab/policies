import { describe, expect, it } from 'vitest';

import { parsePolicies } from '../../src/parse.js';

const EMPTY_POLICY = { default: 'mask', kinds: {}, entities: {} };

/** Same schema behind both keys, so the whole suite runs once per section. */
describe.each(['dlp_prompt', 'dlp_file'] as const)('%s', (key) => {
  const parse = (dlp: unknown) => parsePolicies({ version: 1, [key]: dlp });

  const ok = (dlp: unknown) => {
    const result = parse(dlp);
    if (!result.ok) throw new Error(`expected valid: ${JSON.stringify(result.errors)}`);
    return { ...result, section: result.value[key] };
  };

  const codes = (dlp: unknown): string[] => {
    const result = parse(dlp);
    if (result.ok) throw new Error('expected invalid');
    return result.errors.map((e) => `${e.field}:${e.code}`);
  };

  describe('valid combinations', () => {
    it('when not configured, the key is absent', () => {
      const result = parsePolicies({ version: 1 });
      expect(result.ok && key in result.value).toBe(false);
    });

    it('configured empty, it materializes disabled', () => {
      expect(ok({}).section).toEqual({ enabled: false, options: { policy: EMPTY_POLICY } });
    });

    it('enabled with a selection', () => {
      expect(
        ok({
          enabled: true,
          options: {
            countries: ['ES', 'GLOBAL'],
            policy: { kinds: { BANK_ACCOUNT: 'block' }, entities: { ES_NIF: 'keep' } },
          },
        }).section,
      ).toEqual({
        enabled: true,
        options: {
          countries: ['ES', 'GLOBAL'],
          policy: { default: 'mask', kinds: { BANK_ACCOUNT: 'block' }, entities: { ES_NIF: 'keep' } },
        },
      });
    });

    it('disabled keeps its configuration (paused)', () => {
      expect(ok({ enabled: false, options: { entities: ['ES_NIF'] } }).section?.options.entities).toEqual(['ES_NIF']);
    });

    it('any of countries, kinds or entities is enough', () => {
      ok({ enabled: true, options: { countries: ['ES'] } });
      ok({ enabled: true, options: { kinds: ['TAX_ID'] } });
      ok({ enabled: true, options: { entities: ['ES_NIF'] } });
    });

    it('accepts an explicit block on an entity that is not excluded', () => {
      ok({ enabled: true, options: { kinds: ['TAX_ID'], except: ['ES_CIF'], policy: { entities: { ES_NIF: 'block' } } } });
    });

    it('emits no warnings', () => {
      expect(ok({ enabled: true, options: { countries: ['ES'] } }).warnings).toEqual([]);
    });

    it('is independent from the other section', () => {
      const other = key === 'dlp_prompt' ? 'dlp_file' : 'dlp_prompt';
      const result = parsePolicies({ version: 1, [key]: { enabled: true, options: { countries: ['ES'] } } });
      expect(result.ok && other in result.value).toBe(false);
    });
  });

  describe('canonicalization', () => {
    it('sorts and deduplicates the sets', () => {
      const { section } = ok({ enabled: true, options: { countries: ['GLOBAL', 'ES', 'ES'], except: ['UUID', 'DATE_TIME'] } });
      expect(section?.options.countries).toEqual(['ES', 'GLOBAL']);
      expect(section?.options.except).toEqual(['DATE_TIME', 'UUID']);
    });

    it('sorts the keys of the action maps', () => {
      const { section } = ok({
        enabled: true,
        options: { countries: ['ES'], policy: { entities: { ES_NIF: 'keep', ES_CIF: 'block' } } },
      });
      expect(JSON.stringify(section?.options.policy.entities)).toBe('{"ES_CIF":"block","ES_NIF":"keep"}');
    });
  });

  describe('meta', () => {
    it('is absent unless given', () => {
      expect('meta' in (ok({}).section ?? {})).toBe(false);
    });

    it('keeps any JSON object as-is', () => {
      const meta = { owner: 'data-team', ticket: 'AX-123', tags: ['pii', null], nested: { reviewed: true, n: 1.5 } };
      expect(ok({ meta }).section?.meta).toEqual(meta);
    });

    it('rejects anything that is not an object', () => {
      expect(codes({ meta: null })).toEqual([`${key}.meta:invalid_type`]);
      expect(codes({ meta: 'note' })).toEqual([`${key}.meta:invalid_type`]);
      expect(codes({ meta: ['a'] })).toEqual([`${key}.meta:invalid_type`]);
    });

    it('rejects values that are not JSON, at any depth', () => {
      expect(codes({ meta: { when: new Date() } })).toEqual([`${key}.meta.when:invalid_union`]);
      // zod reports a union failure on the nearest branch, so the path stops at `nested`.
      expect(codes({ meta: { nested: { fn: () => 1 } } })).toEqual([`${key}.meta.nested:invalid_union`]);
    });
  });

  describe('cross-field rules', () => {
    it('enabled without a selection', () => {
      expect(codes({ enabled: true })).toEqual([`${key}.options:dlp.selection_required`]);
    });

    it('enabled with only except or actions still has no selection', () => {
      expect(codes({ enabled: true, options: { except: ['UUID'], policy: { kinds: { TAX_ID: 'block' } } } })).toEqual([
        `${key}.options:dlp.selection_required`,
      ]);
    });

    it('an excluded entity cannot be block', () => {
      expect(codes({ options: { except: ['DATE_TIME', 'ES_NIF'], policy: { entities: { ES_NIF: 'block' } } } })).toEqual([
        `${key}.options.except.1:dlp.block_excepted`,
      ]);
    });
  });

  describe('shape', () => {
    it('rejects empty sets', () => {
      expect(codes({ options: { countries: [] } })).toEqual([`${key}.options.countries:too_small`]);
    });

    it('rejects malformed names', () => {
      expect(codes({ options: { entities: ['es_nif'] } })).toEqual([`${key}.options.entities.0:invalid_format`]);
    });

    it('rejects malformed countries', () => {
      expect(codes({ options: { countries: ['ESP'] } })).toEqual([`${key}.options.countries.0:invalid_format`]);
    });

    it('rejects unknown actions', () => {
      expect(codes({ options: { policy: { default: 'anonymize' } } })).toEqual([`${key}.options.policy.default:invalid_value`]);
    });

    it('rejects malformed keys in the action maps', () => {
      expect(codes({ options: { policy: { kinds: { 'tax-id': 'mask' } } } })[0]).toMatch(new RegExp(`^${key}\\.options\\.policy\\.kinds`));
    });

    it('rejects unknown keys, including the old targets field', () => {
      expect(codes({ rules: [] })).toEqual([`${key}:unrecognized_keys`]);
      expect(codes({ targets: ['prompt'] })).toEqual([`${key}:unrecognized_keys`]);
      expect(codes({ options: { threshold: 0.5 } })).toEqual([`${key}.options:unrecognized_keys`]);
    });
  });
});
