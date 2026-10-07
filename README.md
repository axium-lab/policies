# @axium-lab/policies

[![npm version](https://img.shields.io/npm/v/@axium-lab/policies)](https://www.npmjs.com/package/@axium-lab/policies)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Validation and composition of versioned policy documents (firewall, cache, capture…).
Compose them with an immutable builder, validate them anywhere with the same rules, and
resolve them into a fully-defaulted object ready to enforce.

Isomorphic (browser, Node and Bun) with no runtime dependencies: `zod` is a
`peerDependency`.

```bash
npm install @axium-lab/policies
```

## Validating untrusted input

```ts
import { parsePolicies } from '@axium-lab/policies';

const result = parsePolicies(req.body.policies);

if (!result.ok) {
  return res.status(400).json({
    status: false,
    error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: result.errors },
  });
}

await store.save(result.value); // canonicalized document, safe to persist
```

`result.errors` includes `field` as a dotted path (`firewall.inbound.rules.1.value`),
plus `path` as an array to highlight the field in a form and a stable `code` for i18n.

`result.warnings` do not block: they flag rules that probably do not do what was intended
(duplicate, unreachable, redundant).

## Enforcing policies at runtime

```ts
import { resolvePolicies } from '@axium-lab/policies';

const policies = resolvePolicies(storedDocument); // every section present
policies.firewall.inbound.default_action;
```

## Composing policies

```ts
import { policy, policiesJsonSchema } from '@axium-lab/policies';

const draft = policy().set('firewall', {
  inbound: { default_action: 'deny', rules: [{ action: 'allow', type: 'cidr', value: '10.0.0.0/8' }] },
});

const result = draft.safeBuild();   // validate before sending or saving
const schema = policiesJsonSchema(); // JSON Schema, e.g. to render a form or document an API
```

The builder is immutable: every `set()` / `remove()` returns a new one.

## The document

A section exists **only if it was configured**. A document with nothing configured is
`{ "version": 1 }` (an empty `{}` is accepted too). Inside a present section,
defaults are materialized.

```jsonc
{
  "version": 1,
  "firewall": {
    "inbound":  { "default_action": "deny",  "rules": [{ "action": "allow", "type": "cidr", "value": "10.0.0.0/8" }] },
    "outbound": { "default_action": "allow", "rules": [{ "action": "deny", "type": "domain", "value": "*.evil.com" }] }
  }
}
```

Rules are ordered: **the first match wins**. `inbound` only accepts `cidr`; `outbound`
accepts `cidr` and `domain`. Values are canonicalized on validation (`10.0.0.1/8` → `10.0.0.0/8`,
`WWW.Evil.COM.` → `www.evil.com`).

### `dlp`

Configures [`@axium-lab/euro-pii`](https://www.npmjs.com/package/@axium-lab/euro-pii) without
depending on it. `options` is euro-pii's `AnonymizeOptions` field for field, so the core passes
it as-is; `enabled` and `targets` are ours and decide whether, and on what, to call it.

```jsonc
"dlp": {
  "enabled": true,
  "targets": ["file", "prompt"],                   // file, prompt or both
  "options": {
    "countries": ["ES", "GLOBAL"],                 // what to scan: countries, kinds, entities, except
    "policy": {                                    // what to do with each hit
      "default": "mask",                           // mask | block | keep
      "kinds":    { "BANK_ACCOUNT": "block" },
      "entities": { "ES_NIF": "keep" }             // most specific wins: entities > kinds > default
    }
  }
}
```

```ts
const { enabled, targets, options } = policies.dlp;
if (enabled && targets?.includes('prompt')) anonymize(prompt, options);
if (enabled && targets?.includes('file')) anonymize(extractedText, options);
```

Only the shape is validated here (`ES_NIF`-style names, ISO alpha-2 or `GLOBAL`, the action
enum). Whether an entity exists is checked by the core against euro-pii's catalog. `enabled: true`
requires at least one target, and at least one of `countries`, `kinds` or `entities`: with none,
euro-pii scans everything. The same `options` apply to every target.

The root keeps keys it does not know, so an older deployment does not silently drop a
section written by a newer one. Inside each known section, an unknown key is an error.

## Status

| Policy | Status |
|---|---|
| `firewall` | ✅ |
| `cache` | ✅ |
| `capture` | ✅ |
| `geo` | pending |
| `dlp` | ✅ |
| `transformations` | pending |

The full design and the decisions behind it are in [DESIGN.md](./DESIGN.md).

## Releasing

1. Bump `version` in `package.json`.
2. Move the `[Unreleased]` entries in `CHANGELOG.md` to a new `## [X.Y.Z] — YYYY-MM-DD` section.
3. Commit on `main` and leave the working tree clean.
4. Check you are logged in to npm (`npm whoami`).
5. Run `./scripts/release.sh` (`--dry-run` first to see what it would do).

The script checks the tree, tag and registry, runs typecheck, tests and a clean build, then
tags `vX.Y.Z`, pushes, and publishes last — a tag can be deleted, a published version cannot.
