// --------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License. See LICENSE file in the project root for license information.
// --------------------------------------------------------------------------------------------

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import xml2js from 'xml2js';

var dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'integrations', 'oie');

function createMirthMap(initial) {
    var store = Object.assign({}, initial || {});
    return {
        get: function (key) {
            return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        },
        put: function (key, value) {
            store[key] = value;
        }
    };
}

describe('OIE HL7v2 channel', function () {
    var channel;

    before(async function () {
        var xml = fs.readFileSync(path.join(dir, 'hl7v2-to-fhir.xml'), 'utf8');
        channel = (await xml2js.parseStringPromise(xml)).channel;
    });

    it('has the channel name', function () {
        assert.strictEqual(channel.name[0], 'hl7v2-to-fhir');
    });

    it('uses a TCP Listener source', function () {
        assert.strictEqual(channel.sourceConnector[0].transportName[0], 'TCP Listener');
    });

    it('posts to the convert endpoint over HTTP', function () {
        var connector = channel.destinationConnectors[0].connector[0];
        var props = connector.properties[0];
        assert.strictEqual(connector.transportName[0], 'HTTP Sender');
        assert.strictEqual(props.host[0], '127.0.0.1');
        assert.strictEqual(props.port[0], '2019');
        assert.strictEqual(props.method[0], 'post');
        assert.strictEqual(props.path[0], '/api/v1/convert/hl7v2');
    });

    it('README documents the ACK with MSH-10', function () {
        var readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8');
        assert.ok(readme.includes('MSH-10'));
        assert.ok(readme.includes('MSA|AA|'));
    });

    it('wires converterPayload and Authorization header on the HTTP destination', function () {
        var sourceProps = channel.sourceConnector[0].properties[0];
        assert.strictEqual(sourceProps.listenerConnectorProperties[0].host[0], '0.0.0.0');
        assert.strictEqual(sourceProps.listenerConnectorProperties[0].port[0], '6661');
        assert.strictEqual(sourceProps.responseConnectorProperties[0].respondAfterProcessing[0], 'true');

        var destProps = channel.destinationConnectors[0].connector[0].properties[0];
        assert.strictEqual(destProps.content[0], '${converterPayload}');
        var headerEntry = destProps.headers[0].entry[0];
        assert.strictEqual(headerEntry.string[0], 'Authorization');
        assert.strictEqual(headerEntry.list[0].string[0], '${authHeader}');
    });

    it('source transformer serializes valid RFC-8259 JSON, routes MSH-9 dynamically, and configures authHeader', function () {
        var step = channel.sourceConnector[0].transformer[0].elements[0]['com.mirth.connect.plugins.javascriptstep.JavaScriptStep'][0];
        var runTransformer = new Function('msg', 'channelMap', 'configurationMap', 'connectorMessage', step.script[0]);

        var rawHl7 = [
            'MSH|^~\\&|LAB_SYS|HOSP_FAC|OIE|HOSP_FAC|20261120120000||ORU^R01|MSG-ORU-9001|P|2.5.1',
            'PID|1||98765^^^HOSP^MR||SMITH^JOHN',
            'OBR|1||ORD123|GLU^Glucose^LN',
            'OBX|1|TX|NOTE^Clinical Note||Patient stated "fasting \\F\\ hydrated" since 22:00||||||F'
        ].join('\r') + '\r';

        var channelMap = createMirthMap();
        var emptyConfigMap = createMirthMap();
        runTransformer(rawHl7, channelMap, emptyConfigMap, { getRawData: function () { return rawHl7; } });

        assert.strictEqual(channelMap.get('msh10'), 'MSG-ORU-9001');
        assert.strictEqual(channelMap.get('templateName'), 'ORU_R01');
        assert.strictEqual(channelMap.get('authHeader'), '');

        var parsed = JSON.parse(channelMap.get('converterPayload'));
        assert.strictEqual(parsed.srcData, rawHl7);
        assert.strictEqual(parsed.template, 'ORU_R01');
        assert.ok(parsed.srcData.includes('\r'));
        assert.ok(parsed.srcData.includes('|^~\\&|'));
        assert.ok(parsed.srcData.includes('"fasting \\F\\ hydrated"'));

        var authedChannelMap = createMirthMap();
        var authedConfigMap = createMirthMap({ CONVERT_API_KEY: 'secret-token-123' });
        runTransformer(rawHl7, authedChannelMap, authedConfigMap, null);
        assert.strictEqual(authedChannelMap.get('authHeader'), 'Bearer secret-token-123');

        var structChannelMap = createMirthMap();
        var adtA04WithStruct = 'MSH#^~\\&#HIS#FAC#OIE#FAC#20261120120000##ADT^A04^ADT_A01#CTRL-404#P#2.5\rPID#1##123\r';
        runTransformer(adtA04WithStruct, structChannelMap, emptyConfigMap, null);
        assert.strictEqual(structChannelMap.get('msh10'), 'CTRL-404');
        assert.strictEqual(structChannelMap.get('templateName'), 'ADT_A01');
    });

    it('response transformer emits MSA|AA|<MSH-10> on HTTP 200 and MSA|AE|<MSH-10> on HTTP 400', function () {
        var sourceStep = channel.sourceConnector[0].transformer[0].elements[0]['com.mirth.connect.plugins.javascriptstep.JavaScriptStep'][0];
        var runSource = new Function('msg', 'channelMap', 'configurationMap', 'connectorMessage', sourceStep.script[0]);

        var responseStep = channel.destinationConnectors[0].connector[0].responseTransformer[0].elements[0]['com.mirth.connect.plugins.javascriptstep.JavaScriptStep'][0];
        var runAck = new Function('channelMap', 'connectorMap', 'responseMap', 'httpStatus', responseStep.script[0]);

        var rawHl7 = 'MSH|^~\\&|LAB|HOSP|OIE|HOSP|20261120120000||ORU^R01|MSG-ACK-42|P|2.5\rPID|1||12345\r';
        var channelMap = createMirthMap();
        runSource(rawHl7, channelMap, createMirthMap(), null);

        var okResponseMap = createMirthMap();
        var okConnectorMap = createMirthMap({ responseStatusLine: 'HTTP/1.1 200 OK' });
        var ack200 = runAck(channelMap, okConnectorMap, okResponseMap, undefined);
        assert.ok(ack200.includes('MSA|AA|MSG-ACK-42'));
        assert.strictEqual(okResponseMap.get('ackResponse'), ack200);

        var errResponseMap = createMirthMap();
        var errConnectorMap = createMirthMap({ responseStatusLine: 'HTTP/1.1 400 Bad Request' });
        var nack400 = runAck(channelMap, errConnectorMap, errResponseMap, undefined);
        assert.ok(nack400.includes('MSA|AE|MSG-ACK-42|Conversion failed'));
        assert.strictEqual(errResponseMap.get('ackResponse'), nack400);

        var direct200 = runAck(channelMap, createMirthMap(), createMirthMap(), 200);
        var direct400 = runAck(channelMap, createMirthMap(), createMirthMap(), 400);
        assert.ok(direct200.includes('MSA|AA|MSG-ACK-42'));
        assert.ok(direct400.includes('MSA|AE|MSG-ACK-42'));
    });
});
