import { describe, expect, it } from 'vitest';

import { policy } from '../src/builder.js';
import { policiesJsonSchema, POLICY_VERSION } from '../src/document.js';
import { PolicyValidationError } from '../src/errors.js';
import { assertPolicies, parsePolicies, resolvePolicies } from '../src/parse.js';

const ok = (input: unknown) => {
  const result = parsePolicies(input);
  if (!result.ok) throw new Error(`esperaba válido: ${JSON.stringify(result.errors)}`);
  return result.value;
};

describe('documento raíz', () => {
  it('una fila vacía es válida y solo gana la versión', () => {
    expect(ok({})).toEqual({ version: POLICY_VERSION });
  });

  it('una sección no configurada no aparece en el documento', () => {
    expect('firewall' in ok({ version: 1 })).toBe(false);
  });

  it('una sección configurada se materializa entera', () => {
    expect(ok({ firewall: {} })).toEqual({
      version: 1,
      firewall: {
        inbound: { default_action: 'allow', rules: [] },
        outbound: { default_action: 'allow', rules: [] },
      },
    });
  });

  it('rechaza una versión que no sabe leer', () => {
    const result = parsePolicies({ version: 99 });
    expect(result.ok).toBe(false);
  });

  it('preserva secciones desconocidas escritas por una versión más nueva', () => {
    const value = ok({ version: 1, quantum: { enabled: true } });
    expect(value).toHaveProperty('quantum', { enabled: true });
  });

  it('el resultado es serializable a JSONB', () => {
    const value = ok({ firewall: { inbound: { rules: [{ action: 'allow', type: 'cidr', value: '10.0.0.1/8' }] } } });
    expect(JSON.parse(JSON.stringify(value))).toEqual(value);
  });
});

describe('assert y resolve', () => {
  it('assertPolicies lanza con las issues dentro', () => {
    try {
      assertPolicies({ firewall: { inbound: { rules: [{ action: 'allow', type: 'cidr', value: 'nope' }] } } });
      throw new Error('debería haber lanzado');
    } catch (error) {
      expect(error).toBeInstanceOf(PolicyValidationError);
      expect((error as PolicyValidationError).issues[0]?.field).toBe('firewall.inbound.rules.0.value');
    }
  });

  it('resolvePolicies rellena todas las secciones que parse deja fuera', () => {
    expect(resolvePolicies({})).toEqual({
      version: 1,
      cache: { mode: 'off', ttl_seconds: null, min_similarity: null },
      capture: { samples: false },
      dlp: { enabled: false, options: { policy: { default: 'mask', kinds: {}, entities: {} } } },
      firewall: {
        inbound: { default_action: 'allow', rules: [] },
        outbound: { default_action: 'allow', rules: [] },
      },
    });
  });

  it('resolve rellena una sección sin tocar la otra', () => {
    const resolved = resolvePolicies({ cache: { mode: 'strict', ttl_seconds: 60 } });
    expect(resolved.cache.ttl_seconds).toBe(60);
    expect(resolved.firewall.inbound.rules).toEqual([]);
  });

  it('resolve no pisa lo que sí estaba configurado', () => {
    const resolved = resolvePolicies({ firewall: { inbound: { default_action: 'deny' } } });
    expect(resolved.firewall.inbound.default_action).toBe('deny');
  });
});

describe('builder', () => {
  it('compone y valida', () => {
    const value = policy()
      .set('firewall', { inbound: { default_action: 'deny', rules: [{ action: 'allow', type: 'cidr', value: '10.0.0.1/8' }] } })
      .build();

    expect(value.firewall?.inbound.rules[0]?.value).toBe('10.0.0.0/8');
  });

  it('es inmutable', () => {
    const base = policy();
    const withFirewall = base.set('firewall', {});
    expect('firewall' in base.build()).toBe(false);
    expect('firewall' in withFirewall.build()).toBe(true);
  });

  it('remove borra la sección', () => {
    expect('firewall' in policy().set('firewall', {}).remove('firewall').build()).toBe(false);
  });

  it('safeBuild devuelve los errores en vez de lanzar', () => {
    const result = policy()
      .set('firewall', { outbound: { rules: [{ action: 'deny', type: 'domain', value: 'https://x.com' }] } })
      .safeBuild();

    expect(result.ok).toBe(false);
  });
});

describe('json schema', () => {
  it('se genera desde el lado de entrada, sin romper con los transforms', () => {
    const schema = policiesJsonSchema();
    expect(schema).toHaveProperty('properties.firewall');
  });
});
