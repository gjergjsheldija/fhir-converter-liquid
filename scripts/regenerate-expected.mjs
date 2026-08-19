#!/usr/bin/env node
/**
 * Regenerates expected JSON files from Microsoft liquid templates.
 * Run this after merging upstream template changes to update baselines.
 * 
 * Usage:
 *   node scripts/regenerate-expected.mjs [--dry-run] [--filter=ADT_A01]
 * 
 * Options:
 *   --dry-run    Show what would be regenerated without writing files
 *   --filter=X   Only regenerate files matching pattern X (e.g., ADT_A01, SIU)
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import supertest from 'supertest';
import express from 'express';
import routes from '../src/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');

const TEMPLATE_DIR = join(ROOT, 'src/templates/Hl7v2');
const DATA_DIR = join(ROOT, 'test/e2e-test/liquid-fixtures/SampleData/Hl7v2');
const EXPECTED_DIR = join(ROOT, 'test/e2e-test/liquid-fixtures/Expected/Hl7v2');
const TEST_CASES_FILE = join(ROOT, 'test/e2e-test/liquid-regression/testcases-hl7v2.json');

// Parse CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const filterArg = args.find(a => a.startsWith('--filter='));
const filter = filterArg ? filterArg.split('=')[1] : null;

const testCases = JSON.parse(readFileSync(TEST_CASES_FILE, 'utf8'));
const filtered = filter 
    ? testCases.filter(tc => tc.template.includes(filter) || tc.dataFile.includes(filter))
    : testCases;

console.log(`Regenerating ${filtered.length} expected files${filter ? ` (filter: ${filter})` : ''}`);
if (dryRun) console.log('DRY RUN - no files will be written\n');

const app = routes(express());

async function convertOne(testCase) {
    const { template, dataFile, expectedFile } = testCase;
    const templatePath = join(TEMPLATE_DIR, `${template}.liquid`);
    const dataPath = join(DATA_DIR, dataFile);
    const expectedPath = join(EXPECTED_DIR, template, expectedFile);

    if (!existsSync(templatePath)) {
        return { status: 'skip', reason: `template not found: ${template}.liquid`, testCase };
    }
    if (!existsSync(dataPath)) {
        return { status: 'skip', reason: `data not found: ${dataFile}`, testCase };
    }

    const payload = {
        templateBase64: Buffer.from(readFileSync(templatePath)).toString('base64'),
        srcDataBase64: Buffer.from(readFileSync(dataPath)).toString('base64')
    };

    return new Promise((resolve) => {
        supertest(app)
            .post('/api/v1/convert/hl7v2')
            .send(payload)
            .expect(200)
            .end((err, response) => {
                if (err) {
                    resolve({ status: 'error', reason: err.message, testCase });
                    return;
                }

                const fhirResource = response.body.fhirResource;
                const content = JSON.stringify(fhirResource, null, 2);

                if (dryRun) {
                    resolve({ status: 'would-write', path: expectedPath, testCase });
                } else {
                    // Ensure directory exists
                    const dir = dirname(expectedPath);
                    if (!existsSync(dir)) {
                        mkdirSync(dir, { recursive: true });
                    }
                    writeFileSync(expectedPath, content, 'utf8');
                    resolve({ status: 'written', path: expectedPath, testCase });
                }
            });
    });
}

// Process in batches to avoid overwhelming
async function processAll() {
    const results = { written: 0, skipped: 0, errors: 0 };
    const BATCH_SIZE = 10;

    for (let i = 0; i < filtered.length; i += BATCH_SIZE) {
        const batch = filtered.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(batch.map(convertOne));

        for (const r of batchResults) {
            if (r.status === 'written' || r.status === 'would-write') {
                results.written++;
                console.log(`✓ ${r.testCase.template}/${r.testCase.expectedFile}`);
            } else if (r.status === 'skip') {
                results.skipped++;
                console.log(`⊘ SKIP: ${r.testCase.dataFile} - ${r.reason}`);
            } else {
                results.errors++;
                console.log(`✗ ERROR: ${r.testCase.dataFile} - ${r.reason}`);
            }
        }
    }

    console.log(`\nDone: ${results.written} ${dryRun ? 'would be ' : ''}written, ${results.skipped} skipped, ${results.errors} errors`);
    process.exit(results.errors > 0 ? 1 : 0);
}

processAll().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
