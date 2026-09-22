import { describe, expect, it } from 'vitest';

import { parsePolicies } from '../../src/parse.js';

const parse = (capture: unknown) => parsePolicies({ version: 1, capture });

const ok = (capture: unknown) => {
  const result = parse(capture);
  if (!result.ok) throw new Error(`esperaba válido: ${JSON.stringify(result.errors)}`);
  return result;
};

const codes = (capture: unknown): string[] => {
  const result = parse(capture);
  if (result.ok) throw new Error('esperaba inválido');
  return result.errors.map((e) => `${e.field}:${e.code}`);
};

describe('capture', () => {
  it('sin configurar, la clave no existe', () => {
    const result = parsePolicies({ version: 1 });
    expect(result.ok && 'capture' in result.value).toBe(false);
  });

  it('configurado vacío, se materializa apagado', () => {
    expect(ok({}).value.capture).toEqual({ samples: false });
  });

  it('acepta los dos valores', () => {
    expect(ok({ samples: true }).value.capture?.samples).toBe(true);
    expect(ok({ samples: false }).value.capture?.samples).toBe(false);
  });

  it('no genera warnings', () => {
    expect(ok({ samples: true }).warnings).toEqual([]);
  });

  it('rechaza un valor que no sea booleano', () => {
    expect(codes({ samples: 'sí' })).toEqual(['capture.samples:invalid_type']);
  });

  it('rechaza claves desconocidas', () => {
    expect(codes({ samples: true, rate: 0.5 })).toEqual(['capture:unrecognized_keys']);
  });
});
