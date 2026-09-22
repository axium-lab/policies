/**
 * IPv4 / IPv6 parsing and canonicalization (RFC 5952), with no runtime dependencies.
 *
 * Anything this module cannot canonicalize unambiguously is rejected instead of
 * accepted approximately: a firewall rule that silently fails to match is a hole,
 * not a cosmetic defect. That is why zone IDs (`fe80::1%eth0`), octets with leading
 * zeros (`010.0.0.1`) and IPv4-mapped IPv6 (`::ffff:10.0.0.1`) are errors here.
 */

export type IpVersion = 4 | 6;

export type CidrErrorCode =
  | 'invalid_format'
  | 'prefix_out_of_range'
  | 'zone_id_not_supported'
  | 'ipv4_mapped_not_supported';

export interface CidrRange {
  /** Network address with host bits zeroed, always with an explicit prefix. */
  canonical: string;
  version: IpVersion;
  prefix: number;
  start: bigint;
  end: bigint;
}

export type CidrResult = { ok: true; range: CidrRange } | { ok: false; code: CidrErrorCode };

type IntResult = { ok: true; value: bigint } | { ok: false; code: CidrErrorCode };

function parseIpv4(text: string): IntResult {
  const parts = text.split('.');
  if (parts.length !== 4) return { ok: false, code: 'invalid_format' };

  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return { ok: false, code: 'invalid_format' };
    // `010.0.0.1` is read as octal by some resolvers and as decimal by others.
    if (part.length > 1 && part.startsWith('0')) return { ok: false, code: 'invalid_format' };
    const octet = Number(part);
    if (octet > 255) return { ok: false, code: 'invalid_format' };
    value = (value << 8n) | BigInt(octet);
  }
  return { ok: true, value };
}

function parseIpv6(text: string): IntResult {
  if (text.includes('%')) return { ok: false, code: 'zone_id_not_supported' };
  // `::ffff:10.0.0.1` is the same host as `10.0.0.1`, but a v6 rule never matches a
  // v4 request. Rejecting it forces the unambiguous form.
  if (text.includes('.')) return { ok: false, code: 'ipv4_mapped_not_supported' };

  const halves = text.split('::');
  if (halves.length > 2) return { ok: false, code: 'invalid_format' };

  const toGroups = (part: string): string[] | null => {
    if (part === '') return [];
    const groups = part.split(':');
    for (const group of groups) if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    return groups;
  };

  const head = toGroups(halves[0] ?? '');
  const tail = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  if (head === null || tail === null) return { ok: false, code: 'invalid_format' };

  const provided = head.length + tail.length;
  if (halves.length === 2) {
    // `::` has to stand for at least one group.
    if (provided > 7) return { ok: false, code: 'invalid_format' };
  } else if (provided !== 8) {
    return { ok: false, code: 'invalid_format' };
  }

  const groups = [...head, ...Array<string>(8 - provided).fill('0'), ...tail];
  let value = 0n;
  for (const group of groups) value = (value << 16n) | BigInt(parseInt(group, 16));
  return { ok: true, value };
}

function formatIpv4(value: bigint): string {
  return [24n, 16n, 8n, 0n].map((shift) => ((value >> shift) & 0xffn).toString()).join('.');
}

function formatIpv6(value: bigint): string {
  const groups: string[] = [];
  for (let index = 7; index >= 0; index -= 1) {
    groups.push(((value >> BigInt(index * 16)) & 0xffffn).toString(16));
  }

  // RFC 5952: compress the longest run of zero groups, leftmost on a tie, and never
  // compress a run of one.
  let best = { start: -1, length: 0 };
  let run = { start: -1, length: 0 };
  groups.forEach((group, index) => {
    if (group !== '0') {
      run = { start: -1, length: 0 };
      return;
    }
    if (run.start === -1) run = { start: index, length: 0 };
    run.length += 1;
    if (run.length > best.length) best = { ...run };
  });

  if (best.length < 2) return groups.join(':');
  return `${groups.slice(0, best.start).join(':')}::${groups.slice(best.start + best.length).join(':')}`;
}

/**
 * Parses an IP or CIDR into its canonical range. A bare address is treated as a
 * single-host network (`/32`, `/128`) so callers only ever handle one shape.
 */
export function parseCidr(raw: string): CidrResult {
  const text = raw.trim();
  if (text === '') return { ok: false, code: 'invalid_format' };

  const slash = text.indexOf('/');
  const address = slash === -1 ? text : text.slice(0, slash);
  const prefixText = slash === -1 ? null : text.slice(slash + 1);

  const version: IpVersion = address.includes(':') ? 6 : 4;
  const width = version === 4 ? 32 : 128;

  const parsed = version === 4 ? parseIpv4(address) : parseIpv6(address);
  if (!parsed.ok) return parsed;

  let prefix = width;
  if (prefixText !== null) {
    if (!/^\d{1,3}$/.test(prefixText)) return { ok: false, code: 'invalid_format' };
    if (prefixText.length > 1 && prefixText.startsWith('0')) return { ok: false, code: 'invalid_format' };
    prefix = Number(prefixText);
    if (prefix > width) return { ok: false, code: 'prefix_out_of_range' };
  }

  const bits = BigInt(width);
  const hostMask = (1n << (bits - BigInt(prefix))) - 1n;
  const start = parsed.value & ~hostMask & ((1n << bits) - 1n);
  const end = start | hostMask;

  return {
    ok: true,
    range: {
      canonical: `${version === 4 ? formatIpv4(start) : formatIpv6(start)}/${prefix}`,
      version,
      prefix,
      start,
      end,
    },
  };
}

export function rangeContains(outer: CidrRange, inner: CidrRange): boolean {
  return outer.version === inner.version && outer.start <= inner.start && outer.end >= inner.end;
}

export function rangesOverlap(a: CidrRange, b: CidrRange): boolean {
  return a.version === b.version && a.start <= b.end && b.start <= a.end;
}
