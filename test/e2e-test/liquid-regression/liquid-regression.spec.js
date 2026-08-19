import supertest from 'supertest';
import express from 'express';
import { readFileSync, existsSync } from 'fs';
import path, { join } from 'path';
import { fileURLToPath } from 'url';
import routes from '../../../src/routes.js';
import { compareContent } from '../regression-test/util/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testCases = JSON.parse(readFileSync(join(__dirname, 'testcases-hl7v2.json'), 'utf8'));

const TEMPLATE_LOCATION = join(__dirname, '../../../src/templates/Hl7v2');
const DATA_LOCATION = join(__dirname, '../liquid-fixtures/SampleData/Hl7v2');
const EXPECTED_LOCATION = join(__dirname, '../liquid-fixtures/Expected/Hl7v2');
const MAX_TEST_TIME = 10000;

describe('Liquid HL7v2 regression test - matches upstream expected output', () => {
    const app = routes(express());

    testCases.forEach((testCase) => {
        it(`should convert ${testCase.dataFile} with ${testCase.template} matching upstream output`, (done) => {
            const templatePath = join(TEMPLATE_LOCATION, `${testCase.template}.liquid`);
            const dataPath = join(DATA_LOCATION, testCase.dataFile);
            const expectedPath = join(EXPECTED_LOCATION, testCase.template, testCase.expectedFile);

            const payload = {
                templateBase64: Buffer.from(readFileSync(templatePath)).toString('base64'),
                srcDataBase64: Buffer.from(readFileSync(dataPath)).toString('base64')
            };

            supertest(app).post('/api/v1/convert/hl7v2').send(payload)
                .expect(200)
                .expect((response) => {
                    const expected = existsSync(expectedPath) ? readFileSync(expectedPath, 'utf8') : '{}';
                    const result = JSON.stringify(response.body.fhirResource);
                    compareContent(result, expected);
                    return true;
                })
                .end(done);
        }).timeout(MAX_TEST_TIME);
    });
});
