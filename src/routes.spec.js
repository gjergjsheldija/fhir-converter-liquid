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

    it("should return status code 200 for ADT_A01.hbs", function (done) {
        supertest(app)
            .get("/api/v1/templates/hl7v2/ADT_A01.hbs")
            .expect(200)
            .end(function (err) {
                if (err) done(err); else done();
            });
    });

    it("should return status code 404 for nonExistingTemplate.hbs", function (done) {
        supertest(app)
            .get("/api/v1/templates/nonExistingTemplate.hbs")
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
            .expect(200, {
                'fhirResource': {}, 'unusedSegments': [{
                    "field": [{
                        "component": [{
                            "index": 0, "value": "AccMgr"
                        }

                        ], "index": 2
                    }, {
                        "component": [{
                            "index": 0, "value": "1"
                        }

                        ], "index": 3
                    }, {
                        "component": [{
                            "index": 0, "value": "20050110045504"
                        }

                        ], "index": 6
                    }, {
                        "component": [{
                            "index": 0, "value": "ADT"
                        }, {
                            "index": 1, "value": "A01"
                        }


                        ], "index": 8
                    }, {
                        "component": [{
                            "index": 0, "value": "599102"
                        }

                        ], "index": 9
                    }, {
                        "component": [{
                            "index": 0, "value": "P"
                        }

                        ], "index": 10
                    }, {
                        "component": [{
                            "index": 0, "value": "2.3"
                        }

                        ], "index": 11
                    }], "line": 0, "type": "MSH"
                }], 'invalidAccess': []
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
            .expect(200, {
                'fhirResource': {}, 'unusedSegments': [{
                    "field": [{
                        "component": [{
                            "index": 0, "value": "AccMgr"
                        }

                        ], "index": 2
                    }, {
                        "component": [{
                            "index": 0, "value": "1"
                        }

                        ], "index": 3
                    }, {
                        "component": [{
                            "index": 0, "value": "20050110045504"
                        }

                        ], "index": 6
                    }, {
                        "component": [{
                            "index": 0, "value": "ADT"
                        }, {
                            "index": 1, "value": "A01"
                        }


                        ], "index": 8
                    }, {
                        "component": [{
                            "index": 0, "value": "599102"
                        }

                        ], "index": 9
                    }, {
                        "component": [{
                            "index": 0, "value": "P"
                        }

                        ], "index": 10
                    }, {
                        "component": [{
                            "index": 0, "value": "2.3"
                        }

                        ], "index": 11
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

    it('should return 200 OK with single detailed report(invalidAccess) for valid message with valid template and single report field declaration', function (done) {
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

    it('should return 400 Bad Request when given a payload that references a non existent parital template', function (done) {
        //Message: MSH|^~\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||
        //Template: {{>nonExistentPartial.hbs}}
        supertest(app)
            .post("/api/v1/convert/hl7v2")
            .send({
                templateBase64: "e3s+bm9uRXhpc3RlbnRQYXJ0aWFsLmhic319",
                srcDataBase64: "TVNIfF5+XCZ8QWNjTWdyfDF8fHwyMDA1MDExMDA0NTUwNHx8QURUXkEwMXw1OTkxMDJ8UHwyLjN8fHw="
            })
            .expect(400)
            .expect(function (response) {
                if (response.body.error.code !== "BadRequest") {
                    throw("unexpected error code!");
                }
                if (!response.body.error.message.includes("Unable to create result: Error: Referenced partial template nonExistentPartial.hbs not found on disk")) {
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
    it('should return 200 OK with valid message and existing template', function (done) {
        const sourceData = ['MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||', 'PID|1||10006579^^^1^MR^1||DUCK^DONALD^D||19241010|M||1|111 DUCK ST^^FOWL^CA^999990000^^M|1|8885551212|8885551212|1|2||40007716^^^AccMgr^VN^1|123121234|||||||||||NO', 'PV1|1|I|PREOP^101^1^1^^^S|3|||37^DISNEY^WALT^^^^^^AccMgr^^^^CI|||01||||1|||37^DISNEY^WALT^^^^^^AccMgr^^^^CI|2|40007716^^^AccMgr^VN|4|||||||||||||||||||1||G|||20050110045253||||||'];
        supertest(app)
            .post("/api/v1/convert/hl7v2/ADT_A01.hbs")
            .set('Content-Type', 'text/plain')
            .send(sourceData.join('\n'))
            .expect(200)
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 200 OK with valid message and existing template and timezone should be +0400', function (done) {
        const sourceData = ['MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||', 'PID|1||10006579^^^1^MR^1||DUCK^DONALD^D||19241010|M||1|111 DUCK ST^^FOWL^CA^999990000^^M|1|8885551212|8885551212|1|2||40007716^^^AccMgr^VN^1|123121234|||||||||||NO', 'PV1|1|I|PREOP^101^1^1^^^S|3|||37^DISNEY^WALT^^^^^^AccMgr^^^^CI|||01||||1|||37^DISNEY^WALT^^^^^^AccMgr^^^^CI|2|40007716^^^AccMgr^VN|4|||||||||||||||||||1||G|||20050110045253||||||'];
        supertest(app)
            .post("/api/v1/convert/hl7v2/ADT_A01.hbs")
            .set('Content-Type', 'text/plain')
            .set('timezone', '+0400')
            .send(sourceData.join('\n'))
            .expect(200, {
                'fhirResource': {
                    'entry': [{
                        'fullUrl': 'urn:uuid:64bac34e-e611-3549-848b-89416176aa0b', 'request': {
                            'method': 'PUT', 'url': 'Patient/64bac34e-e611-3549-848b-89416176aa0b'
                        }, 'resource': {
                            'address': [{
                                'city': 'FOWL',
                                'line': ['111 DUCK ST'],
                                'postalCode': '999990000',
                                'state': 'CA',
                                'type': 'postal'
                            }, {
                                'district': '1'
                            }], 'birthDate': '1924-10-10', 'communication': [{
                                'preferred': true
                            }], 'gender': 'male', 'id': '64bac34e-e611-3549-848b-89416176aa0b', 'identifier': [{
                                'type': {
                                    'coding': [{
                                        'code': 'MR', 'system': 'http://terminology.hl7.org/CodeSystem/v2-0203'
                                    }]
                                }, 'value': '10006579'
                            }, {
                                'system': 'http://hl7.org/fhir/sid/us-ssn', 'type': {
                                    'coding': [{
                                        'code': 'SS', 'system': 'http://terminology.hl7.org/CodeSystem/v2-0203'
                                    }]
                                }, 'value': '123121234'
                            }], 'name': [{
                                'family': 'DUCK', 'given': ['DONALD', 'D']
                            }], 'resourceType': 'Patient', 'telecom': [{
                                'use': 'home', 'value': '8885551212'
                            }, {
                                'use': 'work', 'value': '8885551212'
                            }]
                        }
                    }, {
                        'fullUrl': 'urn:uuid:785a8bef-9829-3dad-a8e9-82898594b58f', 'request': {
                            'method': 'PUT', 'url': 'Encounter/785a8bef-9829-3dad-a8e9-82898594b58f'
                        }, 'resource': {
                            'class': {
                                'code': 'IMP',
                                'display': 'inpatient encounter',
                                'system': 'http://terminology.hl7.org/CodeSystem/v3-ActCode'
                            }, 'hospitalization': {
                                'admitSource': {
                                    'coding': [{
                                        'code': '1'
                                    }]
                                }
                            }, 'id': '785a8bef-9829-3dad-a8e9-82898594b58f', 'identifier': [{
                                'type': {
                                    'coding': [{
                                        'system': 'http://terminology.hl7.org/CodeSystem/v2-0203'
                                    }], 'text': 'visit number'
                                }, 'value': '40007716'
                            }], 'location': [{
                                'location': {
                                    'reference': 'Location/5f49ca69-cbda-3b30-8480-fa750dfee4a2'
                                }, 'status': 'active'
                            }], 'participant': [{
                                'type': [{
                                    'coding': [{
                                        'code': 'ATND',
                                        'display': 'attender',
                                        'system': 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType'
                                    }]
                                }]
                            }, {
                                'type': [{
                                    'coding': [{
                                        'code': 'ADM',
                                        'system': 'http://terminology.hl7.org/CodeSystem/v3-ParticipationType'
                                    }], 'text': 'admitter'
                                }]
                            }], 'period': {
                                'start': '2005-01-10T00:52:53.000Z'
                            }, 'resourceType': 'Encounter', 'serviceType': {
                                'coding': [{
                                    'code': '01'
                                }]
                            }, 'status': 'unknown', 'subject': {
                                'reference': 'Patient/64bac34e-e611-3549-848b-89416176aa0b'
                            }
                        }
                    }, {
                        'fullUrl': 'urn:uuid:5f49ca69-cbda-3b30-8480-fa750dfee4a2', 'request': {
                            'method': 'PUT', 'url': 'Location/5f49ca69-cbda-3b30-8480-fa750dfee4a2'
                        }, 'resource': {
                            'id': '5f49ca69-cbda-3b30-8480-fa750dfee4a2', 'mode': 'instance', 'physicalType': {
                                'coding': [{
                                    'system': 'http://terminology.hl7.org/CodeSystem/location-physical-type'
                                }]
                            }, 'resourceType': 'Location'
                        }
                    }], 'resourceType': 'Bundle', 'type': 'transaction'
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

    it('should return 200 OK and detailed reports with valid message and existing template and reports fields declaration', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2/ADT_A01.hbs?unusedSegments=true&invalidAcces=true")
            .set('Content-Type', 'text/plain')
            .send('MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||')
            .expect(200, {
                'fhirResource': {
                    "resourceType": "Bundle", "type": "transaction"
                }, 'unusedSegments': [{
                    "field": [{
                        "component": [{
                            "index": 0, "value": "AccMgr"
                        }

                        ], "index": 2
                    }, {
                        "component": [{
                            "index": 0, "value": "1"
                        }

                        ], "index": 3
                    }, {
                        "component": [{
                            "index": 0, "value": "20050110045504"
                        }

                        ], "index": 6
                    }, {
                        "component": [{
                            "index": 0, "value": "ADT"
                        }, {
                            "index": 1, "value": "A01"
                        }


                        ], "index": 8
                    }, {
                        "component": [{
                            "index": 0, "value": "599102"
                        }

                        ], "index": 9
                    }, {
                        "component": [{
                            "index": 0, "value": "P"
                        }

                        ], "index": 10
                    }, {
                        "component": [{
                            "index": 0, "value": "2.3"
                        }

                        ], "index": 11
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

    it('should return 200 OK with valid message and existing template in a subdirectory', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2/Resources/Patient.hbs")
            .set('Content-Type', 'text/plain')
            .send("MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||")
            .expect(200)
            .end(function (err) {
                if (err) {
                    done(err);
                } else {
                    done();
                }
            });
    });

    it('should return 400 Bad Request with empty message and existing template', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2/ADT_A01.hbs")
            .set('Content-Type', 'text/plain')
            .send("")
            .expect(400, {
                error: {
                    code: "BadRequest", message: "No srcData provided."
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

    it('should return 400 Bad request with invalid message and existing template', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2/ADT_A01.hbs")
            .set('Content-Type', 'text/plain')
            .send("MSQ|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||")
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

    it('should return 404 not found with valid message and non-existing template', function (done) {
        supertest(app)
            .post("/api/v1/convert/hl7v2/foobar.hbs")
            .set('Content-Type', 'text/plain')
            .send("MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||")
            .expect(404, {
                error: {
                    code: "NotFound", message: "Template not found"
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
