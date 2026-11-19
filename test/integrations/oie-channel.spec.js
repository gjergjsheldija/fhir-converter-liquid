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
});
