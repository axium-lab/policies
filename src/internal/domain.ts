/**
 * Domain name parsing and canonicalization, with no runtime dependencies.
 *
 * IDN is folded to punycode through the platform `URL` global, which exists in
 * browsers, Node and Bun alike, so the package stays isomorphic without pulling a
 * punycode library in.
 */

export type DomainErrorCode =
  | 'invalid_format'
  | 'invalid_wildcard'
  | 'too_long'
  | 'looks_like_ip'
  | 'needs_tld';

export interface DomainMatcher {
  /** Lowercase, punycode, no trailing dot, wildcard prefix preserved. */
  canonical: string;
  /** The canonical form without the `*.` prefix. */
  host: string;
  wildcard: boolean;
}

export type DomainResult = { ok: true; matcher: DomainMatcher } | { ok: false; code: DomainErrorCode };

const LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
/** Anything that belongs to a URL rather than to a hostname. */
const FORBIDDEN = /[\s/\\:?#@[\]_]/;

function toPunycode(host: string): string | null {
  try {
    const { hostname } = new URL(`http://${host}`);
    return hostname === '' ? null : hostname;
  } catch {
    return null;
  }
}

/**
 * Parses a domain pattern. A leading `*.` matches any subdomain but not the bare
 * domain itself: `*.evil.com` covers `a.evil.com`, not `evil.com`.
 */
export function parseDomain(raw: string): DomainResult {
  let text = raw.trim().toLowerCase();
  if (text === '') return { ok: false, code: 'invalid_format' };

  const wildcard = text.startsWith('*.');
  if (wildcard) text = text.slice(2);
  if (text.includes('*')) return { ok: false, code: 'invalid_wildcard' };

  // A single trailing dot is the legal absolute form; anything beyond that is a typo.
  if (text.endsWith('.')) text = text.slice(0, -1);
  if (text === '' || text.endsWith('.')) return { ok: false, code: 'invalid_format' };
  if (FORBIDDEN.test(text)) return { ok: false, code: 'invalid_format' };

  const host = toPunycode(text);
  if (host === null) return { ok: false, code: 'invalid_format' };
  if (host.length > 253) return { ok: false, code: 'too_long' };

  const labels = host.split('.');
  if (labels.length < 2) return { ok: false, code: 'needs_tld' };
  for (const label of labels) {
    if (!LABEL.test(label)) return { ok: false, code: 'invalid_format' };
  }

  // `1.2.3.4` is a valid label sequence but means an address, not a name.
  const tld = labels[labels.length - 1] ?? '';
  if (/^\d+$/.test(tld)) return { ok: false, code: 'looks_like_ip' };

  return { ok: true, matcher: { canonical: wildcard ? `*.${host}` : host, host, wildcard } };
}

/** True when every name matched by `inner` is also matched by `outer`. */
export function domainContains(outer: DomainMatcher, inner: DomainMatcher): boolean {
  if (!outer.wildcard) return !inner.wildcard && inner.host === outer.host;
  if (inner.host === outer.host) return inner.wildcard;
  return inner.host.endsWith(`.${outer.host}`);
}

export function domainsOverlap(a: DomainMatcher, b: DomainMatcher): boolean {
  return domainContains(a, b) || domainContains(b, a);
}
