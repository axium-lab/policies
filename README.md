# @axium-lab/policies

Validation and composition of proxy app policy documents. The frontend composes them;
the backend validates them before writing them to `rm.proxy_apps.policies`.

Isomorphic (browser, Node and Bun) with no runtime dependencies: `zod` is a
`peerDependency`.

```bash
npm install @axium-lab/policies zod
```

## Backend usage

```ts
import { parsePolicies } from '@axium-lab/policies';

const result = parsePolicies(req.body.policies);

if (!result.ok) {
  return res.status(400).json({
    status: false,
    error: { code: 'VALIDATION_ERROR', message: 'Validation error', details: result.errors },
  });
}

await knex('rm.proxy_apps').where({ id }).update({ policies: result.value });
```

`result.errors` already includes `field` in the format the API returns (`firewall.inbound.rules.1.value`),
plus `path` as an array to highlight the field in a form and a stable `code` for i18n.

`result.warnings` do not block: they flag rules that probably do not do what was intended
(duplicate, unreachable, redundant).

## Proxy runtime usage

```ts
import { resolvePolicies } from '@axium-lab/policies';

const policies = resolvePolicies(row.policies); // every section present
policies.firewall.inbound.default_action;
```

## Frontend usage

```ts
import { policy, policiesJsonSchema } from '@axium-lab/policies';

const draft = policy().set('firewall', {
  inbound: { default_action: 'deny', rules: [{ action: 'allow', type: 'cidr', value: '10.0.0.0/8' }] },
});

const result = draft.safeBuild();   // validate on the client before sending
const schema = policiesJsonSchema(); // JSON Schema to render the form
```

The builder is immutable: every `set()` / `remove()` returns a new one.

## The document

A section exists **only if it was configured**. An app with nothing configured is
`{ "version": 1 }`, which fits the column's `DEFAULT '{}'`. Inside a present section,
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

The root keeps keys it does not know, so an older deployment does not silently drop a
section written by a newer one. Inside each known section, an unknown key is an error.

## Status

| Policy | Status |
|---|---|
| `firewall` | ✅ |
| `cache` | ✅ |
| `capture` | ✅ |
| `geo` | pending |
| `dlp` | pending |
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
