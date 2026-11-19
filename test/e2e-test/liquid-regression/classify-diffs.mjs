import { readFileSync, writeFileSync, existsSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PIN = '253307fe6063a42b024ef7dbeb6aae157f1c2f61';

const countByType = (bundle) => {
    const counts = new Map();
    const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
    entries.forEach((entry) => {
        const type = entry?.resource?.resourceType || '(missing)';
        counts.set(type, (counts.get(type) || 0) + 1);
    });
    return { counts, total: entries.length };
};

export const entryDelta = (actualBundle, expectedBundle) => {
    const actual = countByType(actualBundle);
    const expected = countByType(expectedBundle);
    const types = new Set([...actual.counts.keys(), ...expected.counts.keys()]);
    const byType = [...types]
        .map((resourceType) => {
            const a = actual.counts.get(resourceType) || 0;
            const e = expected.counts.get(resourceType) || 0;
            return { resourceType, actual: a, expected: e, delta: a - e };
        })
        .filter((row) => row.delta !== 0)
        .sort((x, y) => (x.resourceType < y.resourceType ? -1 : x.resourceType > y.resourceType ? 1 : 0));
    return { actualCount: actual.total, expectedCount: expected.total, byType };
};

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const MAX_PATHS = 8;

const isContainer = (value) => value !== null && typeof value === 'object';

const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const sameInstant = (actual, expected) => {
    if (typeof actual !== 'string' || typeof expected !== 'string') {
        return false;
    }
    if (!DATE_TIME.test(actual) || !DATE_TIME.test(expected)) {
        return false;
    }
    const a = Date.parse(actual);
    return !Number.isNaN(a) && a === Date.parse(expected);
};

const diffPaths = (actual, expected, prefix, out) => {
    if (isContainer(actual) && isContainer(expected) && Array.isArray(actual) === Array.isArray(expected)) {
        const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
        keys.forEach((key) => diffPaths(actual[key], expected[key], prefix ? `${prefix}.${key}` : key, out));
        return;
    }
    if (actual !== expected && !sameInstant(actual, expected)) {
        out.push(prefix);
    }
};

const keyedResources = (bundle) => {
    const entries = Array.isArray(bundle?.entry) ? bundle.entry : [];
    const seen = new Map();
    const map = new Map();
    entries.forEach((entry) => {
        const resource = entry?.resource;
        const base = `${resource?.resourceType || '(missing)'}/${resource?.id || '(no id)'}`;
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        map.set(n === 1 ? base : `${base}#${n}`, resource);
    });
    return map;
};

export const contentDelta = (actualBundle, expectedBundle) => {
    const actual = keyedResources(actualBundle);
    const expected = keyedResources(expectedBundle);
    const unmatched = [];
    const fields = [];
    actual.forEach((resource, key) => {
        if (!expected.has(key)) {
            unmatched.push({ kind: 'extra', key });
            return;
        }
        const paths = [];
        diffPaths(resource, expected.get(key), '', paths);
        if (paths.length > 0) {
            fields.push({ key, paths: paths.sort(compareStrings).slice(0, MAX_PATHS) });
        }
    });
    expected.forEach((_resource, key) => {
        if (!actual.has(key)) {
            unmatched.push({ kind: 'missing', key });
        }
    });
    unmatched.sort((a, b) => compareStrings(a.key, b.key));
    fields.sort((a, b) => compareStrings(a.key, b.key));
    return { unmatched, fields };
};

const run = async () => {
    const { default: supertest } = await import('supertest');
    const { default: express } = await import('express');
    const { default: routes } = await import('../../../src/routes.js');
    const { compareContent } = await import('../util/compare.js');

    const testCases = JSON.parse(readFileSync(join(__dirname, 'testcases-hl7v2.json'), 'utf8'));
    const templateDir = join(__dirname, '../../../src/templates/Hl7v2');
    const dataDir = join(__dirname, '../liquid-fixtures/SampleData/Hl7v2');
    const expectedDir = join(__dirname, '../liquid-fixtures/Expected/Hl7v2');
    const app = routes(express());

    const cases = [];
    for (const testCase of testCases) {
        const expectedPath = join(expectedDir, testCase.template, testCase.expectedFile);
        const payload = {
            template: readFileSync(join(templateDir, `${testCase.template}.liquid`), 'utf8'),
            srcData: readFileSync(join(dataDir, testCase.dataFile), 'utf8')
        };
        const response = await supertest(app).post('/api/v1/convert/hl7v2').send(payload);
        if (response.status !== 200) {
            throw new Error(`${testCase.template} ${testCase.dataFile}: HTTP ${response.status}`);
        }
        const expectedText = existsSync(expectedPath) ? readFileSync(expectedPath, 'utf8') : '{}';
        const { actualCount, expectedCount, byType } = entryDelta(response.body.fhirResource, JSON.parse(expectedText));
        let status = 'pass';
        try {
            compareContent(JSON.stringify(response.body.fhirResource), expectedText);
        } catch {
            status = byType.length > 0 ? 'count' : 'content';
        }
        const row = { template: testCase.template, dataFile: testCase.dataFile, status, actualCount, expectedCount, byType };
        if (status === 'content') {
            row.contentDelta = contentDelta(response.body.fhirResource, JSON.parse(expectedText));
        }
        cases.push(row);
    }

    cases.sort((a, b) => compareStrings(a.template, b.template) || compareStrings(a.dataFile, b.dataFile));
    const summary = { cases: cases.length, pass: 0, count: 0, content: 0 };
    cases.forEach((c) => { summary[c.status] += 1; });
    if (summary.pass + summary.count + summary.content !== summary.cases || summary.cases !== testCases.length) {
        throw new Error('Classification summary does not cover every testcase');
    }
    writeFileSync(join(__dirname, 'classification.json'), `${JSON.stringify({ pin: PIN, summary, cases }, null, 2)}\n`);
    console.log(JSON.stringify(summary));
};

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
    run().then(() => process.exit(0), (err) => {
        console.error(err);
        process.exit(1);
    });
}
