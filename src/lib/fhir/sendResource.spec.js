// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import assert from 'assert';
import {validateTarget, validateResource, sendResource, conditionalTransaction, conditionalUpdate} from './sendResource.js';

describe('FHIR conditional send', function () {
    let realFetch;
    let calls;

    beforeEach(function () {
        realFetch = global.fetch;
        calls = [];
        global.fetch = async (url, options) => {
            calls.push({url, options});
            return {ok: true, status: 201, text: async () => '{}', headers: {get: () => ''}};
        };
    });

    afterEach(function () {
        global.fetch = realFetch;
    });

    function batchBundle() {
        return {
            resourceType: 'Bundle',
            type: 'batch',
            entry: [
                {fullUrl: 'urn:uuid:1', resource: {resourceType: 'Patient', identifier: [{system: 'http://hospital.example/mrn', value: '12345'}]}},
                {fullUrl: 'urn:uuid:2', resource: {resourceType: 'Observation', status: 'final'}}
            ]
        };
    }

    it('posts one transaction with ifNoneExist on the first identifier', async function () {
        const bundle = batchBundle();
        await sendResource('https://fhir.example.org/baseR4/', bundle, undefined, {conditional: true});
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].url, 'https://fhir.example.org/baseR4');
        const posted = JSON.parse(calls[0].options.body);
        assert.strictEqual(posted.type, 'transaction');
        assert.strictEqual(posted.entry[0].fullUrl, 'urn:uuid:1');
        assert.deepStrictEqual(posted.entry[0].request, {
            method: 'POST',
            url: 'Patient',
            ifNoneExist: 'identifier=' + encodeURIComponent('http://hospital.example/mrn') + '|12345'
        });
        assert.deepStrictEqual(posted.entry[1].request, {method: 'POST', url: 'Observation'});
        assert.strictEqual(bundle.type, 'batch');
        assert.strictEqual(bundle.entry[0].request, undefined);
    });

    it('posts the original batch Bundle when the option is off or omitted', async function () {
        const bundle = batchBundle();
        await sendResource('https://fhir.example.org/baseR4', bundle, undefined, {conditional: false});
        await sendResource('https://fhir.example.org/baseR4', bundle);
        assert.strictEqual(calls.length, 2);
        for (const call of calls) {
            assert.strictEqual(call.url, 'https://fhir.example.org/baseR4');
            assert.deepStrictEqual(JSON.parse(call.options.body), bundle);
        }
        assert.strictEqual(JSON.parse(calls[0].options.body).type, 'batch');
    });

    it('does not wrap a plain Patient when the option is on', async function () {
        const patient = {resourceType: 'Patient', identifier: [{system: 'http://hospital.example/mrn', value: '12345'}]};
        await sendResource('https://fhir.example.org/baseR4', patient, undefined, {conditional: true});
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].url, 'https://fhir.example.org/baseR4/Patient');
        assert.deepStrictEqual(JSON.parse(calls[0].options.body), patient);
    });

    it('converts a collection Bundle and returns other Bundle types as-is', function () {
        const collection = {resourceType: 'Bundle', type: 'collection', entry: [{resource: {resourceType: 'Patient', identifier: [{system: 'http://a', value: ''}]}}]};
        const result = conditionalTransaction(collection);
        assert.strictEqual(result.type, 'transaction');
        assert.deepStrictEqual(result.entry[0].request, {method: 'POST', url: 'Patient'});
        assert.strictEqual(collection.type, 'collection');
        const searchset = {resourceType: 'Bundle', type: 'searchset'};
        assert.strictEqual(conditionalTransaction(searchset), searchset);
    });

    it('posts one transaction of conditional PUTs when update is on', async function () {
        const bundle = batchBundle();
        await sendResource('https://fhir.example.org/baseR4', bundle, undefined, {update: true});
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].options.method, 'POST');
        assert.strictEqual(calls[0].url, 'https://fhir.example.org/baseR4');
        const posted = JSON.parse(calls[0].options.body);
        assert.strictEqual(posted.type, 'transaction');
        assert.strictEqual(posted.entry[0].request.method, 'PUT');
        assert.strictEqual(decodeURIComponent(posted.entry[0].request.url), 'Patient?identifier=http://hospital.example/mrn|12345');
        assert.strictEqual(posted.entry[0].request.ifNoneExist, undefined);
        assert.deepStrictEqual(posted.entry[1].request, {method: 'POST', url: 'Observation'});
        assert.strictEqual(bundle.type, 'batch');
        assert.strictEqual(bundle.entry[0].request, undefined);
    });

    it('update wins over conditional in sendResource and conditional create is unchanged', async function () {
        await sendResource('https://fhir.example.org/baseR4', batchBundle(), undefined, {conditional: true, update: true});
        assert.strictEqual(JSON.parse(calls[0].options.body).entry[0].request.method, 'PUT');
        await sendResource('https://fhir.example.org/baseR4', batchBundle(), undefined, {conditional: true, update: false});
        assert.strictEqual(JSON.parse(calls[1].options.body).entry[0].request.method, 'POST');
    });

    it('leaves the Bundle as batch when update is off', async function () {
        await sendResource('https://fhir.example.org/baseR4', batchBundle(), undefined, {update: false});
        assert.strictEqual(JSON.parse(calls[0].options.body).type, 'batch');
    });

    it('conditionalUpdate keeps POST without an identifier and returns other Bundle types as-is', function () {
        const collection = {resourceType: 'Bundle', type: 'collection', entry: [{resource: {resourceType: 'Patient', identifier: [{system: 'http://a', value: ''}]}}]};
        const result = conditionalUpdate(collection);
        assert.strictEqual(result.type, 'transaction');
        assert.deepStrictEqual(result.entry[0].request, {method: 'POST', url: 'Patient'});
        assert.strictEqual(collection.type, 'collection');
        const searchset = {resourceType: 'Bundle', type: 'searchset'};
        assert.strictEqual(conditionalUpdate(searchset), searchset);
    });
});

describe('FHIR $validate', function () {
    let realFetch;
    let calls;

    beforeEach(function () {
        realFetch = global.fetch;
        calls = [];
    });

    afterEach(function () {
        global.fetch = realFetch;
    });

    function mockFetch(status, payload) {
        global.fetch = async (url, options) => {
            calls.push({url, options});
            const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
            return {ok: status >= 200 && status < 300, status, text: async () => text};
        };
    }

    it('builds the $validate URL without a resource type or trailing slash', function () {
        assert.strictEqual(validateTarget('https://fhir.example.org/baseR4/'), 'https://fhir.example.org/baseR4/$validate');
        assert.strictEqual(validateTarget('http://localhost:8080/fhir'), 'http://localhost:8080/fhir/$validate');
    });

    it('appends an encoded profile query only when profile is non-empty', function () {
        const profile = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
        const url = validateTarget('https://fhir.example.org/baseR4', profile);
        assert.strictEqual(url, 'https://fhir.example.org/baseR4/$validate?profile=' + encodeURIComponent(profile));
        assert.strictEqual(new URL(url).searchParams.get('profile'), profile);
        for (const blank of [undefined, null, '', '   ', 42]) {
            assert.strictEqual(validateTarget('https://fhir.example.org/baseR4', blank), 'https://fhir.example.org/baseR4/$validate');
        }
    });

    it('posts the resource to a profile URL when options.profile is set', async function () {
        const profile = 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient';
        mockFetch(200, {resourceType: 'OperationOutcome', issue: []});
        await validateResource('https://fhir.example.org/baseR4', {resourceType: 'Patient'}, undefined, {profile});
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(new URL(calls[0].url).searchParams.get('profile'), profile);
        assert.strictEqual(calls[0].url.split('?')[0], 'https://fhir.example.org/baseR4/$validate');
        assert.deepStrictEqual(JSON.parse(calls[0].options.body), {resourceType: 'Patient'});
    });

    it('posts to the plain $validate URL when no profile is given', async function () {
        mockFetch(200, {resourceType: 'OperationOutcome', issue: []});
        await validateResource('https://fhir.example.org/baseR4', {resourceType: 'Patient'}, undefined, {});
        await validateResource('https://fhir.example.org/baseR4', {resourceType: 'Patient'}, undefined, {profile: ''});
        assert.strictEqual(calls[0].url, 'https://fhir.example.org/baseR4/$validate');
        assert.strictEqual(calls[1].url, 'https://fhir.example.org/baseR4/$validate');
    });

    it('rejects a missing or non-http URL', function () {
        assert.throws(() => validateTarget(''), {status: 400});
        assert.throws(() => validateTarget('file:///tmp/fhir'), {status: 400});
    });

    it('posts to $validate and returns OperationOutcome issues', async function () {
        const issues = [
            {severity: 'error', code: 'required', diagnostics: 'Patient.name missing'},
            {severity: 'warning', code: 'informational', details: {text: 'Check the identifier'}}
        ];
        mockFetch(200, {resourceType: 'OperationOutcome', issue: issues});
        const result = await validateResource('https://fhir.example.org/baseR4', {resourceType: 'Bundle', type: 'transaction'}, {auth: 'bearer', token: 'abc'});
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0].url, 'https://fhir.example.org/baseR4/$validate');
        assert.strictEqual(calls[0].options.method, 'POST');
        assert.strictEqual(calls[0].options.headers.Authorization, 'Bearer abc');
        assert.deepStrictEqual(JSON.parse(calls[0].options.body), {resourceType: 'Bundle', type: 'transaction'});
        assert.deepStrictEqual(result, {ok: true, status: 200, issues});
    });

    it('returns the parsed body when the response is not an OperationOutcome', async function () {
        mockFetch(200, {resourceType: 'Parameters'});
        const result = await validateResource('https://fhir.example.org', {resourceType: 'Patient'});
        assert.deepStrictEqual(result.issues, []);
        assert.deepStrictEqual(result.body, {resourceType: 'Parameters'});
    });

    it('reports ok false with issues for a non-2xx OperationOutcome', async function () {
        mockFetch(422, {resourceType: 'OperationOutcome', issue: [{severity: 'error', code: 'invalid'}]});
        const result = await validateResource('https://fhir.example.org', {resourceType: 'Patient'});
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.status, 422);
        assert.strictEqual(result.issues.length, 1);
    });

    it('truncates a text body to 500 characters', async function () {
        mockFetch(500, 'x'.repeat(800));
        const result = await validateResource('https://fhir.example.org', {resourceType: 'Patient'});
        assert.strictEqual(result.body.length, 500);
        assert.deepStrictEqual(result.issues, []);
    });

    it('turns a network failure into a 400 error', async function () {
        global.fetch = async () => {
            throw new Error('connect ECONNREFUSED');
        };
        await assert.rejects(
            () => validateResource('https://fhir.example.org', {resourceType: 'Patient'}),
            (err) => err.status === 400 && /ECONNREFUSED/.test(err.message)
        );
    });

    it('rejects a resource without resourceType before calling fetch', async function () {
        mockFetch(200, {});
        await assert.rejects(() => validateResource('https://fhir.example.org', {}), {status: 400});
        assert.strictEqual(calls.length, 0);
    });
});
