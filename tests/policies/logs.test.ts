import { describe, expect, it } from 'vitest';

import { parsePolicies, resolvePolicies } from '../../src/parse.js';

const parse = (logs: unknown) => parsePolicies({ version: 1, logs });

const ok = (logs: unknown) => {
  const result = parse(logs);
  if (!result.ok) throw new Error(`esperaba válido: ${JSON.stringify(result.errors)}`);
  return result;
};

const codes = (logs: unknown): string[] => {
  const result = parse(logs);
  if (result.ok) throw new Error('esperaba inválido');
  return result.errors.map((e) => `${e.field}:${e.code}`);
};

describe('logs', () => {
  it('sin configurar, la clave no existe', () => {
    const result = parsePolicies({ version: 1 });
    expect(result.ok && 'logs' in result.value).toBe(false);
  });

  it('sin configurar, resolve da el comportamiento de siempre: registro sí, contenido no', () => {
    expect(resolvePolicies({}).logs).toEqual({ enabled: true, input: false, output: false });
  });

  it('configurado vacío, se materializa igual que sin configurar', () => {
    expect(ok({}).value.logs).toEqual({ enabled: true, input: false, output: false });
  });

  it('se puede apagar el registro', () => {
    expect(ok({ enabled: false }).value.logs).toEqual({ enabled: false, input: false, output: false });
  });

  it('input y output se activan por separado', () => {
    expect(ok({ input: true }).value.logs).toEqual({ enabled: true, input: true, output: false });
    expect(ok({ output: true }).value.logs).toEqual({ enabled: true, input: false, output: true });
  });

  it('apagado conserva la elección de input y output', () => {
    expect(ok({ enabled: false, input: true, output: true }).value.logs).toEqual({
      enabled: false,
      input: true,
      output: true,
    });
  });

  it('no genera warnings', () => {
    expect(ok({ enabled: false, input: true }).warnings).toEqual([]);
  });

  it('rechaza valores que no sean booleanos', () => {
    expect(codes({ enabled: 'no' })).toEqual(['logs.enabled:invalid_type']);
    expect(codes({ input: 1 })).toEqual(['logs.input:invalid_type']);
    expect(codes({ output: null })).toEqual(['logs.output:invalid_type']);
  });

  it('rechaza claves desconocidas', () => {
    expect(codes({ enabled: true, retention_days: 30 })).toEqual(['logs:unrecognized_keys']);
  });
});
