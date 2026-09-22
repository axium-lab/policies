import { describe, expect, it } from 'vitest';

import { domainContains, parseDomain } from '../../src/internal/domain.js';

const canonical = (raw: string): string => {
  const result = parseDomain(raw);
  if (!result.ok) throw new Error(`esperaba que "${raw}" fuese válido, dio ${result.code}`);
  return result.matcher.canonical;
};

const rejection = (raw: string): string => {
  const result = parseDomain(raw);
  if (result.ok) throw new Error(`esperaba que "${raw}" fuese inválido, dio ${result.matcher.canonical}`);
  return result.code;
};

const matcher = (raw: string) => {
  const result = parseDomain(raw);
  if (!result.ok) throw new Error(raw);
  return result.matcher;
};

describe('parseDomain — canonicalización', () => {
  it('normaliza mayúsculas y el punto final', () => {
    expect(canonical('WWW.Evil.COM.')).toBe('www.evil.com');
  });

  it('convierte IDN a punycode', () => {
    expect(canonical('ejemplo-ñ.es')).toBe('xn--ejemplo--k3a.es');
    expect(canonical('*.例え.jp')).toBe('*.xn--r8jz45g.jp');
  });

  it('conserva el comodín', () => {
    expect(matcher('*.evil.com')).toEqual({ canonical: '*.evil.com', host: 'evil.com', wildcard: true });
    expect(matcher('evil.com').wildcard).toBe(false);
  });
});

describe('parseDomain — rechazos', () => {
  it('rechaza lo que no es un host a secas', () => {
    expect(rejection('https://evil.com')).toBe('invalid_format');
    expect(rejection('evil.com:8080')).toBe('invalid_format');
    expect(rejection('evil.com/path')).toBe('invalid_format');
    expect(rejection('mal_dominio.com')).toBe('invalid_format');
    expect(rejection('evil..com')).toBe('invalid_format');
  });

  it('rechaza comodines mal puestos', () => {
    expect(rejection('ev*l.com')).toBe('invalid_wildcard');
    expect(rejection('*.*.evil.com')).toBe('invalid_wildcard');
  });

  it('rechaza lo que no es un nombre', () => {
    expect(rejection('localhost')).toBe('needs_tld');
    expect(rejection('1.2.3.4')).toBe('looks_like_ip');
  });
});

describe('domainContains', () => {
  it('el comodín cubre subdominios pero no el dominio desnudo', () => {
    expect(domainContains(matcher('*.evil.com'), matcher('a.evil.com'))).toBe(true);
    expect(domainContains(matcher('*.evil.com'), matcher('a.b.evil.com'))).toBe(true);
    expect(domainContains(matcher('*.evil.com'), matcher('evil.com'))).toBe(false);
  });

  it('un comodín cubre otro más estrecho', () => {
    expect(domainContains(matcher('*.evil.com'), matcher('*.a.evil.com'))).toBe(true);
    expect(domainContains(matcher('*.a.evil.com'), matcher('*.evil.com'))).toBe(false);
  });

  it('un dominio exacto solo se cubre a sí mismo', () => {
    expect(domainContains(matcher('evil.com'), matcher('evil.com'))).toBe(true);
    expect(domainContains(matcher('evil.com'), matcher('a.evil.com'))).toBe(false);
    expect(domainContains(matcher('evil.com'), matcher('*.evil.com'))).toBe(false);
  });

  it('no confunde un sufijo con un subdominio', () => {
    expect(domainContains(matcher('*.evil.com'), matcher('notevil.com'))).toBe(false);
  });
});
