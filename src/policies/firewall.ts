import { z } from 'zod';

import { issue, type PolicyIssue } from '../errors.js';
import { domainContains, domainsOverlap, parseDomain, type DomainMatcher } from '../internal/domain.js';
import { parseCidr, rangeContains, rangesOverlap, type CidrRange } from '../internal/ip.js';
import type { PolicySection } from '../registry.js';

export const FIREWALL_ACTIONS = ['allow', 'deny'] as const;
export const FIREWALL_RULE_TYPES = ['cidr', 'domain'] as const;
/** Guardrail against dumping a routing table into an unindexed JSONB column. */
export const FIREWALL_MAX_RULES = 256;

const CIDR_MESSAGES: Record<string, string> = {
  invalid_format: 'No es una IP ni un CIDR válido (ej: 10.0.0.0/8, 192.168.1.7, 2001:db8::/32)',
  prefix_out_of_range: 'Prefijo fuera de rango (máximo /32 en IPv4 y /128 en IPv6)',
  zone_id_not_supported: 'Los zone ID (%eth0) no están soportados en una regla de firewall',
  ipv4_mapped_not_supported: 'Usa la notación IPv4 (10.0.0.1/32) en lugar de ::ffff:10.0.0.1',
};

const DOMAIN_MESSAGES: Record<string, string> = {
  invalid_format: 'No es un dominio válido: escribe solo el host, sin esquema, puerto ni ruta',
  invalid_wildcard: 'El comodín solo se admite como prefijo y una sola vez (ej: *.evil.com)',
  too_long: 'El dominio supera los 253 caracteres',
  looks_like_ip: 'Esto es una dirección IP: usa una regla de tipo "cidr"',
  needs_tld: 'Falta el dominio de primer nivel (ej: evil.com, no evil)',
};

const action = z.enum(FIREWALL_ACTIONS);

const cidrValue = z.string().transform((raw, ctx) => {
  const result = parseCidr(raw);
  if (!result.ok) {
    ctx.addIssue({
      code: 'custom',
      message: CIDR_MESSAGES[result.code] ?? CIDR_MESSAGES['invalid_format'] ?? '',
      params: { code: `firewall.${result.code}` },
    });
    return z.NEVER;
  }
  return result.range.canonical;
});

const domainValue = z.string().transform((raw, ctx) => {
  const result = parseDomain(raw);
  if (!result.ok) {
    ctx.addIssue({
      code: 'custom',
      message: DOMAIN_MESSAGES[result.code] ?? DOMAIN_MESSAGES['invalid_format'] ?? '',
      params: { code: `firewall.${result.code}` },
    });
    return z.NEVER;
  }
  return result.matcher.canonical;
});

const cidrRule = z.strictObject({ action, type: z.literal('cidr'), value: cidrValue });
const domainRule = z.strictObject({ action, type: z.literal('domain'), value: domainValue });

const rulesOf = <T extends z.ZodType>(rule: T) =>
  z
    .array(rule)
    .max(FIREWALL_MAX_RULES, { error: `Máximo ${FIREWALL_MAX_RULES} reglas por dirección` })
    .default([]);

/**
 * Inbound only accepts CIDR rules: of an incoming request you know the address,
 * not a name. Outbound accepts both, since a destination has both.
 */
const inbound = z.strictObject({
  default_action: action.default('allow'),
  rules: rulesOf(cidrRule),
});

const outbound = z.strictObject({
  default_action: action.default('allow'),
  rules: rulesOf(z.discriminatedUnion('type', [cidrRule, domainRule])),
});

/**
 * `prefault` rather than `default`: a plain default is inserted as-is, so `{}` would
 * survive unparsed and the direction would come out with no fields at all.
 */
const schema = z.strictObject({
  inbound: inbound.prefault({}),
  outbound: outbound.prefault({}),
});

export type FirewallPolicy = z.infer<typeof schema>;
export type FirewallRule = FirewallPolicy['outbound']['rules'][number];

type Matcher = { kind: 'cidr'; range: CidrRange } | { kind: 'domain'; matcher: DomainMatcher };

function toMatcher(rule: FirewallRule): Matcher | null {
  if (rule.type === 'cidr') {
    const result = parseCidr(rule.value);
    return result.ok ? { kind: 'cidr', range: result.range } : null;
  }
  const result = parseDomain(rule.value);
  return result.ok ? { kind: 'domain', matcher: result.matcher } : null;
}

function contains(outer: Matcher, inner: Matcher): boolean {
  if (outer.kind === 'cidr' && inner.kind === 'cidr') return rangeContains(outer.range, inner.range);
  if (outer.kind === 'domain' && inner.kind === 'domain') return domainContains(outer.matcher, inner.matcher);
  return false;
}

function overlaps(a: Matcher, b: Matcher): boolean {
  if (a.kind === 'cidr' && b.kind === 'cidr') return rangesOverlap(a.range, b.range);
  if (a.kind === 'domain' && b.kind === 'domain') return domainsOverlap(a.matcher, b.matcher);
  return false;
}

/**
 * Non-blocking findings. None of these make the document invalid: they flag rules
 * that do not do what whoever wrote them probably expected.
 */
function lintDirection(
  direction: { default_action: 'allow' | 'deny'; rules: readonly FirewallRule[] },
  path: (string | number)[],
): PolicyIssue[] {
  const found: PolicyIssue[] = [];
  const matchers = direction.rules.map(toMatcher);

  direction.rules.forEach((rule, index) => {
    const current = matchers[index];
    if (!current) return;
    const at = [...path, 'rules', index];
    let unreachable = false;

    for (let earlier = 0; earlier < index; earlier += 1) {
      const previous = matchers[earlier];
      if (!previous) continue;

      if (previous.kind === current.kind && rule.value === direction.rules[earlier]?.value) {
        found.push(issue(at, 'firewall.duplicate_rule', `Duplicado de la regla ${earlier} tras canonicalizar`));
        unreachable = true;
        break;
      }
      if (contains(previous, current)) {
        found.push(
          issue(
            at,
            'firewall.shadowed_rule',
            `Nunca se aplica: la regla ${earlier} (${direction.rules[earlier]?.value}) ya decide sobre este rango`,
          ),
        );
        unreachable = true;
        break;
      }
    }

    if (unreachable) return;

    // First match wins, so a rule that agrees with the default only matters when a
    // later rule would otherwise catch part of its range.
    if (rule.action === direction.default_action) {
      const shieldsSomething = matchers
        .slice(index + 1)
        .some((later) => later !== null && overlaps(current, later));
      if (!shieldsSomething) {
        found.push(
          issue(
            at,
            'firewall.redundant_rule',
            `Sin efecto: hace lo mismo que default_action ("${direction.default_action}")`,
          ),
        );
      }
    }

    if (rule.action === 'deny' && current.kind === 'cidr' && current.range.prefix === 0) {
      found.push(issue(at, 'firewall.blocks_all_traffic', 'Esta regla bloquea todo el tráfico de su familia de IP'));
    }
  });

  return found;
}

function lint(value: FirewallPolicy, path: (string | number)[]): PolicyIssue[] {
  return [
    ...lintDirection(value.inbound, [...path, 'inbound']),
    ...lintDirection(value.outbound, [...path, 'outbound']),
  ];
}

export const firewallSection = {
  key: 'firewall',
  schema,
  lint,
} as const satisfies PolicySection<'firewall', typeof schema>;
