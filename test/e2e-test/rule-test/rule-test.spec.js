// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import supertest from "supertest";
import {readFileSync} from "fs";
import {extname, join} from "path";
import {
    CDA_DATA_LOCATION,
    CDA_TEMPLATE_LOCATION,
    HL7V2_DATA_LOCATION,
    HL7V2_TEMPLATE_LOCATION,
} from "../../../src/lib/constants/constants.js";
import express from "express";
import routes from "../../../src/routes.js";
import cdaCases from "./config/testcases-cda.js";
import hl7v2Cases from "./config/testcases-hl7v2.js";

var app = routes(express());

const opTests = cdaCases().concat(hl7v2Cases());

describe("E2E test - FHIR data validation", function () {

    opTests.forEach((t) => {
        it(
            "should output a valid FHIR data with " +
            t.dataFile +
            " and " +
            t.templateFile,
            function (done) {
                var dataType = extname(t.dataFile);
                var endpointURL = "";
                var templateLocation = "";
                var dataLocation = "";
                var requestJson = {
                    templateBase64: "",
                    srcDataBase64: "",
                };

                if (dataType === ".hl7") {
                    endpointURL = "/api/v1/convert/hl7v2";
                    templateLocation = HL7V2_TEMPLATE_LOCATION;
                    dataLocation = HL7V2_DATA_LOCATION;
                } else if (dataType === ".cda") {
                    endpointURL = "/api/v1/convert/cda";
                    templateLocation = CDA_TEMPLATE_LOCATION;
                    dataLocation = CDA_DATA_LOCATION;
                } else {
                    done(new Error("The data type (" + dataType + ") is not supported."));
                }
                requestJson.srcDataBase64 = Buffer.from(
                    readFileSync(join(dataLocation, t.dataFile))
                ).toString("base64");
                requestJson.templateBase64 = Buffer.from(
                    readFileSync(join(templateLocation, t.templateFile))
                ).toString("base64");

                supertest(app)
                    .post(endpointURL)
                    .send(requestJson)
                    .expect(200)
                    .expect((response) => {
                        t.testRules.every((testRule) => {
                            var result = testRule(requestJson, response.body.fhirResource);
                            if (result.valid === false) {
                                throw new Error(
                                    testRule.name + " validation failed.\n" + result.errorMessage
                                );
                            }
                            return true;
                        });
                    })
                    .end((err) => {
                        if (err) {
                            done(err);
                        } else {
                            done();
                        }
                    });
            }
        ).timeout(30000);
    });
});
