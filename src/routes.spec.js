// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {constants, BASE_TEMPLATE_FILES_LOCATION, TEMPLATE_FILES_LOCATION} from './lib/constants/constants.js';
import supertest from 'supertest';
import express from 'express';
import routes from './routes.js';
import {mkdtemp, rm, unlink, writeFile} from 'fs/promises';
import {readFileSync} from 'fs';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import {tmpdir} from 'os';
import assert from 'assert';
import {ExtraDynamicFieldInterceptor} from '../test/e2e-test/util/interceptors.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = routes(express());

describe("GET /", function () {
    it("should return status code 200", function (done) {
        supertest(app)
            .get("/")
            .expect(200)
            .end(function (err) {
                if (err) done(err);
                done();
            });
    });
});

describe("GET /api-docs.json", function () {
    it("should return status code 200", function (done) {
        supertest(app)
            .get("/api-docs.json")
            .expect(200)
            .end(function (err) {
                if (err) done(err);
                done();
            });
    });
});

describe("GET /api/v1/helpers", function () {
    it("should return status code 200 and contain an array", function (done) {
        supertest(app)
            .get("/api/v1/helpers")
            .expect(200)
            .expect(function (response) {
                if (!Array.isArray(response.body.helpers)) {
                    throw new Error('Response is not array');
                }
                var helpers = response.body.helpers;
                if (!helpers.some(function (helper) {
                    return helper.name === 'get_segment_lists';
                })) {
                    throw new Error('Missing get_segment_lists helper');
                }
                helpers.forEach(function (helper) {
                    if (typeof helper.name !== 'string' || typeof helper.description !== 'string') {
                        throw new Error('Helper name and description must be strings');
                    }
                    if ('func' in helper) {
                        throw new Error('Helper must not include func');
                    }
                });
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });
});

describe("GET /api/v1/parsers", function () {
    it("should return status code 200 and contain an array", function (done) {
        supertest(app)
            .get("/api/v1/parsers")
            .expect(200)
            .expect(function (response) {
                if (!Array.isArray(response.body)) {
                    throw new Error('Response is not array');
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

});

describe("GET /api/v1/sample-data", function () {
    it("should return status code 200 and contain an array", function (done) {
        supertest(app)
            .get("/api/v1/sample-data")
            .expect(200)
            .expect(function (response) {
                if (!Array.isArray(response.body.messages)) {
                    throw new Error('Response is not array');
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });
});

describe("/api/v1/sample-data (wrong configuration)", function () {
    before(function () {
        // Deep copy constants
        var myConstants = JSON.parse(JSON.stringify(app.getConstants()));
        myConstants.SAMPLE_DATA_LOCATION = "/foo/bar";
        app.setConstants(myConstants);
    });

    after(function () {
        app.setConstants(constants);
    });

    it("GET should return 404 when configured with wrong storage location", function (done) {
        supertest(app)
            .get("/api/v1/sample-data")
            .expect(404, {
                error: {
                    code: "NotFound", message: "Unable to access sample data location"
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });
});

describe("GET /api/v1/sample-data/:file", function () {
    before(function () {
        var myConstants = JSON.parse(JSON.stringify(app.getConstants()));
        app.setConstants(myConstants);
    });


    it("should return status code 200 when getting ADT01-23.hl7", function (done) {
        supertest(app)
            .get("/api/v1/sample-data/hl7v2/ADT01-23.hl7")
            .expect(200)
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("should return status code 404 when getting foobar.hl7", function (done) {
        supertest(app)
            .get("/api/v1/sample-data/hl7v2/foobar.hl7")
            .expect(404, {
                error: {
                    code: "NotFound", message: "Sample data not found"
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });
});

describe("/api/v1/sample-data user samples (temporary USER_SAMPLE_DATA_LOCATION)", function () {
    let userSampleDir;

    before(async function () {
        userSampleDir = await mkdtemp(join(tmpdir(), 'fhir-user-samples-'));
        var myConstants = JSON.parse(JSON.stringify(app.getConstants()));
        myConstants.USER_SAMPLE_DATA_LOCATION = userSampleDir;
        app.setConstants(myConstants);
    });

    after(async function () {
        app.setConstants(constants);
        await rm(userSampleDir, {recursive: true, force: true});
    });

    it("PUT then list and read a user sample", function (done) {
        supertest(app)
            .put("/api/v1/sample-data/hl7v2/custom-adt.hl7")
            .send("MSH|^~\\&|SEND|RECV|FAC|DEST|20240101120000||ADT^A04^ADT_A04|MSG00001|P|2.5")
            .type("text/plain")
            .expect(200, {ok: true, messageName: "hl7v2/custom-adt.hl7", source: "user"})
            .expect(function () {
                supertest(app)
                    .get("/api/v1/sample-data")
                    .expect(200)
                    .expect(function (listResponse) {
                        var userEntry = listResponse.body.messages.filter(function (item) {
                            return item.messageName === "hl7v2/custom-adt.hl7";
                        })[0];
                        if (!userEntry || userEntry.source !== "user") {
                            throw new Error("User sample missing from list or missing source: user");
                        }
                        supertest(app)
                            .get("/api/v1/sample-data/hl7v2/custom-adt.hl7")
                            .expect(200)
                            .end(function (readErr, readResponse) {
                                if (readErr) {
                                    done(readErr);
                                    return;
                                }
                                if (readResponse.text.indexOf("MSH|^~\\&|") === -1) {
                                    done(new Error("User sample content mismatch"));
                                    return;
                                }
                                done();
                            });
                    })
                    .end(function (listErr) {
                        if (listErr) {
                            done(listErr);
                        }
                    });
            })
            .end(function (err) {
                if (err) {
                    done(err);
                }
            });
    });

    it("PUT over a built-in sample returns 409", function (done) {
        supertest(app)
            .put("/api/v1/sample-data/hl7v2/ADT04-23.hl7")
            .send("MSH|^~\\&|")
            .type("text/plain")
            .expect(409, {
                error: {
                    code: "Conflict", message: "Cannot overwrite a built-in sample. Save under a new file name."
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("PUT with a path-escaping file name returns 400", function (done) {
        supertest(app)
            .put("/api/v1/sample-data/hl7v2/..%2Fescape.hl7")
            .send("MSH|^~\\&|")
            .type("text/plain")
            .expect(400)
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("PUT with an unsupported extension returns 400", function (done) {
        supertest(app)
            .put("/api/v1/sample-data/hl7v2/custom.hl7json")
            .send("MSH|^~\\&|")
            .type("text/plain")
            .expect(400, {
                error: {
                    code: "BadRequest", message: "Sample file must end in .hl7, .txt, or .msg."
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("PUT with an empty body returns 400", function (done) {
        supertest(app)
            .put("/api/v1/sample-data/hl7v2/custom-adt.hl7")
            .send("   ")
            .type("text/plain")
            .expect(400, {
                error: {
                    code: "BadRequest", message: "Sample message cannot be empty."
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("PUT with a bare file name appends .hl7", function (done) {
        supertest(app)
            .put("/api/v1/sample-data/hl7v2/bare-sample")
            .send("MSH|^~\\&|")
            .type("text/plain")
            .expect(200, {ok: true, messageName: "hl7v2/bare-sample.hl7", source: "user"})
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("DELETE on a user sample returns 200", function (done) {
        supertest(app)
            .delete("/api/v1/sample-data/hl7v2/custom-adt.hl7")
            .expect(200)
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("DELETE on a built-in sample returns 403", function (done) {
        supertest(app)
            .delete("/api/v1/sample-data/hl7v2/ADT04-23.hl7")
            .expect(403, {
                error: {
                    code: "Unauthorized", message: "Built-in samples cannot be deleted."
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });
});

describe("/api/v1/templates", function () {
    before(function () {
        var myConstants = JSON.parse(JSON.stringify(app.getConstants()));
        app.setConstants(myConstants);
    });


    it("GET should return status code 200 and return an array", function (done) {
        supertest(app)
            .get("/api/v1/templates")
            .expect(200)
            .expect(function (response) {
                if (!Array.isArray(response.body.templates)) {
                    throw new Error('Response is not array');
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it("GET should contain an array of template names that cannot start with . (dot)", function (done) {
        supertest(app)
            .get("/api/v1/templates")
            .expect(200)
            .expect(function (response) {
                for (var i = 0; i < response.body.templates.length; i++) {
                    if (response.body.templates[i].templateName.startsWith('.')) {
                        throw new Error('Response array contains elements starting with . (dot)');
                    }
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });
});

describe("/api/v1/templates (wrong configuration)", function () {
    before(function () {
        // Deep copy constants
        var myConstants = JSON.parse(JSON.stringify(app.getConstants()));
        myConstants.TEMPLATE_FILES_LOCATION = "/foo/bar";
        app.setConstants(myConstants);
    });

    after(function () {
        app.setConstants(constants);
    });

    it("GET should return 404 when configured with wrong storage location", function (done) {
        supertest(app)
            .get("/api/v1/templates")
            .expect(404, {
                error: {
                    code: "NotFound", message: "Unable to access templates location"
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });
});

describe("GET /api/v1/templates/:file", function () {
    before(function () {
        var myConstants = JSON.parse(JSON.stringify(app.getConstants()));
        app.setConstants(myConstants);
    });

    it("should return status code 200 for ADT_A01.liquid", function (done) {
        supertest(app)
            .get("/api/v1/templates/Hl7v2/ADT_A01.liquid")
            .expect(200)
            .end(function (err) {
                if (err) done(err); else done();
            });
    });

    it("should return status code 404 for nonExistingTemplate.liquid", function (done) {
        supertest(app)
            .get("/api/v1/templates/nonExistingTemplate.liquid")
            .expect(404, {
                error: {
                    code: "NotFound", message: "Template not found"
                }
            })
            .end(function (err) {
                if (err) done(err);
                done();
            });
    });
});

describe('POST /api/v1/convert/hl7v2 (inline conversion)', function () {
    const validMessage = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||';

    it('should return 400 Bad Request when srcData is not a string (payload without a message)', function (done) {
        // srcData is now a plain JSON value; omitting it (undefined) is a 400.
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({srcData: 123})
            .expect(400, {
                error: {
                    code: "BadRequest",
                    message: "srcData must be a string."
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 400 Bad Request when srcData is missing entirely', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({})
            .expect(400, {
                error: {
                    code: "BadRequest",
                    message: "srcData must be a string."
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 400 Bad Request when templatesOverride is not a JSON object', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                template: '{}',
                srcData: validMessage,
                templatesOverride: ['not', 'an', 'object']
            })
            .expect(400, {
                error: {
                    code: "BadRequest", message: "templatesOverride must be a JSON object."
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 400 Bad Request when given a payload with an invalid HL7 message', function (done) {
        // This test passes a message with first segment "MSQ" (instead of MSH)
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                srcData: 'MSQ|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||'
            })
            .expect(400, {
                error: {
                    code: "BadRequest",
                    message: "Unable to parse input data. Error: Invalid HL7 v2 message, first segment id = MSQ"
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 200 OK for valid message with an empty template', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                srcData: validMessage
            })
            .expect(200)
            .expect(function (response) {
                if (!Array.isArray(response.body.v2.data)) {
                    throw new Error('Response is not array');
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 200 OK for valid message without a template', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({srcData: validMessage})
            .expect(200)
            .expect(function (response) {
                if (!Array.isArray(response.body.v2.data)) {
                    throw new Error('Response is not array');
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 200 OK with detailed report for valid message with valid template and report fields declaration', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2?unusedSegments=true&invalidAccess=true")
            .send({
                template: '{}',
                srcData: validMessage,
                templatesOverride: {}
            })
            // unusedSegments field/component indices below were corrected against real,
            // verified output: this rich field model is 1-indexed for Components (index 0
            // is null padding, matching upstream) and Fields[N] equals conventional HL7
            // field N (MSH-3 "AccMgr" is Fields[3], not Fields[2]).
            .expect(200, {
                'fhirResource': {}, 'unusedSegments': [{
                    "field": [{
                        "component": [{
                            "index": 1, "value": "AccMgr"
                        }

                        ], "index": 3
                    }, {
                        "component": [{
                            "index": 1, "value": "1"
                        }

                        ], "index": 4
                    }, {
                        "component": [{
                            "index": 1, "value": "20050110045504"
                        }

                        ], "index": 7
                    }, {
                        "component": [{
                            "index": 1, "value": "ADT"
                        }, {
                            "index": 2, "value": "A01"
                        }


                        ], "index": 9
                    }, {
                        "component": [{
                            "index": 1, "value": "599102"
                        }

                        ], "index": 10
                    }, {
                        "component": [{
                            "index": 1, "value": "P"
                        }

                        ], "index": 11
                    }, {
                        "component": [{
                            "index": 1, "value": "2.3"
                        }

                        ], "index": 12
                    }], "line": 0, "type": "MSH"
                }]
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 200 OK without detailed report for valid message with valid template', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                template: '{}',
                srcData: validMessage,
                templatesOverride: {}
            })
            .expect(200, {
                'fhirResource': {}
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 200 OK with single detailed report(unusedSegments) for valid message with valid template and single report field declaration', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2?unusedSegments=true")
            .send({
                template: '{}',
                srcData: validMessage,
                templatesOverride: {}
            })
            .expect(200, {
                'fhirResource': {}, 'unusedSegments': [{
                    "field": [{
                        "component": [{
                            "index": 1, "value": "AccMgr"
                        }

                        ], "index": 3
                    }, {
                        "component": [{
                            "index": 1, "value": "1"
                        }

                        ], "index": 4
                    }, {
                        "component": [{
                            "index": 1, "value": "20050110045504"
                        }

                        ], "index": 7
                    }, {
                        "component": [{
                            "index": 1, "value": "ADT"
                        }, {
                            "index": 2, "value": "A01"
                        }


                        ], "index": 9
                    }, {
                        "component": [{
                            "index": 1, "value": "599102"
                        }

                        ], "index": 10
                    }, {
                        "component": [{
                            "index": 1, "value": "P"
                        }

                        ], "index": 11
                    }, {
                        "component": [{
                            "index": 1, "value": "2.3"
                        }

                        ], "index": 12
                    }], "line": 0, "type": "MSH"
                }]
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 400 Bad Request when given a payload with valid message but invalid template', function (done) {
        // Template contains invalid Liquid syntax (unknown tag).
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                template: '{% badtag %}',
                srcData: validMessage
            })
            .expect(400)
            .expect(function (response) {
                if (response.body.error.code !== "BadRequest") {
                    throw("unexpected error code!");
                }
                if (!response.body.error.message.includes('tag "badtag" not found')) {
                    throw("unexpected error message!");
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 200 OK when given a payload with valid message and template with extra commas', function (done) {
        // Template: { , ,"a" : "1",,,,"b" : [, "c" , ,"d",,], ,}
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                template: '{ , ,"a" : "1",,,,"b" : [, "c" , ,"d",,], ,}',
                srcData: validMessage
            })
            .expect(200)
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 400 Bad Request when given a payload with an invalid HL7 srcData but valid template', function (done) {
        // A lone backslash is not a valid HL7 message.
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({template: '{}', srcData: '\\'})
            .expect(400, {
                error: {
                    code: "BadRequest",
                    message: "Unable to parse input data. Error: Invalid HL7 v2 message, first segment id = \\"
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 400 Bad Request when given a payload that references a non existent include template', function (done) {
        // Template: {% include 'nonExistentPartial' %}
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                template: "{% include 'nonExistentPartial' %}",
                srcData: validMessage
            })
            .expect(400)
            .expect(function (response) {
                if (response.body.error.code !== "BadRequest") {
                    throw("unexpected error code!");
                }
                if (!response.body.error.message.includes('Failed to lookup "nonExistentPartial"')) {
                    throw("unexpected error message!");
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    describe('debug=true opt-in metadata', function () {
        const adtSrcData = readFileSync(join(__dirname, 'sample-data', 'hl7v2', 'ADT04-23.hl7'), 'utf8');
        const adtTemplate = readFileSync(join(__dirname, 'templates', 'Hl7v2', 'ADT_A04.liquid'), 'utf8');

        it('should not return a debugInfo key when debug is not requested', async function () {
            const response = await supertest(app)
                .post("/api/v1/convert/hl7v2?unusedSegments=true")
                .send({
                    template: adtTemplate,
                    srcData: adtSrcData,
                    templatesOverride: {}
                })
                .expect(200);
            assert(!('debugInfo' in response.body), 'debugInfo must be absent without ?debug=true');
            assert(Array.isArray(response.body.unusedSegments), 'unusedSegments must still be present');
        });

        it('should return identical unusedSegments and fhirResource with and without debug=true', async function () {
            const payload = {
                template: adtTemplate,
                srcData: adtSrcData,
                templatesOverride: {}
            };
            const plain = await supertest(app)
                .post("/api/v1/convert/hl7v2?unusedSegments=true&invalidAccess=true")
                .send(payload)
                .expect(200);
            const debugged = await supertest(app)
                .post("/api/v1/convert/hl7v2?unusedSegments=true&invalidAccess=true&debug=true")
                .send(payload)
                .expect(200);
            assert.deepStrictEqual(debugged.body.unusedSegments, plain.body.unusedSegments,
                'unusedSegments must be identical with and without debug=true');
            assert.deepStrictEqual(debugged.body.invalidAccess, plain.body.invalidAccess,
                'invalidAccess must be identical with and without debug=true');
            const interceptor = new ExtraDynamicFieldInterceptor();
            assert.deepStrictEqual(
                interceptor.handle(JSON.parse(JSON.stringify(debugged.body.fhirResource))),
                interceptor.handle(JSON.parse(JSON.stringify(plain.body.fhirResource))),
                'fhirResource must be identical with and without debug=true'
            );
            assert(debugged.body.debugInfo, 'debugInfo must be present with ?debug=true');
            assert(!('debugInfo' in plain.body), 'debugInfo must be absent without ?debug=true');
        });

        it('should return parsedHl7v2 and root/partial scopes with debug=true on ADT_A04', async function () {
            const response = await supertest(app)
                .post("/api/v1/convert/hl7v2?unusedSegments=true&debug=true")
                .send({
                    template: adtTemplate,
                    srcData: adtSrcData,
                    templatesOverride: {}
                })
                .expect(200);
            const body = response.body;
            assert(body.debugInfo, 'debugInfo must be present');
            assert(typeof body.debugInfo.durationMs === 'number' && body.debugInfo.durationMs >= 0,
                'debugInfo.durationMs must be a non-negative number');

            const segments = body.debugInfo.parsedHl7v2.segments;
            assert(Array.isArray(segments) && segments.length > 0, 'parsedHl7v2.segments must be a non-empty array');
            const names = segments.map((s) => s.name);
            assert(names.includes('MSH'), 'segments must contain MSH');
            assert(names.includes('PID'), 'segments must contain PID');
            const msh = segments.find((s) => s.name === 'MSH');
            const msh10 = msh.fields.find((f) => f.index === 10);
            assert(msh10, 'MSH field 10 must be serialized');
            assert(msh10.accessed === true, 'MSH.10 is read by ADT_A04.liquid and must be marked accessed');

            const scopes = body.debugInfo.scopes;
            const root = scopes['__root__'];
            assert(root, 'scopes.__root__ must be present');
            assert(root.firstSegments, 'scopes.__root__.firstSegments must be captured');
            assert(typeof root.bundleID === 'string' && root.bundleID.length > 0,
                'scopes.__root__.bundleID must be a non-empty string');
            const messageHeader = scopes['Resource/_MessageHeader.liquid'];
            assert(messageHeader, 'scopes["Resource/_MessageHeader.liquid"] must be captured');
            assert(messageHeader.callCount >= 1, 'partial callCount must be >= 1');
            assert(messageHeader.lastScope, 'partial lastScope must be present');
        });
    });
});

describe('POST /api/v1/convert/hl7v2/:template (with stored template)', function () {
    const validMessage = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||\rPID|1||10006579^^^1^MR^1||DUCK^DONALD^D||19241010|M';

    it('should return 200 OK with valid message and existing template', function (done) {
        supertest(app)
            .post('/api/v1/convert/hl7v2/ADT_A01.liquid')
            .set('Content-Type', 'text/plain')
            .send(validMessage)
            .expect(200)
            .expect(function (response) {
                if (response.body.fhirResource.resourceType !== 'Bundle') {
                    throw new Error('expected a FHIR Bundle');
                }
            })
            .end(done);
    });

    it('should return 200 OK with valid message and existing template in a subdirectory', function (done) {
        supertest(app)
            .post('/api/v1/convert/hl7v2/ID/_Account.liquid')
            .set('Content-Type', 'text/plain')
            .send(validMessage)
            .expect(200)
            .end(done);
    });

    it('should return 400 Bad Request with empty message and existing template', function (done) {
        supertest(app)
            .post('/api/v1/convert/hl7v2/ADT_A01.liquid')
            .set('Content-Type', 'text/plain')
            .send('')
            .expect(400, {
                error: {
                    code: 'BadRequest', message: 'No srcData provided.'
                }
            })
            .end(done);
    });

    it('should return 404 not found with valid message and non-existing template', function (done) {
        supertest(app)
            .post('/api/v1/convert/hl7v2/nonExistingTemplate.liquid')
            .set('Content-Type', 'text/plain')
            .send(validMessage)
            .expect(404, {
                error: {
                    code: 'NotFound', message: 'Template not found'
                }
            })
            .end(done);
    });
});

describe("GET /health", function () {
    it("health present and returns correct value", function (done) {
        supertest(app)
            .get("/health")
            .expect(200, {
                status: "OK"
            })
            .end(function (err) {
                if (err) done(err);
                done();
            });
    });
});

describe("GET /metrics", function () {
    it("metrics present and returns correct value", function (done) {
        supertest(app)
            .get("/metrics")
            .expect(200)
            .end(function (err) {
                if (err) done(err);
                done();
            });
    });
});

describe("GET /version", function () {
    it("should return build version", function (done) {
        supertest(app)
            .get("/version")
            .expect(200)
            .expect(function (response) {
                if (!response.body.version) {
                    throw new Error('Response does not contain version info');
                }
            })
            .end(function (err) {
                if (err) {
                    done(err);
                }
                done();

            });
    });

});

// -------------------------------------------------------------------------------------------------
// POST /api/v1/templategenerate (spec: liquid-template-compat/06)
//
// The generate route calls stubbable `callExternalAI` from src/lib/ai/generateTemplate.js.
// routes.js imports that module by a static name, which ESM cannot spy on. This suite
// therefore runs mocha with --import ./test/mocks/register-templategenerate-loader.mjs
// (a module.registerHooks() hook that loads test/mocks/templategenerate-loader.mjs and redirects
// generateTemplate.js to test/mocks/templategenerate-stub.mjs).
// The stub is driven directly, so no API key or network call is required.
//
// The provider is made "configured" by exposing the configured environment key (AI_OPENAI_API_KEY)
// in the test process; no real key value is needed.
// -------------------------------------------------------------------------------------------------

// Import the stub by static specifier so the ESM loader hook (active in this suite
// only via --import ./test/mocks/register-templategenerate-loader.mjs) has a hook
// point to redirect it at load time. Routes.js performs the same static named import,
// so the loader maps both to the in-process stub and no real API key or network call
// is required.
import { __getState as templategenerateStubState } from '../test/mocks/templategenerate-stub.mjs';

describe('POST /api/v1/templategenerate', function () {
    const validMessage = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||';
    const stubState = templategenerateStubState();

    it('GET /api/v1/ai/providers lists only providers whose env key is set', function (done) {
        const keyPresent = process.env.AI_OPENAI_API_KEY ? 'set' : 'unset';
        supertest(app)
            .get('/api/v1/ai/providers')
            .expect(200)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                if (keyPresent === 'unset') {
                    if (!(Array.isArray(res.body.providers) && res.body.providers.length === 0)) {
                        return done(new Error('expected empty providers list when no env key set'));
                    }
                }
                done();
            });
    });

    it('GET /api/v1/ai/models?provider=openai returns configured models, 400 for unknown', function (done) {
        supertest(app)
            .get('/api/v1/ai/models?provider=openai')
            .expect(200)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                if (!Array.isArray(res.body.models) || res.body.models.length === 0) {
                    return done(new Error('expected non-empty configured models for openai'));
                }
                return supertest(app)
                    .get('/api/v1/ai/models?provider=does-not-exist')
                    .expect(400)
                    .end(done);
            });
    });

    it('unconfirmed external send returns 400 and does not call the provider', function (done) {
        // Ensure the stub reports zero provider calls for this request.
        if (stubState.calls !== undefined) {
            stubState.calls = 0;
        }
        supertest(app)
            .post('/api/v1/templategenerate')
            .send({sampleDataInline: validMessage})
            .expect(400)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                if (!res.body.error || !res.body.error.message.includes('not confirmed')) {
                    return done(new Error('expected 400 for unconfirmed send'));
                }
                if (stubState.calls !== 0) {
                    return done(new Error('provider module must not be called for unconfirmed send'));
                }
                done();
            });
    });

    it('unknown messageName returns 404', function (done) {
        if (stubState.calls !== undefined) {
            stubState.calls = 0;
        }
        supertest(app)
            .post('/api/v1/templategenerate')
            .send({messageName: 'non-existent-sample', confirmedExternalSend: true})
            .expect(404)
            .end(function (err) {
                if (err) {
                    return done(err);
                }
                if (stubState.calls !== 0) {
                    return done(new Error('provider must not be called for unknown messageName'));
                }
                done();
            });
    });

    it('stub returning a renderable template yields 200, fhirResource, iterations:1, unusedSegments', function (done) {
        // An ADT-style template using `{% evaluate %}` (the converter's only custom tag)
        // plus `{% assign %}`/`get_first_segments` filters renders successfully.
        stubState.calls = 0;
        // A single-quoted `{% evaluate ... 'ID/Bundle' %}` candidate renders (the converter's
        // `evaluate` tag parses single-quoted string literals; double quotes are rejected and
        // would throw). It yields a valid (if empty) FHIR resource, so the loop stops at iter 1.
        stubState.candidates = ['{% assign firstSegments = hl7v2Data | get_first_segments: "MSH" -%}{% evaluate bundleID using \'ID/Bundle\' Data: firstSegments.MSH.10 -%}BUNDLE'];
        stubState.errors = [];
        stubState.sentInput = null;
        supertest(app)
            .post('/api/v1/templategenerate')
            .send({sampleDataInline: validMessage, confirmedExternalSend: true, provider: 'openai', model: 'gpt-4o-mini'})
            .expect(200)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                const b = res.body || {};
                if (b.fhirResource === undefined) {
                    return done(new Error('expected fhirResource in response'));
                }
                if (b.iterations !== 1) {
                    return done(new Error('expected iterations to equal 1'));
                }
                if (!Array.isArray(b.unusedSegments)) {
                    return done(new Error('expected unusedSegments array'));
                }
                done();
            });
    });

    it('stub that first rejects then renders yields 200 with iterations:2', function (done) {
        stubState.calls = 0;
        stubState.candidates = ['{% bad tag %}', '{% assign firstSegments = hl7v2Data | get_first_segments: "MSH" -%}{% evaluate bundleID using \'ID/Bundle\' Data: firstSegments.MSH.10 -%}BUNDLE'];
        stubState.errors = [];
        supertest(app)
            .post('/api/v1/templategenerate')
            .send({sampleDataInline: validMessage, confirmedExternalSend: true, provider: 'openai', model: 'gpt-4o-mini'})
            .expect(200)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                if ((res.body && res.body.iterations) !== 2) {
                    return done(new Error('expected iterations to equal 2 after one render failure'));
                }
                done();
            });
    });

    it('stub always unrenderable yields 400 after maxIters and calls provider that many times', function (done) {
        stubState.calls = 0;
        // Every provider invocation throws and no candidate survives, so the loop exhausts
        // maxIters and the handler returns 400 (BadRequest) after maxIters provider calls.
        stubState.candidates = [];
        stubState.errors = [new Error('a provider error'), new Error('a provider error'), new Error('a provider error'), new Error('a provider error')];
        supertest(app)
            .post('/api/v1/templategenerate')
            .send({sampleDataInline: validMessage, confirmedExternalSend: true, provider: 'openai', model: 'gpt-4o-mini'})
            .expect(400)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                const b = res.body || {};
                if (!b.error || b.error.code !== 'BadRequest') {
                    return done(new Error('expected 400 BadRequest envelope for never-rendering template'));
                }
                const maxIters = (constants && constants.ai && constants.ai.defaultMaxIters) || 4;
                if (b.iterations !== maxIters) {
                    return done(new Error(`expected iterations to equal maxIters (${maxIters}), got ${b.iterations}`));
                }
                if (stubState.calls !== maxIters) {
                    return done(new Error(`expected provider called maxIters (${maxIters}) times, got ${stubState.calls}`));
                }
                done();
            });
    });

    it('accepts a base URL and API key when the named provider has no env key', function (done) {
        stubState.calls = 0;
        stubState.candidates = ['{% assign firstSegments = hl7v2Data | get_first_segments: "MSH" -%}{% evaluate bundleID using \'ID/Bundle\' Data: firstSegments.MSH.10 -%}BUNDLE'];
        stubState.errors = [];
        supertest(app)
            .post('/api/v1/templategenerate')
            .send({
                sampleDataInline: validMessage,
                confirmedExternalSend: true,
                provider: 'custom',
                model: 'local-model',
                baseUrl: 'http://127.0.0.1:9/v1',
                apiKey: 'browser-key'
            })
            .expect(200)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                if (!res.body || res.body.iterations !== 1) {
                    return done(new Error('expected the typed provider to be used'));
                }
                if (!stubState.sentInput || stubState.sentInput.apiKey !== 'browser-key') {
                    return done(new Error('expected the request API key to be sent to the provider'));
                }
                done();
            });
    });

    it('accepts only an API key for built-in providers (anthropic, google, xai, mistral) and resolves baseUrl and default model automatically', async function () {
        for (const [prov, expectedHost] of [
            ['anthropic', 'https://api.anthropic.com/v1'],
            ['google', 'https://generativelanguage.googleapis.com/v1beta'],
            ['xai', 'https://api.x.ai/v1'],
            ['mistral', 'https://api.mistral.ai/v1']
        ]) {
            stubState.calls = 0;
            stubState.candidates = ['{% assign firstSegments = hl7v2Data | get_first_segments: "MSH" -%}{% evaluate bundleID using \'ID/Bundle\' Data: firstSegments.MSH.10 -%}BUNDLE'];
            stubState.errors = [];
            stubState.sentInput = null;

            const res = await supertest(app)
                .post('/api/v1/templategenerate')
                .send({
                    sampleDataInline: validMessage,
                    confirmedExternalSend: true,
                    provider: prov,
                    apiKey: 'key-for-' + prov
                })
                .expect(200);

            assert.strictEqual(res.body.provider, prov);
            assert.ok(res.body.model && res.body.model.length > 0, 'expected default model resolved for ' + prov);
            assert.strictEqual(stubState.sentInput.apiKey, 'key-for-' + prov);
            assert.strictEqual(stubState.sentInput.baseUrl, expectedHost);
        }
    });
});

describe('PUT /api/v1/templates', function () {
    let createdKey;

    after(function () {
        if (!createdKey) {
            return;
        }
        return Promise.all([
            unlink(join(BASE_TEMPLATE_FILES_LOCATION, createdKey)).catch(() => {}),
            unlink(join(TEMPLATE_FILES_LOCATION, createdKey)).catch(() => {})
        ]);
    });

    it('writes a new liquid file and reads the same text back', function (done) {
        supertest(app)
            .get('/api/v1/templates')
            .expect(200)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                const sample = res.body.templates[0].templateName;
                const prefix = sample.slice(0, sample.indexOf('/') + 1);
                createdKey = prefix + 'ZZZ_spec_new_template.liquid';
                const text = '{% comment %}spec new template{% endcomment %}\n';
                supertest(app)
                    .put('/api/v1/templates/' + createdKey)
                    .set('Content-Type', 'text/plain')
                    .send(text)
                    .expect(200)
                    .end(function (putErr, putRes) {
                        if (putErr) {
                            return done(putErr);
                        }
                        if (!putRes.body || putRes.body.ok !== true) {
                            return done(new Error('expected {ok:true}'));
                        }
                        supertest(app)
                            .get('/api/v1/templates/' + createdKey)
                            .expect(200)
                            .end(function (getErr, getRes) {
                                if (getErr) {
                                    return done(getErr);
                                }
                                if (getRes.text !== text) {
                                    return done(new Error('saved template text did not match'));
                                }
                                done();
                            });
                    });
            });
    });
});

describe('browse and FHIR send', function () {
    let folder;

    before(async function () {
        folder = await mkdtemp(join(tmpdir(), 'fhir-browse-'));
        await writeFile(join(folder, 'note.hl7'), 'MSH|^~\\&|');
    });

    after(function () {
        return rm(folder, {recursive: true, force: true});
    });

    it('rejects a GitHub repo that is not owner/repo', function (done) {
        supertest(app)
            .post('/api/v1/browse/github')
            .send({repo: 'not a repo'})
            .expect(400)
            .end(done);
    });

    it('lists a local folder and reads a text file', function (done) {
        supertest(app)
            .post('/api/v1/browse/folder')
            .send({path: folder})
            .expect(200)
            .end(function (err, res) {
                if (err) {
                    return done(err);
                }
                const names = (res.body.entries || []).map((entry) => entry.name);
                if (!names.includes('note.hl7')) {
                    return done(new Error('expected note.hl7 in ' + names.join(',')));
                }
                supertest(app)
                    .post('/api/v1/browse/folder')
                    .send({path: join(folder, 'note.hl7'), file: true})
                    .expect(200)
                    .end(function (readErr, readRes) {
                        if (readErr) {
                            return done(readErr);
                        }
                        if (readRes.text !== 'MSH|^~\\&|') {
                            return done(new Error('file text did not match'));
                        }
                        done();
                    });
            });
    });

    it('returns 404 for a missing folder', function (done) {
        supertest(app)
            .post('/api/v1/browse/folder')
            .send({path: join(folder, 'missing')})
            .expect(404)
            .end(done);
    });

    it('returns 400 when the FHIR server URL is missing', function (done) {
        supertest(app)
            .post('/api/v1/fhir/send')
            .send({resource: {resourceType: 'Patient'}})
            .expect(400)
            .end(done);
    });

    it('returns 400 for a FHIR URL that is not http', function (done) {
        supertest(app)
            .post('/api/v1/fhir/send')
            .send({baseUrl: 'file:///tmp/fhir', resource: {resourceType: 'Patient'}})
            .expect(400)
            .end(done);
    });
});

describe('Project API routes (/api/v1/projects/*)', function () {
    let tempDir;

    before(async function () {
        tempDir = await mkdtemp(join(tmpdir(), 'fhir-routes-projects-'));
    });

    after(async function () {
        if (tempDir) {
            await rm(tempDir, {recursive: true, force: true});
        }
    });

    it('rejects relative parentPath and unsupported C-CDA baseline on POST /api/v1/projects', async function () {
        const rel = await supertest(app)
            .post('/api/v1/projects')
            .send({name: 'Demo', parentPath: 'relative/path', family: 'hl7v2', startingPoint: 'empty'})
            .expect(400);
        assert.strictEqual(rel.body.error.message, 'Enter an absolute folder path.');

        const ccdaBase = await supertest(app)
            .post('/api/v1/projects')
            .send({name: 'CcdaBase', parentPath: tempDir, family: 'ccda', startingPoint: 'baseline'})
            .expect(400);
        assert.strictEqual(ccdaBase.body.error.message, 'C-CDA baseline is not installed on this server. Create an empty C-CDA project.');
    });

    it('creates, opens, lists, reads, converts, saves, and imports official samples in a local HL7v2 project', async function () {
        const createRes = await supertest(app)
            .post('/api/v1/projects')
            .send({name: 'Route Project', parentPath: tempDir, family: 'hl7v2', startingPoint: 'empty'})
            .expect(201);
        const projPath = createRes.body.path;
        assert(projPath.endsWith('/route-project'));

        const openRes = await supertest(app)
            .post('/api/v1/projects/open')
            .send({path: projPath})
            .expect(200);
        assert.strictEqual(openRes.body.opened, true);

        const filesRes = await supertest(app)
            .post('/api/v1/projects/files')
            .send({kind: 'local', path: projPath})
            .expect(200);
        assert.deepStrictEqual(filesRes.body.samples, ['samples/hl7v2/example.hl7']);
        assert.deepStrictEqual(filesRes.body.templates, ['templates/Hl7v2/Example.liquid']);

        const sampleRes = await supertest(app)
            .post('/api/v1/projects/file')
            .send({project: {kind: 'local', path: projPath}, path: 'samples/hl7v2/example.hl7'})
            .expect(200);
        assert(sampleRes.text.includes('DOE^JANE'));

        await supertest(app)
            .post('/api/v1/projects/file')
            .send({project: {kind: 'local', path: projPath}, path: '../src/templates/Hl7v2/ADT_A04.liquid'})
            .expect(400);

        await supertest(app)
            .put('/api/v1/projects/file')
            .set('Content-Type', 'text/plain')
            .set('X-Project-Path', projPath)
            .set('X-Project-File', 'templates/Hl7v2/Resource/_ProjOnly.liquid')
            .send('{ "resourceType": "Patient", "id": "route-proj-pat" }')
            .expect(200);

        const convRes = await supertest(app)
            .post('/api/v1/projects/convert?unusedSegments=true&debug=true')
            .send({
                project: {kind: 'local', path: projPath},
                srcData: sampleRes.text,
                template: '{ "resourceType": "Bundle", "type": "batch", "entry": [ { "resource": {% include \'Resource/ProjOnly\' %} } ] }',
                templatesOverride: {}
            })
            .expect(200);
        assert.strictEqual(convRes.body.fhirResource.entry[0].resource.id, 'route-proj-pat');
        assert(convRes.body.debugInfo && convRes.body.debugInfo.parsedHl7v2);

        const officialRes = await supertest(app)
            .post('/api/v1/projects/official-samples')
            .send({path: projPath})
            .expect(200);
        assert.strictEqual(officialRes.body.copied + officialRes.body.unchanged, 139);
        assert.deepStrictEqual(officialRes.body.kept, ['example.hl7']);
    });

    it('rejects invalid GitHub refs on POST /api/v1/projects/open-github', async function () {
        const res = await supertest(app)
            .post('/api/v1/projects/open-github')
            .send({repo: 'acme/rules', ref: 'bad ref', token: ''})
            .expect(400);
        assert.strictEqual(res.body.error.message, 'Invalid ref.');
    });
});
