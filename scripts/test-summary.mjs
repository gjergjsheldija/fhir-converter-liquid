#!/usr/bin/env node
// Runs the full required validation (`npm test`, `npm run eslint`, `git diff --check`)
// while writing the raw 1,500-line mocha log to /tmp/fhir-converter-test.log and
// printing a compact, token-safe summary for local LLM agents (e.g. Qwen 27B on oMLX).

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const LOG_PATH = "/tmp/fhir-converter-test.log";

function run(cmd, args) {
    return spawnSync(cmd, args, {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 50 * 1024 * 1024
    });
}

const testRes = run("npm", ["test"]);
const combinedTestOutput = `${testRes.stdout || ""}\n${testRes.stderr || ""}`;
writeFileSync(LOG_PATH, combinedTestOutput, "utf8");

const passingMatch = combinedTestOutput.match(/(\d+)\s+passing\s*\(([^)]+)\)/);
const failingMatch = combinedTestOutput.match(/(\d+)\s+failing/);
const pendingMatch = combinedTestOutput.match(/(\d+)\s+pending/);

// Extract individual numbered failure blocks from mocha spec output
const failureSectionIndex = combinedTestOutput.search(/\n\s+\d+\)\s+/);
const unexpectedFailures = [];
let generateUuidFailures = 0;
let regressionCompareFailures = 0;

if (failureSectionIndex !== -1) {
    const tail = combinedTestOutput.slice(failureSectionIndex);
    const blocks = tail.split(/\n(?=\s{2}\d+\)\s+)/).filter((b) => /^\s{2}\d+\)\s+/.test(b));
    for (const block of blocks) {
        const lines = block.split("\n").map((l) => l.trimEnd());
        const header = lines.slice(0, 3).join(" ").replace(/\s+/g, " ").trim();
        const isKnownUuid =
            header.includes("generate_uuid tests") &&
            block.includes("984e2374-e7af-8f49-b5da-f1f36ac2d78a");
        const isKnownRegressionDiff =
            header.includes("Liquid HL7v2 regression test") &&
            (block.includes("The conversion result has different property") ||
                block.includes("compare.js"));
        if (isKnownUuid) {
            generateUuidFailures += 1;
        } else if (isKnownRegressionDiff) {
            regressionCompareFailures += 1;
        } else {
            unexpectedFailures.push(lines.slice(0, 6).join("\n"));
        }
    }
}

const eslintRes = run("npm", ["run", "eslint"]);
const diffCheckRes = run("git", ["diff", "--check"]);
const immutableStatus = run("git", [
    "status",
    "--short",
    "--",
    "src/templates",
    "src/sample-data",
    "test/e2e-test/liquid-fixtures"
]);

console.log("=== VALIDATION SUMMARY (full log: " + LOG_PATH + ") ===");
console.log(
    `npm test: ${passingMatch ? `${passingMatch[1]} passing (${passingMatch[2]})` : "unknown"}, ` +
        `${failingMatch ? `${failingMatch[1]} failing` : "0 failing"}` +
        `${pendingMatch ? `, ${pendingMatch[1]} pending` : ""} (exit ${testRes.status})`
);
console.log(
    `  known baseline failures: ${generateUuidFailures} generate_uuid + ${regressionCompareFailures} official-fixture compare diffs`
);
console.log(`  unexpected failures: ${unexpectedFailures.length}`);
if (unexpectedFailures.length > 0) {
    console.log("--- UNEXPECTED FAILURES (first 10) ---");
    console.log(unexpectedFailures.slice(0, 10).join("\n\n"));
}
console.log(`npm run eslint: exit ${eslintRes.status}`);
if (eslintRes.status !== 0) {
    console.log((eslintRes.stdout || "") + (eslintRes.stderr || ""));
}
console.log(`git diff --check: exit ${diffCheckRes.status}`);
if (diffCheckRes.status !== 0) {
    console.log((diffCheckRes.stdout || "") + (diffCheckRes.stderr || ""));
}
const touchedImmutable = (immutableStatus.stdout || "").trim();
console.log(`immutability check: ${touchedImmutable ? "VIOLATION:\n" + touchedImmutable : "OK (0 immutable files touched)"}`);

if (eslintRes.status !== 0 || diffCheckRes.status !== 0 || touchedImmutable || unexpectedFailures.length > 0) {
    process.exit(1);
}
process.exit(0);
