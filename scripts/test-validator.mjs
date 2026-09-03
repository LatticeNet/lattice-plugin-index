#!/usr/bin/env node
// Negative-test harness for validate-train.mjs.
//
// A validator is only worth what its counterexamples prove. Every fixture in
// train/fixtures/invalid/ MUST be rejected; every file in train/examples/ MUST be
// accepted. Two of these fixtures are real bugs found in review on 2026-07-28 — a
// plain train carrying the server's `alpha-X.Y.ZaN` image tag, and a plugin version
// that was not a version at all. Both passed the first validator. They stay here so
// they cannot pass a future one.

import { readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const run = (file) => {
  try {
    execFileSync(process.execPath, ["scripts/validate-train.mjs", file], { stdio: "pipe" });
    return { ok: true, out: "" };
  } catch (e) {
    return { ok: false, out: String(e.stderr ?? "") };
  }
};

let failures = 0;
const list = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : []);

for (const f of list("train/examples")) {
  const r = run(join("train/examples", f));
  if (r.ok) console.log(`PASS (accepted)  ${f}`);
  else { console.error(`FAIL: valid example rejected: ${f}\n${r.out}`); failures++; }
}

const invalid = list("train/fixtures/invalid");
if (invalid.length === 0) { console.error("FAIL: no invalid fixtures — the harness proves nothing"); failures++; }
for (const f of invalid) {
  const r = run(join("train/fixtures/invalid", f));
  if (!r.ok) console.log(`PASS (rejected)  ${f}  ->  ${r.out.trim().split("\n")[0].split(": ").slice(1).join(": ")}`);
  else { console.error(`FAIL: invalid fixture ACCEPTED: ${f}`); failures++; }
}

if (failures) { console.error(`\n${failures} harness failure(s)`); process.exit(1); }
console.log(`\nvalidator harness: ${list("train/examples").length} accepted, ${invalid.length} rejected, as intended`);
