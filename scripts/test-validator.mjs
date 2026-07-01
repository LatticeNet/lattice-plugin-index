#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lattice-plugin-index-test-"));

try {
  const unsignedOfficial = {
    schema: "lattice.plugin.index.v1",
    generated_at: "2026-06-15T00:00:00Z",
    status: "official",
    publishers: [
      {
        id: "latticenet",
        name: "LatticeNet",
        public_key_ed25519: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    ],
    plugins: [],
    signatures: [],
  };
  const file = path.join(tmp, "unsigned-official.json");
  fs.writeFileSync(file, JSON.stringify(unsignedOfficial, null, 2));
  const result = spawnSync(process.execPath, [path.join(root, "scripts/validate-index.mjs"), file], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status === 0) {
    throw new Error("unsigned official index was accepted");
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes("official indexes require at least one signature")) {
    throw new Error(`unexpected validator output:\n${output}`);
  }
  console.log("plugin-index: validator contracts ok");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
