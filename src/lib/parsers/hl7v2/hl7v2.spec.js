// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {equal, fail, throws} from 'assert';
import {readFile} from 'fs';
import hl7, {parseHL7v2} from './hl7v2.js';
import path, {join} from 'path';
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('hl7v2', function () {
    it('should throw when first segment is not MSH.', function () {
        throws(() => {
            parseHL7v2("MSQ|||");
        }, Error, "Invalid HL7 v2 message, first segment id = MSQ");
    });

    it('should throw when MSH segment does not contain separators.', function () {
        throws(() => {
            parseHL7v2("MSH|||");
        }, Error, "MSH segment missing separators!");
    });

    it('should throw when separators are not unique.', function () {
        throws(() => {
            parseHL7v2("MSH|^~^#|");
        }, Error, "Duplicate separators");
    });

    it('should throw when escape character is not backspace', function () {
        throws(() => {
            parseHL7v2("MSH|^~#&|NES|NINTENDO|");
        }, Error, "Escape character is *not* backspace. This has not been tested!");
    });

    it('should strip a leading UTF-8 BOM and parse successfully.', function () {
        var msg = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||';
        var msgWithBom = '﻿' + msg;
        var resultWithBom = parseHL7v2(msgWithBom);
        equal(resultWithBom.v2.meta[0], 'MSH');
        equal(resultWithBom.v2.data[0][1][0][0], 'AccMgr');
    });

    it('should parse a message without a BOM identically to before (no accidental stripping).', function () {
        var msg = 'MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||';
        var result = parseHL7v2(msg);
        equal(result.v2.meta[0], 'MSH');
        equal(result.v2.data[0][1][0][0], 'AccMgr');
    });

    var fileNames = ['ADT01-23.hl7', 'ADT04-23.hl7', 'ADT04-251.hl7', 'IZ_1_1.1_Admin_Child_Max_Message.hl7', 'LRI_2.0-NG_CBC_Typ_Message.hl7'];
    fileNames.forEach(fileName => {
        it('should return an array when given valid HL7 v2 message (' + fileName + ')', function (done) {
            var messageFile = join(join(__dirname, "../../../sample-data/hl7v2"), fileName);
            parseFile(messageFile, function (out) {
                done(Array.isArray(out));
            });
        });
    });

    it('should preprocess template correctly.', function () {
        var result = new hl7().preProcessTemplate('{{PID-2}}');
        equal(result, '{{PID.[1]}}');
    });

    it('should postprocess result correctly.', function () {
        var result = new hl7().postProcessResult('{"a":"b",,,,}');
        equal(JSON.stringify(result), JSON.stringify({'a': 'b'}));
    });

    it('should successfully parse correct data.', function (done) {
        new hl7().parseSrcData('MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3|||')
            .then(() => done())
            .catch(() => fail());
    });

    it('should fail while parsing incorrect data.', function (done) {
        new hl7().parseSrcData('MSQ|||')
            .then(() => fail())
            .catch(() => done());
    });
});

function parseFile(filePath, cb) {
    readFile(filePath, (err, msg) => {
        cb(parseHL7v2(msg.toString()));
    });
}
