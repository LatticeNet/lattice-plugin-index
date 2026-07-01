#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const capabilitySet = new Set([
  "audit:read",
  "http:egress",
  "kv:read",
  "kv:write",
  "log:write",
  "monitor:read",
  "monitor:admin",
  "netpolicy:read",
  "netpolicy:admin",
  "node:read",
  "node:admin",
  "notify:send",
  "static:read",
  "static:write",
  "task:read",
  "task:run",
  "tunnel:admin",
  "worker:route",
  "network:plan",
  "network:apply",
  "ddns:admin",
  "rpc:call",
  "rpc:expose",
]);
const statusSet = new Set(["draft", "official", "example"]);

const idRe = /^[a-z0-9][a-z0-9._-]{1,78}[a-z0-9]$/;
const versionRe = /^[A-Za-z0-9][A-Za-z0-9._+:-]{0,63}$/;
const sha256Re = /^[a-f0-9]{64}$/;

function fail(message) {
  console.error(`plugin-index: ${message}`);
  process.exitCode = 1;
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function isHTTPURL(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password && !u.hash;
  } catch {
    return false;
  }
}

function isBase64(value) {
  if (typeof value !== "string" || value === "") return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

const file = process.argv[2] || "plugins.json";
const raw = fs.readFileSync(file, "utf8");
const data = JSON.parse(raw);

assert(data.schema === "lattice.plugin.index.v1", "schema must be lattice.plugin.index.v1");
assert(typeof data.generated_at === "string" && data.generated_at.endsWith("Z"), "generated_at must be UTC RFC3339-ish");
assert(statusSet.has(data.status), "status must be draft, official, or example");
assert(Array.isArray(data.publishers), "publishers must be an array");
assert(Array.isArray(data.plugins), "plugins must be an array");
assert(Array.isArray(data.signatures), "signatures must be an array");
if (data.status === "official") {
  assert(data.signatures.length > 0, "official indexes require at least one signature");
}

const publishers = new Set();
for (const p of data.publishers) {
  assert(idRe.test(p.id || ""), `publisher id is invalid: ${p.id}`);
  assert(typeof p.name === "string" && p.name.trim() !== "", `publisher ${p.id} name is required`);
  assert(isBase64(p.public_key_ed25519), `publisher ${p.id} public_key_ed25519 must be base64`);
  publishers.add(p.id);
}

const pluginIDs = new Set();
for (const plugin of data.plugins) {
  assert(idRe.test(plugin.id || ""), `plugin id is invalid: ${plugin.id}`);
  assert(!pluginIDs.has(plugin.id), `plugin id duplicated: ${plugin.id}`);
  pluginIDs.add(plugin.id);
  assert(typeof plugin.name === "string" && plugin.name.trim() !== "", `plugin ${plugin.id} name is required`);
  assert(publishers.has(plugin.publisher), `plugin ${plugin.id} references unknown publisher ${plugin.publisher}`);
  assert(["system", "worker", "wasm"].includes(plugin.type), `plugin ${plugin.id} type is invalid`);
  assert(versionRe.test(plugin.latest || ""), `plugin ${plugin.id} latest version is invalid`);
  assert(Array.isArray(plugin.capabilities) && plugin.capabilities.length > 0, `plugin ${plugin.id} capabilities are required`);
  const seenCaps = new Set();
  for (const cap of plugin.capabilities) {
    assert(capabilitySet.has(cap), `plugin ${plugin.id} capability is unknown: ${cap}`);
    assert(!seenCaps.has(cap), `plugin ${plugin.id} duplicates capability: ${cap}`);
    seenCaps.add(cap);
  }
  assert(Array.isArray(plugin.releases), `plugin ${plugin.id} releases must be an array`);
  assert(plugin.releases.length > 0, `plugin ${plugin.id} releases must include at least one release`);
  const releaseVersions = new Set();
  for (const release of plugin.releases) {
    assert(versionRe.test(release.version || ""), `plugin ${plugin.id} release version is invalid`);
    assert(!releaseVersions.has(release.version), `plugin ${plugin.id} release version duplicated: ${release.version}`);
    releaseVersions.add(release.version);
    assert(isHTTPURL(release.manifest_url), `plugin ${plugin.id} release manifest_url must be HTTPS without userinfo/fragment`);
    assert(isHTTPURL(release.artifact_url), `plugin ${plugin.id} release artifact_url must be HTTPS without userinfo/fragment`);
    assert(sha256Re.test(release.artifact_sha256 || ""), `plugin ${plugin.id} release artifact_sha256 must be lowercase SHA-256`);
    assert(isBase64(release.signature_ed25519), `plugin ${plugin.id} release signature_ed25519 must be base64`);
  }
  assert(releaseVersions.has(plugin.latest), `plugin ${plugin.id} latest must match one release version`);
}

for (const sig of data.signatures) {
  assert(publishers.has(sig.publisher), `index signature references unknown publisher ${sig.publisher}`);
  assert(isBase64(sig.signature_ed25519), `index signature for ${sig.publisher} must be base64`);
}

console.log(`plugin-index: ${path.basename(file)} ok (${data.plugins.length} plugins)`);
