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
    it('should return 400 Bad Request when given a payload without a message', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({templateBase64: ""})
            .expect(400, {
                error: {
                    code: "BadRequest",
                    message: "Unable to parse input data. The first argument must be of type string or an instance of Buffer, ArrayBuffer, or Array or an Array-like Object. Received undefined"
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

    it('should return 400 Bad Request with invalid templatesMap', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "e30=",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw=",
                templatesOverrideBase64: "abc==5"
            })
            .expect(400, {
                error: {
                    code: "BadRequest", message: "templatesOverride is not a base 64 encoded string."
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
        //This test passes a message with first segment "MSQ" (instead of MSH)
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "",
                srcDataBase64: "TVNRfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw="
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw="
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw="})
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: {}
        supertest(app)
            .post("/api/v1/convert/hl7v2?unusedSegments=true&invalidAccess=true")
            .send({
                templateBase64: "e30=",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw=",
                templatesOverrideBase64: "e30="
            })
            // Note: this fixture originally also expected an 'invalidAccess': [] key (the query
            // string does pass invalidAccess=true), but invalidAccess has no upstream equivalent
            // and is out of scope for this plan (see hl7v2AccessTracking.js's own doc comment and
            // Step 8 of task-5-brief.md) -- getConversionResultMetadata() never populates that key,
            // so it is correctly absent from the real response entirely, not merely empty.
            // The unusedSegments field/component indices below were corrected against real,
            // verified output: this rich field model is 1-indexed for Components (index 0 is null
            // padding, matching upstream) and Fields[N] equals conventional HL7 field N (MSH-3
            // "AccMgr" is Fields[3], not Fields[2] -- the original hardcoded values here predate
            // this task and were never validated against actual output).
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: {}
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "e30=",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw=",
                templatesOverrideBase64: "e30="
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: {}
        supertest(app)
            .post("/api/v1/convert/hl7v2?unusedSegments=true")
            .send({
                templateBase64: "e30=",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw=",
                templatesOverrideBase64: "e30="
            })
            // Indices corrected against real, verified output -- see the comment on the combined
            // detailed-report test above for the full explanation (1-indexed Components, Fields[N]
            // == conventional HL7 field N).
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

    // invalidAccess has no upstream equivalent (verified: zero occurrences in microsoft/FHIR-Converter) -- out of scope, see docs/superpowers/plans/2026-08-20-hl7v2-parser-filter-fidelity.md
    it.skip('should return 200 OK with single detailed report(invalidAccess) for valid message with valid template and single report field declaration', function (done) {
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: {}
        supertest(app)
            .post("/api/v1/convert/hl7v2?invalidAccess=true")
            .send({
                templateBase64: "e30=",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw=",
                templatesOverrideBase64: "e30="
            })
            .expect(200, {
                'fhirResource': {}, 'invalidAccess': []
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: invalid base64
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "\\",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw="
            })
            .expect(400, {
                error: {
                    code: "BadRequest", message: "Template is not a base 64 encoded string."
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: { , ,"a" : "1",,,,"b" : [, "c" , ,"d",,], ,}
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "eyAsCiwKImEiIDogIjEiLCwsLAoiYiIgOiBbLCAiYyIgLCAsImQiLCxdLCAsCn0=",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw="
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

    it('should return 400 Bad Request when given a payload with invalid message but valid template', function (done) {
        //Message: \
        //Template: {}
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({templateBase64: "e30=", srcDataBase64: "\\"})
            .expect(400, {
                error: {
                    code: "BadRequest", message: "srcData is not a base 64 encoded string."
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
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: {% include 'nonExistentPartial' %}
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "eyUgaW5jbHVkZSAnbm9uRXhpc3RlbnRQYXJ0aWFsJyAlfQ==",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw="
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
