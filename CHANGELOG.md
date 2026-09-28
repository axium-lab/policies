# Changelog

All notable changes to `@axium-lab/policies` are documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with pre-1.0 conventions: minor bumps signal BREAKING changes; patch bumps are safe.

## [Unreleased]

## [0.1.0] — 2026-09-28

First release.

### Added

- **Policy document** (`version: 1`) where a section exists only if it was
  configured. Unknown root keys are preserved; unknown keys inside a known
  section are an error.
- **`parsePolicies`**, **`assertPolicies`** and **`resolvePolicies`** to
  validate a document on the backend and read it, with defaults filled in, in
  the proxy runtime. Errors carry `field`, `path` and a stable `code`;
  non-blocking `warnings` flag duplicate, unreachable or redundant rules.
- **`policy()` builder**, immutable, and **`policiesJsonSchema()`** for
  client-side validation and form rendering.
- **`firewall`** policy: ordered first-match rules, `cidr` for `inbound`,
  `cidr` and `domain` for `outbound`.
- **`cache`** and **`capture`** policies, with validation and default values.
- IP and CIDR parsing with canonicalization (`10.0.0.1/8` → `10.0.0.0/8`,
  `WWW.Evil.COM.` → `www.evil.com`).
