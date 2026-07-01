# Plugin Index Format

Schema:

```txt
lattice.plugin.index.v1
```

Top-level fields:

- `schema`: exact schema string.
- `generated_at`: UTC timestamp.
- `status`: `draft`, `official`, `example`, or future state.
- `publishers`: trusted signing identities advertised by the index.
- `plugins`: plugin metadata and releases.
- `signatures`: signatures over the canonical index payload.

`status: "official"` is reserved for an index with at least one top-level
signature. Unsigned indexes must remain `draft` or `example`, even when they list
signed plugin release manifests.

## Publisher

```json
{
  "id": "latticenet",
  "name": "LatticeNet",
  "public_key_ed25519": "base64-public-key"
}
```

Publisher IDs use the same conservative id shape as plugin IDs:

```txt
[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]
```

## Plugin

```json
{
  "id": "latticenet.sing-box",
  "name": "sing-box Manager",
  "publisher": "latticenet",
  "type": "system",
  "summary": "Plan and apply reviewed sing-box configs on selected nodes.",
  "latest": "0.1.0",
  "capabilities": ["node:read", "network:plan", "network:apply"],
  "releases": []
}
```

Types:

- `system`
- `worker`
- `wasm`

Capabilities must be recognized by the server-side plugin verifier. Unknown
capabilities are invalid.

## Release

```json
{
  "version": "0.1.0",
  "manifest_url": "https://example.invalid/plugin/manifest.json",
  "artifact_url": "https://example.invalid/plugin/artifact",
  "artifact_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "signature_ed25519": "base64-plugin-manifest-signature"
}
```

URLs must be HTTPS and must not contain userinfo or fragments. Artifacts are
trusted only after digest verification and manifest signature verification.

## Canonicalization

Before the server supports remote install, define a canonical JSON signing
payload. Do not sign arbitrary pretty-printed bytes from a local formatter.

Recommended payload:

```txt
LATTICE-PLUGIN-INDEX-V1\n
<canonical-json-without-signatures>
```

This repository currently provides a structural validator, not final signing
canonicalization.
