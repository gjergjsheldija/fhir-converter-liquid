// One-time generator: parses upstream's BaseConvertDataFunctionalTests.cs
// GetDataForHl7v2() test list into testcases-hl7v2.json. Re-run this only
// if UPSTREAM_VERSION.md's pin changes.
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const upstreamCsPath = process.argv[2];
if (!upstreamCsPath) {
    console.error("Usage: node generate-testcases.js <path-to-BaseConvertDataFunctionalTests.cs>");
    process.exit(1);
}

const src = readFileSync(upstreamCsPath, "utf8");
const methodMatch = src.match(/GetDataForHl7v2[\s\S]*?data = new List<string\[\]>\s*{([\s\S]*?)};/);
if (!methodMatch) {
    console.error("Could not locate GetDataForHl7v2's data list in the given file");
    process.exit(1);
}

const lineRegex = /new\[\]\s*{\s*@"([^"]+)"\s*,\s*@"([^"]+)"\s*,\s*@"([^"]+)"\s*}/g;
const cases = [];
let match;
while ((match = lineRegex.exec(methodMatch[1])) !== null) {
    cases.push({ template: match[1], dataFile: match[2], expectedFile: match[3] });
}

if (cases.length === 0) {
    console.error("Extraction matched 0 cases — the source file's format may have changed");
    process.exit(1);
}

const fixturesRoot = join(__dirname, "..", "liquid-fixtures");
let missing = 0;
for (const c of cases) {
    const dataPath = join(fixturesRoot, "SampleData", "Hl7v2", c.dataFile);
    const expectedPath = join(fixturesRoot, "Expected", "Hl7v2", c.template, c.expectedFile);
    if (!existsSync(dataPath)) { console.error(`Missing sample data: ${dataPath}`); missing++; }
    if (!existsSync(expectedPath)) { console.error(`Missing expected output: ${expectedPath}`); missing++; }
}
if (missing > 0) {
    console.error(`${missing} referenced fixture file(s) missing — check Task 1's vendoring`);
    process.exit(1);
}

writeFileSync(join(__dirname, "testcases-hl7v2.json"), JSON.stringify(cases, null, 2));
console.log(`Wrote ${cases.length} test cases to testcases-hl7v2.json`);
