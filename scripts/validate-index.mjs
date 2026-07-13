#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const capabilitySet = new Set([
  "audit:read",
  "http:egress",
  "http:operator-target",
  "kv:read",
  "kv:write",
  "log:write",
  "monitor:read",
  "monitor:admin",
  "netpolicy:read",
  "netpolicy:admin",
  "netguard:read",
  "netguard:admin",
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
const channelSet = new Set(["stable", "alpha"]);

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
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password && !u.search && !u.hash;
  } catch {
    return false;
  }
}

function base64DecodedLength(value) {
  if (typeof value !== "string" || value === "") return -1;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    return -1;
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) return -1;
  return decoded.length;
}

function isBase64Bytes(value, bytes) {
  return base64DecodedLength(value) === bytes;
}

function isAlphaVersion(version) {
  return typeof version === "string" && /-alpha(?:[.-]|$)/i.test(version);
}

function validateCapabilities(pluginID, capabilities, context) {
  assert(Array.isArray(capabilities) && capabilities.length > 0, `plugin ${pluginID} ${context} capabilities are required`);
  const seenCaps = new Set();
  for (const cap of capabilities || []) {
    assert(capabilitySet.has(cap), `plugin ${pluginID} ${context} capability is unknown: ${cap}`);
    assert(!seenCaps.has(cap), `plugin ${pluginID} ${context} duplicates capability: ${cap}`);
    seenCaps.add(cap);
  }
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
  assert(isBase64Bytes(p.public_key_ed25519, 32), `publisher ${p.id} public_key_ed25519 must be base64 raw Ed25519 public key (32 bytes)`);
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
  assert(plugin.channels && typeof plugin.channels === "object" && !Array.isArray(plugin.channels), `plugin ${plugin.id} channels are required`);
  const channelNames = Object.keys(plugin.channels || {});
  assert(channelNames.length > 0, `plugin ${plugin.id} channels must not be empty`);
  for (const channel of channelNames) {
    assert(channelSet.has(channel), `plugin ${plugin.id} channel is unknown: ${channel}`);
    assert(versionRe.test(plugin.channels[channel] || ""), `plugin ${plugin.id} ${channel} channel version is invalid`);
  }
  if (plugin.channels?.stable !== undefined) {
    assert(!isAlphaVersion(plugin.channels.stable), `plugin ${plugin.id} stable channel cannot select a prerelease`);
  }
  if (plugin.channels?.alpha !== undefined) {
    assert(isAlphaVersion(plugin.channels.alpha), `plugin ${plugin.id} alpha channel must select an alpha prerelease`);
  }
  if (plugin.latest !== undefined) {
    assert(versionRe.test(plugin.latest), `plugin ${plugin.id} latest version is invalid`);
    assert(plugin.channels?.stable === plugin.latest, `plugin ${plugin.id} latest is a legacy stable alias and must match channels.stable`);
  }
  validateCapabilities(plugin.id, plugin.capabilities, "default");
  assert(Array.isArray(plugin.releases), `plugin ${plugin.id} releases must be an array`);
  assert(plugin.releases.length > 0, `plugin ${plugin.id} releases must include at least one release`);
  const releaseVersions = new Set();
  const releaseByVersion = new Map();
  for (const release of plugin.releases) {
    assert(versionRe.test(release.version || ""), `plugin ${plugin.id} release version is invalid`);
    assert(!releaseVersions.has(release.version), `plugin ${plugin.id} release version duplicated: ${release.version}`);
    releaseVersions.add(release.version);
    releaseByVersion.set(release.version, release);
    assert(channelSet.has(release.channel), `plugin ${plugin.id} release ${release.version} channel is invalid`);
    if (release.channel === "stable") {
      assert(!isAlphaVersion(release.version), `plugin ${plugin.id} stable release ${release.version} cannot be a prerelease`);
    } else {
      assert(isAlphaVersion(release.version), `plugin ${plugin.id} alpha release ${release.version} must be an alpha prerelease`);
    }
    if (channelNames.length > 1) {
      assert(release.capabilities !== undefined, `plugin ${plugin.id} multi-channel release ${release.version} requires explicit capabilities`);
    }
    if (release.capabilities !== undefined) validateCapabilities(plugin.id, release.capabilities, `release ${release.version}`);
    assert(isHTTPURL(release.manifest_url), `plugin ${plugin.id} release manifest_url must be HTTPS without userinfo/query/fragment`);
    assert(isHTTPURL(release.artifact_url), `plugin ${plugin.id} release artifact_url must be HTTPS without userinfo/query/fragment`);
    assert(sha256Re.test(release.artifact_sha256 || ""), `plugin ${plugin.id} release artifact_sha256 must be lowercase SHA-256`);
    assert(isBase64Bytes(release.signature_ed25519, 64), `plugin ${plugin.id} release signature_ed25519 must be base64 raw Ed25519 signature (64 bytes)`);
  }
  for (const [channel, version] of Object.entries(plugin.channels || {})) {
    const release = releaseByVersion.get(version);
    assert(!!release, `plugin ${plugin.id} ${channel} channel must match one release version`);
    assert(release?.channel === channel, `plugin ${plugin.id} ${channel} channel points to a ${release?.channel || "missing"} release`);
  }
}

for (const sig of data.signatures) {
  assert(publishers.has(sig.publisher), `index signature references unknown publisher ${sig.publisher}`);
  assert(isBase64Bytes(sig.signature_ed25519, 64), `index signature for ${sig.publisher} must be base64 raw Ed25519 signature (64 bytes)`);
}

console.log(`plugin-index: ${path.basename(file)} ok (${data.plugins.length} plugins)`);
