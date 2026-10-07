import { describe, expect, it } from 'vitest';

import { parsePolicies } from '../../src/parse.js';

const parse = (dlp: unknown) => parsePolicies({ version: 1, dlp });

const ok = (dlp: unknown) => {
  const result = parse(dlp);
  if (!result.ok) throw new Error(`expected valid: ${JSON.stringify(result.errors)}`);
  return result;
};

const codes = (dlp: unknown): string[] => {
  const result = parse(dlp);
  if (result.ok) throw new Error('expected invalid');
  return result.errors.map((e) => `${e.field}:${e.code}`);
};

const EMPTY_POLICY = { default: 'mask', kinds: {}, entities: {} };

describe('dlp — valid combinations', () => {
  it('when not configured, the key is absent', () => {
    const result = parsePolicies({ version: 1 });
    expect(result.ok && 'dlp' in result.value).toBe(false);
  });

  it('configured empty, it materializes disabled', () => {
    expect(ok({}).value.dlp).toEqual({ enabled: false, options: { policy: EMPTY_POLICY } });
  });

  it('enabled with a selection', () => {
    expect(
      ok({
        enabled: true,
        options: {
          countries: ['ES', 'GLOBAL'],
          policy: { kinds: { BANK_ACCOUNT: 'block' }, entities: { ES_NIF: 'keep' } },
        },
      }).value.dlp,
    ).toEqual({
      enabled: true,
      options: {
        countries: ['ES', 'GLOBAL'],
        policy: { default: 'mask', kinds: { BANK_ACCOUNT: 'block' }, entities: { ES_NIF: 'keep' } },
      },
    });
  });

  it('disabled keeps its configuration (paused)', () => {
    const value = ok({ enabled: false, options: { entities: ['ES_NIF'] } }).value.dlp;
    expect(value?.options.entities).toEqual(['ES_NIF']);
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
});

describe('dlp — canonicalization', () => {
  it('sorts and deduplicates the sets', () => {
    const value = ok({ enabled: true, options: { countries: ['GLOBAL', 'ES', 'ES'], except: ['UUID', 'DATE_TIME'] } })
      .value.dlp;
    expect(value?.options.countries).toEqual(['ES', 'GLOBAL']);
    expect(value?.options.except).toEqual(['DATE_TIME', 'UUID']);
  });

  it('sorts the keys of the action maps', () => {
    const value = ok({
      enabled: true,
      options: { countries: ['ES'], policy: { entities: { ES_NIF: 'keep', ES_CIF: 'block' } } },
    }).value.dlp;
    expect(JSON.stringify(value?.options.policy.entities)).toBe('{"ES_CIF":"block","ES_NIF":"keep"}');
  });
});

describe('dlp — cross-field rules', () => {
  it('enabled without a selection', () => {
    expect(codes({ enabled: true })).toEqual(['dlp.options:dlp.selection_required']);
  });

  it('enabled with only except or actions still has no selection', () => {
    expect(codes({ enabled: true, options: { except: ['UUID'], policy: { kinds: { TAX_ID: 'block' } } } })).toEqual([
      'dlp.options:dlp.selection_required',
    ]);
  });

  it('an excluded entity cannot be block', () => {
    expect(
      codes({ options: { except: ['DATE_TIME', 'ES_NIF'], policy: { entities: { ES_NIF: 'block' } } } }),
    ).toEqual(['dlp.options.except.1:dlp.block_excepted']);
  });
});

describe('dlp — shape', () => {
  it('rejects empty sets', () => {
    expect(codes({ options: { countries: [] } })).toEqual(['dlp.options.countries:too_small']);
  });

  it('rejects malformed names', () => {
    expect(codes({ options: { entities: ['es_nif'] } })).toEqual(['dlp.options.entities.0:invalid_format']);
  });

  it('rejects malformed countries', () => {
    expect(codes({ options: { countries: ['ESP'] } })).toEqual(['dlp.options.countries.0:invalid_format']);
  });

  it('rejects unknown actions', () => {
    expect(codes({ options: { policy: { default: 'anonymize' } } })).toEqual([
      'dlp.options.policy.default:invalid_value',
    ]);
  });

  it('rejects malformed keys in the action maps', () => {
    expect(codes({ options: { policy: { kinds: { 'tax-id': 'mask' } } } })[0]).toMatch(/^dlp\.options\.policy\.kinds/);
  });

  it('rejects unknown keys', () => {
    expect(codes({ rules: [] })).toEqual(['dlp:unrecognized_keys']);
    expect(codes({ options: { threshold: 0.5 } })).toEqual(['dlp.options:unrecognized_keys']);
  });
});
