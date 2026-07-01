# Plugin Index Security

The plugin index is not an authorization source by itself. It is a discovery
source.

Lattice server must reject remote install unless all checks pass:

1. the index signature verifies against a trusted index key;
2. the plugin publisher is allowed by operator policy;
3. the release manifest verifies against the publisher key;
4. the artifact SHA-256 equals the release metadata;
5. the manifest digest equals the artifact bytes;
6. capability risk is shown to the operator;
7. install is approved and audited.

An unsigned index is discovery-only. It must use `status: "draft"` or
`status: "example"`; `status: "official"` requires at least one top-level index
signature before any server or operator tooling treats it as an official catalog.

## Host-Risk Plugins

Host-risk plugins include capabilities such as:

- `network:apply`
- `task:run`
- `node:admin`
- `ddns:admin`
- `tunnel:admin`

Community host-risk plugins must be disabled by default. Operators may opt in by
adding a publisher key to their trust policy, but Lattice should not silently
trust them from the public marketplace.

## No Auto-Install

The first marketplace implementation should show candidates only. Install and
activation remain separate reviewed actions.

## Revocation

Before remote install is enabled, add one of:

- revoked artifact digest list;
- revoked plugin release list;
- minimum required index generation timestamp;
- signed publisher key rotation document.

Without revocation, the marketplace is discovery-only.
