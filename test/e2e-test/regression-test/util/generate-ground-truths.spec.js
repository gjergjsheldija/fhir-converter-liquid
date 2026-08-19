// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { join, extname } from 'path';
import { strictEqual, ok } from 'assert';
import fs from 'fs-extra';
import cdaCases from '../config/testcases-cda.js';
import hl7v2Cases from '../config/testcases-hl7v2.js';
import { generate } from './generate-ground-truths.js';
import { getGroundTruthFileName } from './utils.js';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const MAX_TEST_TIME = 10000;

const clearTestDir = basePath => {
    if (fs.pathExistsSync(basePath)) {
        fs.removeSync(basePath);
    }
};

describe('Regression test generate-ground-truths - main', () => {
    const basePath = join(__dirname, '../data/test');
    const allCases = cdaCases().concat(hl7v2Cases());

    beforeEach('clean work directory before testing', () => clearTestDir(basePath));
    afterEach('clean work directory after testing', () => clearTestDir(basePath));
    after('clean work directory after all testing', () => clearTestDir(basePath));
    
    it ('should generate normal ground truth files in normal situations', async () => {
        try {
            const result = await generate(basePath);
            for (const subCase of allCases) {
                const domain = extname(subCase.dataFile) === '.hl7' ? 'hl7v2' : 'cda';
                const domainPath = join(basePath, domain);
                const filePath = join(domainPath, subCase.templateFile, getGroundTruthFileName(subCase));
                strictEqual(typeof result, 'object');
                ok(fs.pathExistsSync(filePath));
            }
        } catch (message) {
            return console.error(message);
        }
    }).timeout(MAX_TEST_TIME);
    it ('should return understandable prompt if truth files are exist', async () => {
        fs.ensureDirSync(join(basePath, 'cda'));
        fs.ensureDirSync(join(basePath, 'hl7v2'));
        try {
            const prompt = await generate(basePath);
            const trimedPrompt = prompt.split('\n').map(e => e.trim()).join('');
            strictEqual(trimedPrompt, `The truths files are already exist in ${basePath}.Please remove them manually for the normal operation of the program.`);
        } catch (message) {
            return console.error(message);
        }
    }).timeout(MAX_TEST_TIME);
    it ('should return understandable prompt if truth files are exist', async () => {
        for (const subCase of allCases) {
            const domain = extname(subCase.dataFile) === '.hl7' ? 'hl7v2' : 'cda';
            fs.ensureDirSync(join(basePath, domain, subCase.templateFile));
        }
        try {
            const prompt = await generate(basePath);
            const trimedPrompt = prompt.split('\n').map(e => e.trim()).join('');
            strictEqual(trimedPrompt, `The truths files are already exist in ${basePath}.Please remove them manually for the normal operation of the program.`);
        } catch (message) {
            return console.error(message);
        }
    });
});