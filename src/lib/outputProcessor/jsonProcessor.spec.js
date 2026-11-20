// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {equal} from 'assert';
import {Process} from './jsonProcessor.js';

describe('jsonProcessor', function () {
    const parseTests = [
        {in: '{"a":"b"}', out: '{"a":"b"}'}, // simple case with no error
        {in: '{,"a":"b",,"c":"d",}', out: '{"a":"b","c":"d"}'}, // extra commas in obj
        {in: '{"c":[,"d",,,"e",,]}', out: '{"c":["d","e"]}'}, // extra commas in array
        {in: '{"c":[,"",]}', out: '{}'}, // empty array and obj entries
        {in: '{"a":[,],"b":[,]}', out: '{}'}, // 2 empty array
        {in: '{"a":{,},"b":{,}}', out: '{}'}, // 2 empty objs
        {in: '{"a":"","b":"d"}', out: '{"b":"d"}'}, // empty value
        {in: '{"a":"b,,}"}', out: '{"a":"b,,}"}'}, // commas and curly brace part of string
        {in: '{"a":"\\"b"}', out: '{"a":"\\"b"}'}, // quotes inside string
        {in: '{"a":"b}', out: '{}'}, // corrupted data test (just for code coverage)
        {in: '{"b":["c",],"d":{,},}', out: '{"b":["c"]}'}, // should remove empty fields in a complex input
        {in: '{"a":"1""b":"2"}', out: '{"a":"1","b":"2"}'}, // missing comma between pairs
        {in: '{"a":"""b":"2"}', out: '{"b":"2"}'}, // missing comma between pairs with first value empty
        {in: '{"a":"1","b":,"c":"3"}', out: '{"a":"1","c":"3"}'}, // missing value in middle pair
        {in: '{"a":"1","b":"c":"3"}', out: '{"a":"1","c":"3"}'}, // missing value and comma in middle pair
        {in: '{"a":"1","b","c":"3"}', out: '{"a":"1","c":"3"}'}, // only value in middle pair
        {in: '{"a":"1","b":{"c"},"d":"4"}', out: '{"a":"1","d":"4"}'}, // middle pair with incorrect value obj
        {in: '{"zero":0,"neg":-12.34,"exp":1e5,"sci":-2.5E-3}', out: '{"zero":0,"neg":-12.34,"exp":1e5,"sci":-2.5E-3}'}, // numbers
        {in: '{"t":true,"f":false,"arr":[true,,false,]}', out: '{"t":true,"f":false,"arr":[true,false]}'}, // booleans
        {in: '{"a":null}', out: '{"a":null}'}, // null literal preservation in object
        {in: '{"a":[null,"",null],"b":""}', out: '{"a":[null,null]}'}, // null preserved while empty strings pruned
        {in: '{"div":"\\u003cdiv xmlns=\\"http:\\/\\/www.w3.org\\/1999\\/xhtml\\"\\u003e\\n\\t\\r\\b\\f\\\\text\\u003c/div\\u003e"}', out: '{"div":"\\u003cdiv xmlns=\\"http:\\/\\/www.w3.org\\/1999\\/xhtml\\"\\u003e\\n\\t\\r\\b\\f\\\\text\\u003c/div\\u003e"}'}, // unicode and standard escapes
        {in: '{"entry":[,{"resource":{"resourceType":"Patient","id":"1","name":[{"family":"Doe","given":["Jane",""]}],}},,{"resource":{"name":[{}]}} ,{"resource":{"resourceType":"Observation","value":0}}]}', out: '{"entry":[{"resource":{"resourceType":"Patient","id":"1","name":[{"family":"Doe","given":["Jane"]}]}},{"resource":{"resourceType":"Observation","value":0}}]}'}, // nested arrays of objects
        {in: '{"a":{"b":{"c":[{},[,],[""],{"d":,"e":"","f":[{,"g":{}}]}]}}}', out: '{}'}, // deeply nested empty structures
    ];

    parseTests.forEach(t => {
        it(`jsonProcessor(${t.in}) should return ${t.out}`, function () {
            equal(Process(t.in), t.out);
        });
    });

    it('should return non-string input unchanged', function () {
        equal(Process(null), null);
        equal(Process(undefined), undefined);
    });
});
