# Lattice Plugin Index

Static plugin index for the Lattice marketplace foundation.

Current status:

```txt
draft index + structural validator
signed plugin releases listed for integration testing
no signed official top-level index yet
no server-side remote install yet
```

The index is intentionally static and auditable. A marketplace entry is only an
install candidate; Lattice server must still verify:

- index signature;
- publisher trust policy;
- plugin manifest signature;
- artifact SHA-256 digest;
- declared capabilities and risk tier.

## Files

- `plugins.json` - current draft index. It may list LatticeNet release
  candidates, but it must not be treated as an official marketplace index until
  `status` is `official` and the top-level `signatures` array is populated.
- `examples/plugins.example.json` - full example shape with placeholder keys and
  URLs.
- `scripts/validate-index.mjs` - dependency-free structural validator.
- `docs/FORMAT.md` - index schema and installation rules.
- `docs/SECURITY.md` - marketplace trust model.

## Validate

```sh
npm run check
npm run check:examples
```

## Repository Publishing

This repository is designed to be mirrored through GitHub Pages or raw GitHub
URLs. Servers must not treat raw index availability as trust. Trust comes from
verified signatures and an operator-configured publisher policy.
