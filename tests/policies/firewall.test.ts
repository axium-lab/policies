import { describe, expect, it } from 'vitest';

import { parsePolicies } from '../../src/parse.js';
import { FIREWALL_MAX_RULES } from '../../src/policies/firewall.js';

const cidr = (action: 'allow' | 'deny', value: string) => ({ action, type: 'cidr' as const, value });
const domain = (action: 'allow' | 'deny', value: string) => ({ action, type: 'domain' as const, value });

const parse = (firewall: unknown) => parsePolicies({ version: 1, firewall });

const ok = (firewall: unknown) => {
  const result = parse(firewall);
  if (!result.ok) throw new Error(`esperaba válido: ${JSON.stringify(result.errors)}`);
  return result;
};

const failure = (firewall: unknown) => {
  const result = parse(firewall);
  if (result.ok) throw new Error('esperaba inválido');
  return result.errors;
};

describe('firewall — canonicalización', () => {
  it('canonicaliza los valores de las reglas', () => {
    const result = ok({
      inbound: { default_action: 'deny', rules: [cidr('allow', '10.0.0.1/8'), cidr('allow', '192.168.1.7')] },
      outbound: { rules: [domain('deny', '*.Evil.COM.')] },
    });

    expect(result.value.firewall?.inbound.rules.map((r) => r.value)).toEqual(['10.0.0.0/8', '192.168.1.7/32']);
    expect(result.value.firewall?.outbound.rules.map((r) => r.value)).toEqual(['*.evil.com']);
  });

  it('no reordena las reglas: el orden es semántico', () => {
    const values = ['10.13.37.0/24', '10.0.0.0/8', '10.1.0.0/16'];
    const result = ok({ inbound: { default_action: 'deny', rules: values.map((v) => cidr('allow', v)) } });
    expect(result.value.firewall?.inbound.rules.map((r) => r.value)).toEqual(values);
  });
});

describe('firewall — errores', () => {
  it('apunta al campo exacto con un código estable', () => {
    const errors = failure({ inbound: { rules: [cidr('allow', '10.0.0.0/8'), cidr('allow', '10.0.0.0/33')] } });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.field).toBe('firewall.inbound.rules.1.value');
    expect(errors[0]?.path).toEqual(['firewall', 'inbound', 'rules', 1, 'value']);
    expect(errors[0]?.code).toBe('firewall.prefix_out_of_range');
  });

  it('acumula varios errores en una sola pasada', () => {
    const errors = failure({ inbound: { rules: [cidr('allow', 'nope'), cidr('allow', '010.0.0.1')] } });
    expect(errors.map((e) => e.field)).toEqual([
      'firewall.inbound.rules.0.value',
      'firewall.inbound.rules.1.value',
    ]);
  });

  it('inbound no admite reglas de dominio', () => {
    const errors = failure({ inbound: { rules: [domain('deny', 'evil.com')] } });
    expect(errors[0]?.field).toBe('firewall.inbound.rules.0.type');
  });

  it('outbound admite dominios y CIDR', () => {
    const result = ok({ outbound: { rules: [domain('deny', 'evil.com'), cidr('deny', '10.0.0.0/8')] } });
    expect(result.value.firewall?.outbound.rules).toHaveLength(2);
  });

  it('rechaza claves desconocidas dentro de la sección', () => {
    expect(failure({ inbound: { rules: [] }, typo: true })[0]?.field).toBe('firewall');
  });

  it('rechaza una IP declarada como dominio', () => {
    expect(failure({ outbound: { rules: [domain('deny', '1.2.3.4')] } })[0]?.code).toBe('firewall.looks_like_ip');
  });

  it(`rechaza más de ${FIREWALL_MAX_RULES} reglas`, () => {
    const rules = Array.from({ length: FIREWALL_MAX_RULES + 1 }, (_, i) => cidr('allow', `10.${i >> 8}.${i % 256}.0/24`));
    expect(failure({ inbound: { rules } })[0]?.field).toBe('firewall.inbound.rules');
  });
});

describe('firewall — warnings (no bloquean)', () => {
  const warningsOf = (firewall: unknown) => ok(firewall).warnings.map((w) => `${w.field}:${w.code}`);

  it('detecta duplicados tras canonicalizar', () => {
    expect(warningsOf({ inbound: { default_action: 'deny', rules: [cidr('allow', '10.0.0.1/8'), cidr('allow', '10.0.0.0/8')] } }))
      .toContain('firewall.inbound.rules.1:firewall.duplicate_rule');
  });

  it('detecta reglas que nunca se alcanzan', () => {
    expect(warningsOf({ inbound: { default_action: 'deny', rules: [cidr('allow', '10.0.0.0/8'), cidr('deny', '10.1.2.0/24')] } }))
      .toContain('firewall.inbound.rules.1:firewall.shadowed_rule');
  });

  it('detecta una regla que repite el default_action sin tapar a nadie', () => {
    expect(warningsOf({ inbound: { default_action: 'allow', rules: [cidr('allow', '10.0.0.0/8')] } }))
      .toContain('firewall.inbound.rules.0:firewall.redundant_rule');
  });

  it('no la marca redundante si protege a una regla posterior', () => {
    // allow 10.1.0.0/16 coincide con el default, pero quitarla dejaría que
    // el deny siguiente atrapase ese rango. No es redundante.
    expect(warningsOf({
      inbound: { default_action: 'allow', rules: [cidr('allow', '10.1.0.0/16'), cidr('deny', '10.0.0.0/8')] },
    })).toEqual([]);
  });

  it('avisa de una regla que bloquea todo', () => {
    expect(warningsOf({ inbound: { default_action: 'allow', rules: [cidr('deny', '0.0.0.0/0')] } }))
      .toContain('firewall.inbound.rules.0:firewall.blocks_all_traffic');
  });

  it('una configuración sensata no genera ningún warning', () => {
    expect(warningsOf({
      inbound: { default_action: 'deny', rules: [cidr('deny', '10.13.37.0/24'), cidr('allow', '10.0.0.0/8')] },
      outbound: { default_action: 'allow', rules: [domain('deny', '*.evil.com')] },
    })).toEqual([]);
  });
});
