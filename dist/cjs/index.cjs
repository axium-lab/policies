"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  CACHE_DEFAULT_MIN_SIMILARITY: () => CACHE_DEFAULT_MIN_SIMILARITY,
  CACHE_MODES: () => CACHE_MODES,
  CACHE_TTL_MAX_SECONDS: () => CACHE_TTL_MAX_SECONDS,
  CACHE_TTL_MIN_SECONDS: () => CACHE_TTL_MIN_SECONDS,
  FIREWALL_ACTIONS: () => FIREWALL_ACTIONS,
  FIREWALL_MAX_RULES: () => FIREWALL_MAX_RULES,
  FIREWALL_RULE_TYPES: () => FIREWALL_RULE_TYPES,
  POLICY_VERSION: () => POLICY_VERSION,
  PolicyValidationError: () => PolicyValidationError,
  SECTIONS: () => SECTIONS,
  assertPolicies: () => assertPolicies,
  parsePolicies: () => parsePolicies,
  policiesJsonSchema: () => policiesJsonSchema,
  policiesSchema: () => policiesSchema,
  policy: () => policy,
  resolvePolicies: () => resolvePolicies
});
module.exports = __toCommonJS(index_exports);

// src/document.ts
var import_zod4 = require("zod");

// src/policies/cache.ts
var import_zod = require("zod");
var CACHE_MODES = ["off", "strict", "semantic"];
var CACHE_TTL_MIN_SECONDS = 1;
var CACHE_TTL_MAX_SECONDS = 2592e3;
var CACHE_DEFAULT_MIN_SIMILARITY = 0.95;
var base = import_zod.z.strictObject({
  /**
   * `semantic` is exact match first, then a vector lookup on miss — not an
   * alternative to `strict` but a second attempt after it. Skipping the exact step
   * pays for an embedding round-trip on requests a hash lookup would have answered.
   */
  mode: import_zod.z.enum(CACHE_MODES).default("off"),
  ttl_seconds: import_zod.z.number().int().min(CACHE_TTL_MIN_SECONDS).max(CACHE_TTL_MAX_SECONDS).nullable().default(null),
  /** Only meaningful for `semantic`: how close a stored prompt has to be to count. */
  min_similarity: import_zod.z.number().min(0).max(1).nullable().default(null)
});
var validated = base.superRefine((value, ctx) => {
  if (value.mode === "off" && value.ttl_seconds !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["ttl_seconds"],
      message: "No se puede fijar un TTL con la cach\xE9 apagada",
      params: { code: "cache.ttl_not_allowed" }
    });
  }
  if (value.mode !== "off" && value.ttl_seconds === null) {
    ctx.addIssue({
      code: "custom",
      path: ["ttl_seconds"],
      message: `Obligatorio con mode "${value.mode}" (entre ${CACHE_TTL_MIN_SECONDS} y ${CACHE_TTL_MAX_SECONDS} segundos)`,
      params: { code: "cache.ttl_required" }
    });
  }
  if (value.mode !== "semantic" && value.min_similarity !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["min_similarity"],
      message: `El umbral de similitud solo aplica con mode "semantic", no con "${value.mode}"`,
      params: { code: "cache.similarity_not_allowed" }
    });
  }
});
var schema = validated.transform(
  (value) => value.mode === "semantic" && value.min_similarity === null ? { ...value, min_similarity: CACHE_DEFAULT_MIN_SIMILARITY } : value
);
var cacheSection = {
  key: "cache",
  schema
};

// src/policies/capture.ts
var import_zod2 = require("zod");
var schema2 = import_zod2.z.strictObject({
  /**
   * Named after the existing `capture_samples` column rather than something that
   * reads better, so the two stay recognisably the same setting.
   */
  samples: import_zod2.z.boolean().default(false)
});
var captureSection = {
  key: "capture",
  schema: schema2
};

// src/policies/firewall.ts
var import_zod3 = require("zod");

// src/errors.ts
function toField(path) {
  return path.length === 0 ? "(root)" : path.join(".");
}
function issue(path, code, message) {
  return { path, field: toField(path), code, message };
}
function fromZodError(error) {
  return error.issues.map((raw) => {
    const path = raw.path.map((segment) => typeof segment === "number" ? segment : String(segment));
    const params = raw.params;
    const code = typeof params?.code === "string" ? params.code : raw.code;
    return { path, field: toField(path), code, message: raw.message };
  });
}
var PolicyValidationError = class extends Error {
  issues;
  constructor(issues) {
    super(`Policy inv\xE1lida: ${issues.map((i) => `${i.field}: ${i.message}`).join("; ")}`);
    this.name = "PolicyValidationError";
    this.issues = issues;
  }
};

// src/internal/domain.ts
var LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
var FORBIDDEN = /[\s/\\:?#@[\]_]/;
function toPunycode(host) {
  try {
    const { hostname } = new URL(`http://${host}`);
    return hostname === "" ? null : hostname;
  } catch {
    return null;
  }
}
function parseDomain(raw) {
  let text = raw.trim().toLowerCase();
  if (text === "") return { ok: false, code: "invalid_format" };
  const wildcard = text.startsWith("*.");
  if (wildcard) text = text.slice(2);
  if (text.includes("*")) return { ok: false, code: "invalid_wildcard" };
  if (text.endsWith(".")) text = text.slice(0, -1);
  if (text === "" || text.endsWith(".")) return { ok: false, code: "invalid_format" };
  if (FORBIDDEN.test(text)) return { ok: false, code: "invalid_format" };
  const host = toPunycode(text);
  if (host === null) return { ok: false, code: "invalid_format" };
  if (host.length > 253) return { ok: false, code: "too_long" };
  const labels = host.split(".");
  if (labels.length < 2) return { ok: false, code: "needs_tld" };
  for (const label of labels) {
    if (!LABEL.test(label)) return { ok: false, code: "invalid_format" };
  }
  const tld = labels[labels.length - 1] ?? "";
  if (/^\d+$/.test(tld)) return { ok: false, code: "looks_like_ip" };
  return { ok: true, matcher: { canonical: wildcard ? `*.${host}` : host, host, wildcard } };
}
function domainContains(outer, inner) {
  if (!outer.wildcard) return !inner.wildcard && inner.host === outer.host;
  if (inner.host === outer.host) return inner.wildcard;
  return inner.host.endsWith(`.${outer.host}`);
}
function domainsOverlap(a, b) {
  return domainContains(a, b) || domainContains(b, a);
}

// src/internal/ip.ts
function parseIpv4(text) {
  const parts = text.split(".");
  if (parts.length !== 4) return { ok: false, code: "invalid_format" };
  let value = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return { ok: false, code: "invalid_format" };
    if (part.length > 1 && part.startsWith("0")) return { ok: false, code: "invalid_format" };
    const octet = Number(part);
    if (octet > 255) return { ok: false, code: "invalid_format" };
    value = value << 8n | BigInt(octet);
  }
  return { ok: true, value };
}
function parseIpv6(text) {
  if (text.includes("%")) return { ok: false, code: "zone_id_not_supported" };
  if (text.includes(".")) return { ok: false, code: "ipv4_mapped_not_supported" };
  const halves = text.split("::");
  if (halves.length > 2) return { ok: false, code: "invalid_format" };
  const toGroups = (part) => {
    if (part === "") return [];
    const groups2 = part.split(":");
    for (const group of groups2) if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    return groups2;
  };
  const head = toGroups(halves[0] ?? "");
  const tail = halves.length === 2 ? toGroups(halves[1] ?? "") : [];
  if (head === null || tail === null) return { ok: false, code: "invalid_format" };
  const provided = head.length + tail.length;
  if (halves.length === 2) {
    if (provided > 7) return { ok: false, code: "invalid_format" };
  } else if (provided !== 8) {
    return { ok: false, code: "invalid_format" };
  }
  const groups = [...head, ...Array(8 - provided).fill("0"), ...tail];
  let value = 0n;
  for (const group of groups) value = value << 16n | BigInt(parseInt(group, 16));
  return { ok: true, value };
}
function formatIpv4(value) {
  return [24n, 16n, 8n, 0n].map((shift) => (value >> shift & 0xffn).toString()).join(".");
}
function formatIpv6(value) {
  const groups = [];
  for (let index = 7; index >= 0; index -= 1) {
    groups.push((value >> BigInt(index * 16) & 0xffffn).toString(16));
  }
  let best = { start: -1, length: 0 };
  let run = { start: -1, length: 0 };
  groups.forEach((group, index) => {
    if (group !== "0") {
      run = { start: -1, length: 0 };
      return;
    }
    if (run.start === -1) run = { start: index, length: 0 };
    run.length += 1;
    if (run.length > best.length) best = { ...run };
  });
  if (best.length < 2) return groups.join(":");
  return `${groups.slice(0, best.start).join(":")}::${groups.slice(best.start + best.length).join(":")}`;
}
function parseCidr(raw) {
  const text = raw.trim();
  if (text === "") return { ok: false, code: "invalid_format" };
  const slash = text.indexOf("/");
  const address = slash === -1 ? text : text.slice(0, slash);
  const prefixText = slash === -1 ? null : text.slice(slash + 1);
  const version = address.includes(":") ? 6 : 4;
  const width = version === 4 ? 32 : 128;
  const parsed = version === 4 ? parseIpv4(address) : parseIpv6(address);
  if (!parsed.ok) return parsed;
  let prefix = width;
  if (prefixText !== null) {
    if (!/^\d{1,3}$/.test(prefixText)) return { ok: false, code: "invalid_format" };
    if (prefixText.length > 1 && prefixText.startsWith("0")) return { ok: false, code: "invalid_format" };
    prefix = Number(prefixText);
    if (prefix > width) return { ok: false, code: "prefix_out_of_range" };
  }
  const bits = BigInt(width);
  const hostMask = (1n << bits - BigInt(prefix)) - 1n;
  const start = parsed.value & ~hostMask & (1n << bits) - 1n;
  const end = start | hostMask;
  return {
    ok: true,
    range: {
      canonical: `${version === 4 ? formatIpv4(start) : formatIpv6(start)}/${prefix}`,
      version,
      prefix,
      start,
      end
    }
  };
}
function rangeContains(outer, inner) {
  return outer.version === inner.version && outer.start <= inner.start && outer.end >= inner.end;
}
function rangesOverlap(a, b) {
  return a.version === b.version && a.start <= b.end && b.start <= a.end;
}

// src/policies/firewall.ts
var FIREWALL_ACTIONS = ["allow", "deny"];
var FIREWALL_RULE_TYPES = ["cidr", "domain"];
var FIREWALL_MAX_RULES = 256;
var CIDR_MESSAGES = {
  invalid_format: "No es una IP ni un CIDR v\xE1lido (ej: 10.0.0.0/8, 192.168.1.7, 2001:db8::/32)",
  prefix_out_of_range: "Prefijo fuera de rango (m\xE1ximo /32 en IPv4 y /128 en IPv6)",
  zone_id_not_supported: "Los zone ID (%eth0) no est\xE1n soportados en una regla de firewall",
  ipv4_mapped_not_supported: "Usa la notaci\xF3n IPv4 (10.0.0.1/32) en lugar de ::ffff:10.0.0.1"
};
var DOMAIN_MESSAGES = {
  invalid_format: "No es un dominio v\xE1lido: escribe solo el host, sin esquema, puerto ni ruta",
  invalid_wildcard: "El comod\xEDn solo se admite como prefijo y una sola vez (ej: *.evil.com)",
  too_long: "El dominio supera los 253 caracteres",
  looks_like_ip: 'Esto es una direcci\xF3n IP: usa una regla de tipo "cidr"',
  needs_tld: "Falta el dominio de primer nivel (ej: evil.com, no evil)"
};
var action = import_zod3.z.enum(FIREWALL_ACTIONS);
var cidrValue = import_zod3.z.string().transform((raw, ctx) => {
  const result = parseCidr(raw);
  if (!result.ok) {
    ctx.addIssue({
      code: "custom",
      message: CIDR_MESSAGES[result.code] ?? CIDR_MESSAGES["invalid_format"] ?? "",
      params: { code: `firewall.${result.code}` }
    });
    return import_zod3.z.NEVER;
  }
  return result.range.canonical;
});
var domainValue = import_zod3.z.string().transform((raw, ctx) => {
  const result = parseDomain(raw);
  if (!result.ok) {
    ctx.addIssue({
      code: "custom",
      message: DOMAIN_MESSAGES[result.code] ?? DOMAIN_MESSAGES["invalid_format"] ?? "",
      params: { code: `firewall.${result.code}` }
    });
    return import_zod3.z.NEVER;
  }
  return result.matcher.canonical;
});
var cidrRule = import_zod3.z.strictObject({ action, type: import_zod3.z.literal("cidr"), value: cidrValue });
var domainRule = import_zod3.z.strictObject({ action, type: import_zod3.z.literal("domain"), value: domainValue });
var rulesOf = (rule) => import_zod3.z.array(rule).max(FIREWALL_MAX_RULES, { error: `M\xE1ximo ${FIREWALL_MAX_RULES} reglas por direcci\xF3n` }).default([]);
var inbound = import_zod3.z.strictObject({
  default_action: action.default("allow"),
  rules: rulesOf(cidrRule)
});
var outbound = import_zod3.z.strictObject({
  default_action: action.default("allow"),
  rules: rulesOf(import_zod3.z.discriminatedUnion("type", [cidrRule, domainRule]))
});
var schema3 = import_zod3.z.strictObject({
  inbound: inbound.prefault({}),
  outbound: outbound.prefault({})
});
function toMatcher(rule) {
  if (rule.type === "cidr") {
    const result2 = parseCidr(rule.value);
    return result2.ok ? { kind: "cidr", range: result2.range } : null;
  }
  const result = parseDomain(rule.value);
  return result.ok ? { kind: "domain", matcher: result.matcher } : null;
}
function contains(outer, inner) {
  if (outer.kind === "cidr" && inner.kind === "cidr") return rangeContains(outer.range, inner.range);
  if (outer.kind === "domain" && inner.kind === "domain") return domainContains(outer.matcher, inner.matcher);
  return false;
}
function overlaps(a, b) {
  if (a.kind === "cidr" && b.kind === "cidr") return rangesOverlap(a.range, b.range);
  if (a.kind === "domain" && b.kind === "domain") return domainsOverlap(a.matcher, b.matcher);
  return false;
}
function lintDirection(direction, path) {
  const found = [];
  const matchers = direction.rules.map(toMatcher);
  direction.rules.forEach((rule, index) => {
    const current = matchers[index];
    if (!current) return;
    const at = [...path, "rules", index];
    let unreachable = false;
    for (let earlier = 0; earlier < index; earlier += 1) {
      const previous = matchers[earlier];
      if (!previous) continue;
      if (previous.kind === current.kind && rule.value === direction.rules[earlier]?.value) {
        found.push(issue(at, "firewall.duplicate_rule", `Duplicado de la regla ${earlier} tras canonicalizar`));
        unreachable = true;
        break;
      }
      if (contains(previous, current)) {
        found.push(
          issue(
            at,
            "firewall.shadowed_rule",
            `Nunca se aplica: la regla ${earlier} (${direction.rules[earlier]?.value}) ya decide sobre este rango`
          )
        );
        unreachable = true;
        break;
      }
    }
    if (unreachable) return;
    if (rule.action === direction.default_action) {
      const shieldsSomething = matchers.slice(index + 1).some((later) => later !== null && overlaps(current, later));
      if (!shieldsSomething) {
        found.push(
          issue(
            at,
            "firewall.redundant_rule",
            `Sin efecto: hace lo mismo que default_action ("${direction.default_action}")`
          )
        );
      }
    }
    if (rule.action === "deny" && current.kind === "cidr" && current.range.prefix === 0) {
      found.push(issue(at, "firewall.blocks_all_traffic", "Esta regla bloquea todo el tr\xE1fico de su familia de IP"));
    }
  });
  return found;
}
function lint(value, path) {
  return [
    ...lintDirection(value.inbound, [...path, "inbound"]),
    ...lintDirection(value.outbound, [...path, "outbound"])
  ];
}
var firewallSection = {
  key: "firewall",
  schema: schema3,
  lint
};

// src/policies/index.ts
var SECTIONS = {
  cache: cacheSection,
  capture: captureSection,
  firewall: firewallSection
};

// src/document.ts
var POLICY_VERSION = 1;
var sectionShape = Object.fromEntries(
  Object.entries(SECTIONS).map(([key, section]) => [key, section.schema.optional()])
);
var policiesSchema = import_zod4.z.looseObject({
  version: import_zod4.z.literal(POLICY_VERSION).default(POLICY_VERSION),
  ...sectionShape
});
function policiesJsonSchema() {
  return import_zod4.z.toJSONSchema(policiesSchema, { io: "input" });
}

// src/parse.ts
var sections = Object.values(SECTIONS);
function lintAll(document) {
  const record = document;
  const warnings = [];
  for (const section of sections) {
    const value = record[section.key];
    if (value === void 0 || !section.lint) continue;
    warnings.push(...section.lint(value, [section.key]));
  }
  return warnings;
}
function parsePolicies(input) {
  const result = policiesSchema.safeParse(input);
  if (!result.success) return { ok: false, errors: fromZodError(result.error) };
  return { ok: true, value: result.data, warnings: lintAll(result.data) };
}
function assertPolicies(input) {
  const result = parsePolicies(input);
  if (!result.ok) throw new PolicyValidationError(result.errors);
  return result.value;
}
function resolvePolicies(input) {
  const document = assertPolicies(input);
  const resolved = { ...document };
  for (const section of sections) {
    if (resolved[section.key] === void 0) resolved[section.key] = section.schema.parse({});
  }
  return resolved;
}

// src/builder.ts
function policy(initial = { version: POLICY_VERSION }) {
  const draft = { ...initial };
  return {
    set(key, value) {
      return policy({ ...draft, [key]: value });
    },
    remove(key) {
      const { [key]: _removed, ...rest } = draft;
      return policy(rest);
    },
    build() {
      return assertPolicies(draft);
    },
    safeBuild() {
      return parsePolicies(draft);
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CACHE_DEFAULT_MIN_SIMILARITY,
  CACHE_MODES,
  CACHE_TTL_MAX_SECONDS,
  CACHE_TTL_MIN_SECONDS,
  FIREWALL_ACTIONS,
  FIREWALL_MAX_RULES,
  FIREWALL_RULE_TYPES,
  POLICY_VERSION,
  PolicyValidationError,
  SECTIONS,
  assertPolicies,
  parsePolicies,
  policiesJsonSchema,
  policiesSchema,
  policy,
  resolvePolicies
});
//# sourceMappingURL=index.cjs.map