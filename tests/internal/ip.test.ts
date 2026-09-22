import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { parseCidr, rangeContains, rangesOverlap } from '../../src/internal/ip.js';

const canonical = (raw: string): string => {
  const result = parseCidr(raw);
  if (!result.ok) throw new Error(`esperaba que "${raw}" fuese válido, dio ${result.code}`);
  return result.range.canonical;
};

const rejection = (raw: string): string => {
  const result = parseCidr(raw);
  if (result.ok) throw new Error(`esperaba que "${raw}" fuese inválido, dio ${result.range.canonical}`);
  return result.code;
};

describe('parseCidr — canonicalización', () => {
  it('pone a cero los bits de host', () => {
    expect(canonical('10.0.0.1/8')).toBe('10.0.0.0/8');
    expect(canonical('192.168.1.130/24')).toBe('192.168.1.0/24');
    expect(canonical('2001:db8::1/32')).toBe('2001:db8::/32');
  });

  it('trata una IP suelta como red de un solo host', () => {
    expect(canonical('192.168.1.7')).toBe('192.168.1.7/32');
    expect(canonical('2001:db8::1')).toBe('2001:db8::1/128');
  });

  it('normaliza IPv6 según RFC 5952', () => {
    expect(canonical('2001:0DB8:0000:0000:0000:0000:0000:0001')).toBe('2001:db8::1/128');
    expect(canonical('::')).toBe('::/128');
    expect(canonical('::1')).toBe('::1/128');
    expect(canonical('0.0.0.0/0')).toBe('0.0.0.0/0');
    expect(canonical('::/0')).toBe('::/0');
  });

  it('no comprime una única racha de un grupo', () => {
    // 2001:db8:0:1:1:1:1:1 tiene un solo grupo a cero: "::" sería ilegal ahí.
    expect(canonical('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1/128');
  });

  it('es idempotente', () => {
    for (const raw of ['10.0.0.1/8', '2001:0DB8::1/32', '192.168.1.7', '::']) {
      expect(canonical(canonical(raw))).toBe(canonical(raw));
    }
  });
});

describe('parseCidr — rechazos', () => {
  it('rechaza lo que no canonicalizaría sin ambigüedad', () => {
    expect(rejection('010.0.0.1')).toBe('invalid_format');
    expect(rejection('fe80::1%eth0')).toBe('zone_id_not_supported');
    expect(rejection('::ffff:10.0.0.1')).toBe('ipv4_mapped_not_supported');
  });

  it('rechaza prefijos fuera de rango', () => {
    expect(rejection('10.0.0.0/33')).toBe('prefix_out_of_range');
    expect(rejection('2001:db8::/129')).toBe('prefix_out_of_range');
    expect(rejection('10.0.0.0/08')).toBe('invalid_format');
  });

  it('rechaza formas malformadas', () => {
    for (const raw of ['', '10.0.0', '256.0.0.1', '10.0.0.0/', '1::2::3', 'gggg::', ':1::']) {
      expect(rejection(raw)).toBe('invalid_format');
    }
  });
});

describe('parseCidr — coincide con los validadores de zod', () => {
  // zod valida la forma; nosotros además canonicalizamos. Donde zod acepta algo,
  // nosotros solo podemos discrepar por un rechazo deliberado y documentado.
  const deliberate = new Set(['::ffff:10.0.0.1']);

  const cases = [
    '10.0.0.0/8', '10.0.0.1/8', '0.0.0.0/0', '255.255.255.255/32', '192.168.1.7',
    '2001:db8::/32', '2001:db8::1', '::', '::1', '::/0', '::ffff:10.0.0.1',
    '010.0.0.1', '256.0.0.1', '10.0.0.0/33', '2001:db8::/129', 'fe80::1%eth0', 'gggg::', '10.0.0',
  ];

  it.each(cases)('%s', (raw) => {
    const zodAccepts = [z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()].some((s) => s.safeParse(raw).success);
    const weAccept = parseCidr(raw).ok;
    expect(weAccept).toBe(deliberate.has(raw) ? false : zodAccepts);
  });
});

describe('contención y solape', () => {
  const range = (raw: string) => {
    const result = parseCidr(raw);
    if (!result.ok) throw new Error(raw);
    return result.range;
  };

  it('detecta contención', () => {
    expect(rangeContains(range('10.0.0.0/8'), range('10.1.2.0/24'))).toBe(true);
    expect(rangeContains(range('10.1.2.0/24'), range('10.0.0.0/8'))).toBe(false);
    expect(rangeContains(range('0.0.0.0/0'), range('192.168.1.7'))).toBe(true);
  });

  it('no cruza familias de IP', () => {
    expect(rangeContains(range('::/0'), range('10.0.0.1'))).toBe(false);
    expect(rangesOverlap(range('::/0'), range('0.0.0.0/0'))).toBe(false);
  });

  it('detecta solape parcial', () => {
    expect(rangesOverlap(range('10.0.0.0/8'), range('10.1.0.0/16'))).toBe(true);
    expect(rangesOverlap(range('10.0.0.0/8'), range('11.0.0.0/8'))).toBe(false);
  });
});
