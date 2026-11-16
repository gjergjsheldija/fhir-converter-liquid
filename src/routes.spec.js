// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {constants} from './lib/constants/constants.js';
import supertest from 'supertest';
import express from 'express';
import routes from './routes.js';

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
            .get("/api/v1/sample-data/foobar.hl7")
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
// therefore runs mocha with test/mocks/templategenerate-loader.mjs (an --experimental-loader
// resolve hook that redirects generateTemplate.js to test/mocks/templategenerate-stub.mjs).
// The stub is driven directly, so no API key or network call is required.
//
// The provider is made "configured" by exposing the configured environment key (AI_OPENAI_API_KEY)
// in the test process; no real key value is needed.
// -------------------------------------------------------------------------------------------------

// Import the stub by static specifier so the ESM `--experimental-loader` hook (active
// in this suite only) has a hook point to redirect it at load time. Routes.js performs
// the same static named import, so the loader maps both to the in-process stub and no
// real API key or network call is required.
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
});
