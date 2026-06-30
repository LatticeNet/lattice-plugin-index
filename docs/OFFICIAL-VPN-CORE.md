# Official vpn-core plugin operation contract

This document describes the Lattice-maintained `latticenet.vpn-core` plugin as
an operator product, not just a manifest entry.

## Current architecture

`latticenet.vpn-core` is an official, signed plugin with dashboard navigation and
gateway interfaces. Its live read/write model is still core-hosted for the
production VPN surfaces:

- `latticenet.vpn-core/lines`
- `latticenet.vpn-core/users`
- `latticenet.vpn-core/profiles`
- `latticenet.vpn-core/subscriptions`
- `latticenet.vpn-core/usage`

The dashboard calls these through the plugin gateway. The server enforces the
declared interface scopes and serves the builtin views registered for the
official plugin.

## Source of truth for sing-box

The node's actual sing-box runtime configuration is the source of truth.
vpn-core may cache, index, annotate, or expose management actions, but it must
not pretend its Bolt/KV data is authoritative for a node's full sing-box state.

For managed sing-box nodes:

1. Inspect the runtime config first.
2. Apply changes through the node-local toolchain.
3. Let discovery report the updated runtime state back.
4. Render Lines from discovered/applied facts.

This is why Lines is the primary page. The older "Inbounds" shape is a legacy
mental model and should be folded into Lines instead of treated as a separate
authoritative store.

## Annotation convention

When Lattice writes or updates sing-box config, it should add redundant,
non-secret metadata fields that survive round-trips and make ownership clear.

Recommended object-local convention:

```json
{
  "_lattice": {
    "managed": true,
    "plugin": "latticenet.vpn-core",
    "line_hash_id": "line_...",
    "node_id": "node_...",
    "comment": "operator note",
    "updated_at": "2026-06-30T00:00:00Z"
  }
}
```

If a target tool cannot preserve nested metadata, use conservative flat comment
keys instead:

```json
{
  "lattice_comment_line_hash_id": "line_...",
  "lattice_comment_node_id": "node_...",
  "lattice_comment_plugin": "latticenet.vpn-core",
  "lattice_comment_operator_note": "operator note"
}
```

Rules:

- Never store secrets in annotations.
- Never require annotations to parse third-party or manually maintained configs.
- Prefer annotations as correlation hints; runtime config remains the fact.
- If annotations and runtime facts disagree, runtime facts win and the UI should
  surface drift rather than silently rewriting.

## Users and credentials

A vpn-core user is an identity with a credential set, not a single protocol row.
The official dashboard creates the full supported credential set by default:

- `vless`
- `vmess`
- `trojan`
- `shadowsocks`
- `hysteria2`
- `tuic`
- `anytls`

Credential secrets are write-only from the dashboard perspective. Update flows
must preserve existing credentials unless the operator explicitly chooses to
replace the set.

## Lines management

Lines should be the unified operator surface for discovered sing-box lines,
managed line add/delete actions, node-local runtime metadata, outbound/route
hints, per-line user bindings, and per-line usage once the node can report it.

Today the production-safe write bridge is task-backed and asynchronous: add or
delete queues a bounded agent task and the UI reflects the new state after the
next discovery poll. The node-agent must be started with task execution enabled
for those actions:

- `LATTICE_AGENT_ALLOW_EXEC=1`
- `LATTICE_AGENT_ALLOW_ROOT_EXEC=1` when the service runs as root and the action
  mutates root-owned config

For common VPN nodes also enable:

- `LATTICE_SINGBOX_DISCOVER=1`
- `LATTICE_SINGBOX_BIN=sb`

## Interop with the maintained sing-box tool fork

Lattice should integrate with the maintained local fork at:

```text
/Users/cdcd/roobli/RTFS_justTaste/Probe-Dashboards/sing-box
```

Expected tool contract for future write actions:

- inspect full runtime config as JSON;
- add/update one inbound/line with protocol, port, network, and user bindings;
- preserve unknown fields and Lattice annotations;
- emit a machine-readable diff or result JSON;
- fail loudly without partial-success wording when any file write fails.

Until that contract is stable, vpn-core must avoid claiming complete
authoritative config management. The correct UI copy is "queue/manage on-node
action, then rediscover", not "saved in Lattice".

## Dashboard contribution rules

Official plugin dashboard views use builtin dashboard components registered in
both places:

- dashboard `PluginView.vue` `BUILTIN_COMPONENTS`;
- server `internal/plugin/contributions.go` `pluginBuiltinViews`.

Manifests should declare nav entries, interface service/method names, required
scopes, and `component_key` for builtin views.

No plugin-provided browser JavaScript runs in the dashboard. Plugin UI is data
and builtin component selection only.
