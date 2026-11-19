// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import assert from 'assert';
import {validateTarget, validateResource} from './sendResource.js';

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
