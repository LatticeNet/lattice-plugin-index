#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lattice-plugin-index-test-"));

function baseIndex() {
  return {
    schema: "lattice.plugin.index.v1",
    generated_at: "2026-06-15T00:00:00Z",
    status: "draft",
    publishers: [
      {
        id: "latticenet",
        name: "LatticeNet",
        public_key_ed25519: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    ],
    plugins: [
      {
        id: "latticenet.test",
        name: "Test Plugin",
        publisher: "latticenet",
        type: "system",
        summary: "Contract test plugin.",
        latest: "0.1.0",
        channels: { stable: "0.1.0" },
        capabilities: ["node:read"],
        releases: [
          {
            version: "0.1.0",
            channel: "stable",
            manifest_url: "https://plugins.latticenet.invalid/test/0.1.0/manifest.json",
            artifact_url: "https://plugins.latticenet.invalid/test/0.1.0/artifact",
            artifact_sha256: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
            signature_ed25519: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==",
          },
        ],
      },
    ],
    signatures: [],
  };
}

function runValidator(name, value) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
  return spawnSync(process.execPath, [path.join(root, "scripts/validate-index.mjs"), file], {
    cwd: root,
    encoding: "utf8",
  });
}

function expectReject(name, value, message) {
  const result = runValidator(name, value);
  if (result.status === 0) {
    throw new Error(`${name} was accepted`);
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes(message)) {
    throw new Error(`${name} unexpected validator output:\n${output}`);
  }
}

try {
  const unsignedOfficial = baseIndex();
  unsignedOfficial.status = "official";
  expectReject("unsigned-official", unsignedOfficial, "official indexes require at least one signature");

  const staleLatest = baseIndex();
  staleLatest.plugins[0].latest = "0.2.0";
  staleLatest.plugins[0].channels.stable = "0.2.0";
  expectReject("stale-latest", staleLatest, "stable channel must match one release version");

  const latestIsNotStableAlias = baseIndex();
  latestIsNotStableAlias.plugins[0].latest = "0.2.0-alpha.1";
  expectReject("latest-is-not-stable-alias", latestIsNotStableAlias, "latest is a legacy stable alias");

  const stablePrerelease = baseIndex();
  stablePrerelease.plugins[0].channels.stable = "0.2.0-alpha.1";
  expectReject("stable-prerelease", stablePrerelease, "stable channel cannot select a prerelease");

  const missingChannelRelease = baseIndex();
  missingChannelRelease.plugins[0].channels.alpha = "0.2.0-alpha.1";
  expectReject("missing-channel-release", missingChannelRelease, "alpha channel must match one release version");

  const wrongReleaseChannel = baseIndex();
  wrongReleaseChannel.plugins[0].channels.alpha = "0.2.0-alpha.1";
  wrongReleaseChannel.plugins[0].releases.push({
    ...wrongReleaseChannel.plugins[0].releases[0],
    version: "0.2.0-alpha.1",
    channel: "stable",
    manifest_url: "https://plugins.latticenet.invalid/test/0.2.0-alpha.1/manifest.json",
    artifact_url: "https://plugins.latticenet.invalid/test/0.2.0-alpha.1/artifact",
  });
  expectReject("wrong-release-channel", wrongReleaseChannel, "stable release 0.2.0-alpha.1 cannot be a prerelease");

  const duplicateRelease = baseIndex();
  duplicateRelease.plugins[0].releases.push({
    ...duplicateRelease.plugins[0].releases[0],
    manifest_url: "https://plugins.latticenet.invalid/test/duplicate/manifest.json",
    artifact_url: "https://plugins.latticenet.invalid/test/duplicate/artifact",
  });
  expectReject("duplicate-release", duplicateRelease, "plugin latticenet.test release version duplicated: 0.1.0");

  const shortPublisherKey = baseIndex();
  shortPublisherKey.publishers[0].public_key_ed25519 = Buffer.alloc(31).toString("base64");
  expectReject("short-publisher-key", shortPublisherKey, "publisher latticenet public_key_ed25519 must be base64 raw Ed25519 public key (32 bytes)");

  const shortReleaseSignature = baseIndex();
  shortReleaseSignature.plugins[0].releases[0].signature_ed25519 = Buffer.alloc(63).toString("base64");
  expectReject("short-release-signature", shortReleaseSignature, "plugin latticenet.test release signature_ed25519 must be base64 raw Ed25519 signature (64 bytes)");

  const queryArtifactURL = baseIndex();
  queryArtifactURL.plugins[0].releases[0].artifact_url = "https://plugins.latticenet.invalid/test/0.1.0/artifact?token=secret";
  expectReject("query-artifact-url", queryArtifactURL, "plugin latticenet.test release artifact_url must be HTTPS without userinfo/query/fragment");

  const shortIndexSignature = baseIndex();
  shortIndexSignature.status = "official";
  shortIndexSignature.signatures.push({
    publisher: "latticenet",
    signature_ed25519: Buffer.alloc(63).toString("base64"),
  });
  expectReject("short-index-signature", shortIndexSignature, "index signature for latticenet must be base64 raw Ed25519 signature (64 bytes)");

  console.log("plugin-index: validator contracts ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
