#!/usr/bin/env node
// Structural validator for lattice.release.train.v1 files (no dependencies —
// this repo publishes an index, it does not carry a node_modules).
//
// Checks are the schema's constraints re-implemented plainly: required keys,
// unknown-key rejection, pattern checks, and the two cross-field rules a JSON
// Schema cannot express alone:
//   1. a plain (non-prerelease) train must not contain a NON-STABLE component in either
//      notation — semver prerelease (v1.2.3-alpha.4) AND the server image train
//      (alpha-1.2.3a4). The second form has no "-alpha." in it and defeated the first
//      version of this check (found by review, 2026-07-28);
//   2. plugin ids must be unique;
//   3. tags belong to the component-appropriate lanes of rules/01 §8.5: only the server
//      can use alpha-X.Y.ZaN; every other component uses stable/prerelease semver. Plugin
//      versions are X.Y.Z[-prerelease] — an unparseable version is not a version.
// CI runs this over train/examples/ and every train/*.json, and runs test-train-validator.mjs,
// which asserts the invalid fixtures in train/fixtures/invalid/ actually FAIL.

import { readFileSync } from "node:fs";

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{7,40}$/;
const TRAIN = /^v\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/;
const PSEUDO = /^v\d+\.\d+\.\d+-0\.\d{14}-[0-9a-f]{12}$/;
const PLUGIN_ID = /^[a-z0-9.-]+\.[a-z0-9-]+$/;
const PLUGIN_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?(\+[0-9A-Za-z.-]+)?$/;
// The server alone owns the image-train lane. Sharing one pattern across every component let
// a dashboard claim an alpha-X.Y.ZaN server tag (found in review, r3).
const SEMVER_TAG_LANES = [
  /^v\d+\.\d+\.\d+$/,
  /^v\d+\.\d+\.\d+-(alpha|beta|rc)\.\d+$/,
];
const SERVER_TAG_LANES = [
  ...SEMVER_TAG_LANES,
  /^alpha-\d+\.\d+\.\d+a\d+$/,
];
// Non-stable in EITHER notation. The image train is the one that bit us: "alpha-0.2.2a3"
// contains no "-alpha." and sailed through a prerelease-only check.
const NON_STABLE = [
  // ANY SemVer prerelease marker — a hyphen after the numeric core. The earlier list
  // named only the lanes we happen to use, so `1.0.0-dev.1` sailed into a plain train
  // (found in review, r2). Recognising the marker rather than the vocabulary means an
  // unfamiliar prerelease spelling fails closed instead of passing.
  /^v?\d+\.\d+\.\d+-/,
  /-(alpha|beta|rc)\./,
  /^(alpha|beta|rc)-/,
  /\d+[a-z]\d+$/,
];
const isNonStable = (v) => typeof v === "string" && NON_STABLE.some((rx) => rx.test(v));

const errors = [];
const fail = (msg) => errors.push(msg);

function requireKeys(obj, keys, where, extraAllowed = []) {
  for (const k of keys) if (!(k in obj)) fail(`${where}: missing required "${k}"`);
  for (const k of Object.keys(obj))
    if (!keys.includes(k) && !extraAllowed.includes(k)) fail(`${where}: unknown key "${k}"`);
}

function checkComponent(c, where, allowImage = false) {
  if (typeof c !== "object" || c === null) return fail(`${where}: not an object`);
  requireKeys(c, ["tag", "commit"], where, allowImage ? ["image"] : []);
  const tagLanes = allowImage ? SERVER_TAG_LANES : SEMVER_TAG_LANES;
  if (typeof c.tag !== "string" || !c.tag) fail(`${where}.tag: empty`);
  else if (!tagLanes.some((rx) => rx.test(c.tag)))
    fail(
      allowImage
        ? `${where}.tag: "${c.tag}" is not a server tag lane (vX.Y.Z | vX.Y.Z-(alpha|beta|rc).N | alpha-X.Y.ZaN)`
        : `${where}.tag: "${c.tag}" is not a component semver tag lane (vX.Y.Z | vX.Y.Z-(alpha|beta|rc).N)`,
    );
  if (!GIT_SHA.test(c.commit ?? "")) fail(`${where}.commit: not a git sha`);
}

const path = process.argv[2];
if (!path) {
  console.error("usage: validate-train.mjs <train.json>");
  process.exit(2);
}
let t;
try {
  t = JSON.parse(readFileSync(path, "utf8"));
} catch (e) {
  console.error(`${path}: unreadable or not JSON: ${e.message}`);
  process.exit(1);
}

requireKeys(t, ["schema", "train", "components", "pins", "verified"], "train");
if (t.schema !== "lattice.release.train.v1") fail(`schema: want lattice.release.train.v1, got ${t.schema}`);
if (!TRAIN.test(t.train ?? "")) fail(`train: "${t.train}" is not vX.Y.Z[-alpha.N|-beta.N|-rc.N]`);

const c = t.components ?? {};
requireKeys(c, ["server", "dashboard", "node_agent", "sdk", "plugins"], "components");
checkComponent(c.server, "components.server", true);
checkComponent(c.dashboard, "components.dashboard");
checkComponent(c.node_agent, "components.node_agent");
checkComponent(c.sdk, "components.sdk");

if (!Array.isArray(c.plugins) || c.plugins.length === 0) fail("components.plugins: empty");
const seen = new Set();
for (const [i, p] of (c.plugins ?? []).entries()) {
  const where = `components.plugins[${i}]`;
  requireKeys(p, ["id", "version", "artifact_sha256"], where, ["min_server"]);
  if (!PLUGIN_ID.test(p.id ?? "")) fail(`${where}.id: "${p.id}" not a plugin id`);
  if (seen.has(p.id)) fail(`${where}.id: duplicate "${p.id}"`);
  seen.add(p.id);
  if (!PLUGIN_VERSION.test(p.version ?? ""))
    fail(`${where}.version: "${p.version}" is not X.Y.Z[-prerelease]`);
  if (!SHA256.test(p.artifact_sha256 ?? "")) fail(`${where}.artifact_sha256: not a sha256`);
}

const pins = t.pins ?? {};
requireKeys(pins, ["server_sdk_ref", "server_dashboard_ref", "node_agent_sdk_pseudo"], "pins");
if (!GIT_SHA.test(pins.server_sdk_ref ?? "")) fail("pins.server_sdk_ref: not a git sha");
if (!GIT_SHA.test(pins.server_dashboard_ref ?? "")) fail("pins.server_dashboard_ref: not a git sha");
if (!PSEUDO.test(pins.node_agent_sdk_pseudo ?? "")) fail("pins.node_agent_sdk_pseudo: not a Go pseudo-version");

const v = t.verified ?? {};
requireKeys(v, ["manifests_validated_against_server", "generated_at"], "verified");
if (!v.manifests_validated_against_server) fail("verified.manifests_validated_against_server: empty");
if (Number.isNaN(Date.parse(v.generated_at ?? ""))) fail("verified.generated_at: not a date-time");

// Cross-field rule: a plain train is a promotion — no prerelease components inside it.
if (TRAIN.test(t.train ?? "") && !t.train.includes("-")) {
  for (const [name, comp] of Object.entries({ server: c.server, dashboard: c.dashboard, node_agent: c.node_agent, sdk: c.sdk })) {
    if (isNonStable(comp?.tag))
      fail(`components.${name}.tag: non-stable "${comp.tag}" inside plain train ${t.train}`);
  }
  for (const p of c.plugins ?? [])
    if (isNonStable(p.version)) fail(`plugin ${p.id}: non-stable "${p.version}" inside plain train ${t.train}`);
  if (isNonStable(c.server?.image)) fail(`components.server.image: non-stable "${c.server.image}" inside plain train ${t.train}`);
}

if (errors.length) {
  for (const e of errors) console.error(`${path}: ${e}`);
  process.exit(1);
}
console.log(`${path}: valid lattice.release.train.v1 (train ${t.train}, ${c.plugins.length} plugins)`);
