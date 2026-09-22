import { describe, expect, it } from 'vitest';

import { parsePolicies } from '../../src/parse.js';
import { CACHE_DEFAULT_MIN_SIMILARITY, CACHE_TTL_MAX_SECONDS } from '../../src/policies/cache.js';

const parse = (cache: unknown) => parsePolicies({ version: 1, cache });

const ok = (cache: unknown) => {
  const result = parse(cache);
  if (!result.ok) throw new Error(`esperaba válido: ${JSON.stringify(result.errors)}`);
  return result;
};

const codes = (cache: unknown): string[] => {
  const result = parse(cache);
  if (result.ok) throw new Error('esperaba inválido');
  return result.errors.map((e) => `${e.field}:${e.code}`);
};

describe('cache — combinaciones válidas', () => {
  it('sin configurar, la clave no existe', () => {
    const result = parsePolicies({ version: 1 });
    expect(result.ok && 'cache' in result.value).toBe(false);
  });

  it('configurado vacío, se materializa apagado', () => {
    expect(ok({}).value.cache).toEqual({ mode: 'off', ttl_seconds: null, min_similarity: null });
  });

  it('strict con TTL', () => {
    expect(ok({ mode: 'strict', ttl_seconds: 300 }).value.cache).toEqual({
      mode: 'strict',
      ttl_seconds: 300,
      min_similarity: null,
    });
  });

  it('semantic rellena el umbral por defecto', () => {
    expect(ok({ mode: 'semantic', ttl_seconds: 300 }).value.cache).toEqual({
      mode: 'semantic',
      ttl_seconds: 300,
      min_similarity: CACHE_DEFAULT_MIN_SIMILARITY,
    });
  });

  it('semantic respeta el umbral que le pasen', () => {
    expect(ok({ mode: 'semantic', ttl_seconds: 300, min_similarity: 0.8 }).value.cache?.min_similarity).toBe(0.8);
  });

  it('acepta los extremos del TTL', () => {
    expect(ok({ mode: 'strict', ttl_seconds: 1 }).value.cache?.ttl_seconds).toBe(1);
    expect(ok({ mode: 'strict', ttl_seconds: CACHE_TTL_MAX_SECONDS }).value.cache?.ttl_seconds).toBe(
      CACHE_TTL_MAX_SECONDS,
    );
  });

  it('no genera warnings', () => {
    expect(ok({ mode: 'semantic', ttl_seconds: 300 }).warnings).toEqual([]);
  });
});

describe('cache — reglas entre campos', () => {
  it('off no admite TTL', () => {
    expect(codes({ mode: 'off', ttl_seconds: 300 })).toEqual(['cache.ttl_seconds:cache.ttl_not_allowed']);
  });

  it('off no admite umbral', () => {
    expect(codes({ mode: 'off', min_similarity: 0.9 })).toEqual([
      'cache.min_similarity:cache.similarity_not_allowed',
    ]);
  });

  it('strict exige TTL', () => {
    expect(codes({ mode: 'strict' })).toEqual(['cache.ttl_seconds:cache.ttl_required']);
  });

  it('semantic exige TTL', () => {
    expect(codes({ mode: 'semantic' })).toEqual(['cache.ttl_seconds:cache.ttl_required']);
  });

  it('strict no admite umbral', () => {
    expect(codes({ mode: 'strict', ttl_seconds: 300, min_similarity: 0.9 })).toEqual([
      'cache.min_similarity:cache.similarity_not_allowed',
    ]);
  });

  it('acumula los dos errores a la vez', () => {
    expect(codes({ mode: 'strict', min_similarity: 0.9 })).toEqual([
      'cache.ttl_seconds:cache.ttl_required',
      'cache.min_similarity:cache.similarity_not_allowed',
    ]);
  });
});

describe('cache — rangos y tipos', () => {
  it('rechaza un TTL fuera de rango', () => {
    expect(codes({ mode: 'strict', ttl_seconds: 0 })[0]).toBe('cache.ttl_seconds:too_small');
    expect(codes({ mode: 'strict', ttl_seconds: CACHE_TTL_MAX_SECONDS + 1 })[0]).toBe('cache.ttl_seconds:too_big');
  });

  it('rechaza un TTL no entero', () => {
    expect(codes({ mode: 'strict', ttl_seconds: 300.5 })[0]).toBe('cache.ttl_seconds:invalid_type');
  });

  it('rechaza un umbral fuera de 0..1', () => {
    expect(codes({ mode: 'semantic', ttl_seconds: 300, min_similarity: 1.5 })[0]).toBe('cache.min_similarity:too_big');
  });

  it('rechaza un modo que no existe', () => {
    expect(codes({ mode: 'fuzzy' })[0]).toBe('cache.mode:invalid_value');
  });

  it('rechaza claves desconocidas', () => {
    expect(codes({ typo: true })[0]).toBe('cache:unrecognized_keys');
  });
});
