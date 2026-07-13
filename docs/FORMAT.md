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

`public_key_ed25519` is standard base64 over the raw 32-byte Ed25519 public key.

## Plugin

```json
{
  "id": "latticenet.sing-box",
  "name": "sing-box Manager",
  "publisher": "latticenet",
  "type": "system",
  "summary": "Plan and apply reviewed sing-box configs on selected nodes.",
  "latest": "0.1.0",
  "channels": {"stable": "0.1.0"},
  "capabilities": ["node:read", "network:plan", "network:apply"],
  "releases": [
    {
      "version": "0.1.0",
      "channel": "stable",
      "manifest_url": "https://example.invalid/plugin/manifest.json",
      "artifact_url": "https://example.invalid/plugin/artifact",
      "artifact_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      "signature_ed25519": "base64-plugin-manifest-signature"
    }
  ]
}
```

Types:

- `system`
- `worker`
- `wasm`

Capabilities must be recognized by the server-side plugin verifier. Unknown
capabilities are invalid. Each plugin must publish at least one release and a
`channels` map. Supported channels are `stable` and `alpha`; every channel must
point to a same-channel release. `stable` may not select a prerelease and
`alpha` must select a `-alpha` version. The optional legacy `latest` field is a
stable-only compatibility alias and, when present, must equal
`channels.stable`. A plugin with only alpha releases omits `latest` entirely.

## Release

```json
{
  "version": "0.1.0",
  "channel": "stable",
  "manifest_url": "https://example.invalid/plugin/manifest.json",
  "artifact_url": "https://example.invalid/plugin/artifact",
  "artifact_sha256": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "signature_ed25519": "base64-plugin-manifest-signature"
}
```

URLs must be HTTPS and must not contain userinfo, query strings, or fragments.
Artifacts are trusted only after digest verification and manifest signature verification.
`signature_ed25519` is standard base64 over the raw 64-byte Ed25519 signature.
An optional release-level `capabilities` array records channel-specific changes.
It is required for every release when a plugin exposes more than one channel.
Clients must resolve the selected release first and use its capability list;
`plugin.capabilities` is only the default for single-channel or legacy entries.
The signed manifest remains authoritative at installation time.

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
