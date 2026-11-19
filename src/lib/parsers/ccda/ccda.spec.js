// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import assert from 'assert';
import {readFileSync} from 'fs';
import {join} from 'path';
import {BASE_TEMPLATE_FILES_LOCATION, CCDA_LIQUID_TEMPLATE_LOCATION} from '../../constants/constants.js';
import dataHandlerFactory from '../../dataHandler/dataHandlerFactory.js';
import {convertInlineHl7v2} from '../../workers/worker.js';
import {parseCcda, summarizeCcda} from './ccda.js';

const DOCUMENT = `<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:sdtc="urn:hl7-org:sdtc">
  <id root="1.2.3"/>
  <title>Hello</title>
  <recordTarget>
    <patientRole>
      <patient>
        <name>
          <given>Adam</given>
          <given qualifier="CL">Frankie</given>
        </name>
        <sdtc:raceCode code="2106-3"/>
      </patient>
    </patientRole>
  </recordTarget>
</ClinicalDocument>`;

describe('ccda', function () {
    it('parses a document into the CcdaDataParser object model', async function () {
        const parsed = await parseCcda(DOCUMENT);
        const doc = parsed.ClinicalDocument;
        assert.strictEqual(doc.id.root, '1.2.3');
        assert.strictEqual(doc.title._, 'Hello');
        const patient = doc.recordTarget.patientRole.patient;
        assert.deepStrictEqual(patient.name.given, [{_: 'Adam'}, {qualifier: 'CL', _: 'Frankie'}]);
        assert.strictEqual(patient.sdtc_raceCode.code, '2106-3');
        assert.strictEqual(parsed._originalData.includes('\n'), false);
        assert.strictEqual(parsed._originalData.includes('\r'), false);
    });

    it('strips CR and LF from _originalData', async function () {
        const parsed = await parseCcda(DOCUMENT.replace(/\n/g, '\r\n'));
        assert.strictEqual(/[\r\n]/.test(parsed._originalData), false);
    });

    it('throws for whitespace-only input', async function () {
        await assert.rejects(() => parseCcda('  \n\t '));
        await assert.rejects(() => parseCcda(''));
    });

    it('is registered in the data handler factory', function () {
        assert.strictEqual(dataHandlerFactory.createDataHandler('ccda').dataType, 'ccda');
    });

    it('renders a template with msg set to the parsed document', async function () {
        const result = await convertInlineHl7v2({
            srcDataType: 'ccda',
            srcData: DOCUMENT,
            template: '{"id":"{{ msg.ClinicalDocument.id.root }}"}'
        });
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.resultMsg.fhirResource.id, '1.2.3');
    });

    it('does not call the HL7 segment serializer for debug=true', async function () {
        const result = await convertInlineHl7v2({
            srcDataType: 'ccda',
            srcData: DOCUMENT,
            template: '{"id":"{{ msg.ClinicalDocument.id.root }}"}',
            debug: true
        });
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.resultMsg.debugInfo.parsedHl7v2, null);
        assert.strictEqual(result.resultMsg.debugInfo.parsedCcda.name, 'ClinicalDocument');
    });

    it('does not set parsedCcda for an HL7 v2 debug conversion', async function () {
        const result = await convertInlineHl7v2({
            srcDataType: 'hl7v2',
            srcData: 'MSH|^~\\&|A|B|C|D|20200101||ADT^A01|1|P|2.5\rPID|1||123',
            template: '{"id":"x"}',
            debug: true
        });
        assert.strictEqual(result.status, 200);
        assert.ok(result.resultMsg.debugInfo.parsedHl7v2);
        assert.strictEqual('parsedCcda' in result.resultMsg.debugInfo, false);
    });

    it('summarizes the parsed document into elements, attributes, and text', async function () {
        const summary = summarizeCcda(await parseCcda(DOCUMENT));
        assert.strictEqual(summary.name, 'ClinicalDocument');
        assert.ok('xmlns' in summary.attributes);
        const byName = (node, name) => node.children.filter((child) => child.name === name);
        const [id] = byName(summary, 'id');
        assert.deepStrictEqual(id.attributes, {root: '1.2.3'});
        assert.strictEqual(id.text, null);
        const [title] = byName(summary, 'title');
        assert.strictEqual(title.text, 'Hello');
        const [recordTarget] = byName(summary, 'recordTarget');
        const [patient] = byName(byName(recordTarget, 'patientRole')[0], 'patient');
        const [name] = byName(patient, 'name');
        const given = byName(name, 'given');
        assert.strictEqual(given.length, 2);
        assert.strictEqual(given[0].text, 'Adam');
        assert.deepStrictEqual(given[1].attributes, {qualifier: 'CL'});
        assert.strictEqual(JSON.stringify(summary).includes('_originalData'), false);
    });

    it('skips null elements in the summary', async function () {
        const summary = summarizeCcda(await parseCcda('<a><b/><c x="1"/></a>'));
        assert.deepStrictEqual(summary.children.map((child) => child.name), ['c']);
    });

    it('rejects an unparsable C-CDA document with a 400', async function () {
        await assert.rejects(
            () => convertInlineHl7v2({srcDataType: 'ccda', srcData: '<a>', template: '{}'}),
            (err) => err && err.status === 400
        );
    });

    it('syncs CCD.liquid into the base template tree', function () {
        const source = readFileSync(join(BASE_TEMPLATE_FILES_LOCATION, 'Ccda', 'CCD.liquid'), 'utf8');
        assert.ok(source.includes('msg.ClinicalDocument.recordTarget.patientRole'));
    });

    it('converts the document to a Bundle through CCD.liquid', async function () {
        const template = readFileSync(join(CCDA_LIQUID_TEMPLATE_LOCATION, 'CCD.liquid'), 'utf8');
        const result = await convertInlineHl7v2({
            srcDataType: 'ccda',
            srcData: DOCUMENT,
            template,
            templateDirectory: CCDA_LIQUID_TEMPLATE_LOCATION
        });
        assert.strictEqual(result.status, 200);
        assert.strictEqual(result.resultMsg.fhirResource.resourceType, 'Bundle');
    });
});
