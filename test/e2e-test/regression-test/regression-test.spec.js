// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import supertest from 'supertest';
import express from 'express';
import {existsSync, readFileSync} from "fs";
import path, {extname, join} from 'path';
import routes from '../../../src/routes.js';
import {
    CDA_DATA_LOCATION,
    CDA_TEMPLATE_LOCATION,
    HL7V2_DATA_LOCATION,
    HL7V2_TEMPLATE_LOCATION
} from '../../../src/lib/constants/constants.js';
import cdaCases from './config/testcases-cda.js';
import hl7v2Cases from "./config/testcases-hl7v2.js";
import {compareContent, getGroundTruthFileName} from './util/utils.js';
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_TEST_TIME = 10000;

describe('Regression test - FHIR data validation', () => {
    const app = routes(express());
    const allCases = cdaCases().concat(hl7v2Cases());

    allCases.forEach(subCase => {
        it(`should output a valid FHIR data with ${subCase.dataFile} and ${subCase.templateFile}`, done => {
            const dataType = extname(subCase.dataFile);
            const meta = {
                '.cda': ['/api/v1/convert/cda', CDA_TEMPLATE_LOCATION, CDA_DATA_LOCATION, 'cda'],
                '.hl7': ['/api/v1/convert/hl7v2', HL7V2_TEMPLATE_LOCATION, HL7V2_DATA_LOCATION, 'hl7v2']
            };

            if (!Object.keys(meta).includes(dataType)) {
                return done(new Error(`The data type (${dataType}) is not supported.`));
            }

            const endpointURL = meta[dataType][0];
            const templateLocation = meta[dataType][1];
            const dataLocation = meta[dataType][2];
            const groundTruthLocation = join(__dirname, `./data/${meta[dataType][3]}`, subCase.templateFile);

            const templateFilePath = join(templateLocation, subCase.templateFile);
            const srcDataFilePath = join(dataLocation, subCase.dataFile);
            const groundTruthFilePath = join(groundTruthLocation, getGroundTruthFileName(subCase));
            const payload = {
                templateBase64: Buffer.from(readFileSync(templateFilePath)).toString('base64'),
                srcDataBase64: Buffer.from(readFileSync(srcDataFilePath)).toString('base64')
            };

            supertest(app).post(endpointURL).send(payload)
                .expect(200)
                .expect(response => {
                    const groundTruth = existsSync(groundTruthFilePath) ?
                        readFileSync(groundTruthFilePath, 'utf8') : '{}';
                    // TODO: the `unusedSegments` & `invalidAccess` still need to be tested
                    const result = JSON.stringify(response.body.fhirResource);
                    compareContent(result, groundTruth);
                    return true;
                })
                .end(done);
        }).timeout(MAX_TEST_TIME);
    });
});
