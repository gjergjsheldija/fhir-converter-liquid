#!/usr/bin/env node
// Deterministic pre-review gate for one spec. No model involved.
//   node scripts/spec-gate.mjs snapshot            (run BEFORE the implementer)
//   node scripts/spec-gate.mjs check <spec-path>   (run AFTER; exit 1 on violation)
// Worktree may already be dirty, so "changed" = file hash differs from the snapshot.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const SNAP = "/tmp/spec-gate-snapshot.json";
const IMMUTABLE = ["src/templates/", "src/service-templates/", "src/sample-data/", "test/e2e-test/liquid-fixtures/"];
const git = (...a) => execFileSync("git", a, { encoding: "utf8" });

function state() {
    const files = git("status", "--porcelain", "-uall", "-z").split("\0").filter(Boolean)
        .map((l) => l.slice(3));
    return Object.fromEntries(files.map((f) => [f, existsSync(f) ? git("hash-object", f).trim() : "deleted"]));
}

const [cmd, spec] = process.argv.slice(2);
if (cmd === "snapshot") {
    writeFileSync(SNAP, JSON.stringify(state()));
    console.log("snapshot saved");
    process.exit(0);
}
if (cmd !== "check" || !spec) {
    console.error("usage: spec-gate.mjs snapshot | check <spec-path>");
    process.exit(2);
}

const before = JSON.parse(readFileSync(SNAP, "utf8"));
const after = state();
const changed = Object.keys(after).filter((f) => before[f] !== after[f]);

const section = readFileSync(spec, "utf8").split(/^## 3\. Files you may edit$/m)[1]?.split(/^## /m)[0] ?? "";
const allowed = [...section.matchAll(/^- `([^`]+)`/gm)].map((m) => m[1]);
allowed.push(spec, join(dirname(spec), "00-order.md"));
const ok = (f) => allowed.some((p) => (p.includes("*") ? new RegExp("^" + p.replace(/\*+/g, ".*") + "$").test(f) : p === f));

const problems = [];
if (!section) problems.push(`no "## 3. Files you may edit" section in ${spec}`);
for (const f of changed) {
    if (!ok(f)) problems.push(`out of scope: ${f}`);
    if (IMMUTABLE.some((p) => f.startsWith(p))) problems.push(`immutable path touched: ${f}`);
    if (/^src\/static\/js\/[^/]+\.js$/.test(f) && existsSync(f) && /^\s*(import|export)\s/m.test(readFileSync(f, "utf8"))) {
        problems.push(`import/export in classic script: ${f}`);
    }
}
if (/package(-lock)?\.json/.test(changed.join())) problems.push("package.json/lock changed (no new deps allowed)");

console.log(`changed: ${changed.join(", ") || "(none)"}`);
console.log(problems.length ? "GATE: FAIL\n" + problems.join("\n") : "GATE: PASS");
process.exit(problems.length ? 1 : 0);
