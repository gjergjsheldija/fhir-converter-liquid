// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import assert from 'assert';
import {readFileSync} from 'fs';
import {ccdaHoverAt} from './ccdaHover.js';

const DOCUMENT = `<?xml version="1.0" encoding="UTF-8"?>
<!-- a <comment> -->
<ClinicalDocument xmlns="urn:hl7-org:v3" xmlns:sdtc="urn:hl7-org:sdtc">
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

function at(document, needle, delta = 0, occurrence = 0) {
    let index = -1;
    for (let k = 0; k <= occurrence; k++) {
        index = document.indexOf(needle, index + 1);
    }
    assert.ok(index >= 0, `missing ${needle}`);
    const before = document.slice(0, index + delta);
    const lines = before.split('\n');
    return [lines.length - 1, lines[lines.length - 1].length];
}

function hover(document, needle, delta = 0, occurrence = 0) {
    const [line, ch] = at(document, needle, delta, occurrence);
    return ccdaHoverAt(document, line, ch);
}

describe('ccdaHoverAt', function () {
    it('returns an attribute path and value', function () {
        assert.deepStrictEqual(hover(DOCUMENT, 'root="1.2.3"', 7), {
            path: 'msg.ClinicalDocument.id.root',
            value: '1.2.3'
        });
        assert.deepStrictEqual(hover(DOCUMENT, 'root="1.2.3"', 0), {
            path: 'msg.ClinicalDocument.id.root',
            value: '1.2.3'
        });
    });

    it('returns a text path and value', function () {
        assert.deepStrictEqual(hover(DOCUMENT, 'Hello', 2), {
            path: 'msg.ClinicalDocument.title._',
            value: 'Hello'
        });
    });

    it('indexes repeated siblings from 0', function () {
        assert.deepStrictEqual(hover(DOCUMENT, 'Adam', 1), {
            path: 'msg.ClinicalDocument.recordTarget.patientRole.patient.name.given[0]._',
            value: 'Adam'
        });
        assert.deepStrictEqual(hover(DOCUMENT, 'Frankie', 3), {
            path: 'msg.ClinicalDocument.recordTarget.patientRole.patient.name.given[1]._',
            value: 'Frankie'
        });
        assert.deepStrictEqual(hover(DOCUMENT, 'qualifier="CL"', 12), {
            path: 'msg.ClinicalDocument.recordTarget.patientRole.patient.name.given[1].qualifier',
            value: 'CL'
        });
    });

    it('uses the parsed name for a tag prefix', function () {
        assert.deepStrictEqual(hover(DOCUMENT, 'code="2106-3"', 7), {
            path: 'msg.ClinicalDocument.recordTarget.patientRole.patient.sdtc_raceCode.code',
            value: '2106-3'
        });
        assert.deepStrictEqual(hover(DOCUMENT, 'sdtc:raceCode', 3), {
            path: 'msg.ClinicalDocument.recordTarget.patientRole.patient.sdtc_raceCode',
            value: null
        });
    });

    it('returns the element path and a null value on a tag name', function () {
        assert.deepStrictEqual(hover(DOCUMENT, '<title>', 2), {path: 'msg.ClinicalDocument.title', value: null});
        assert.deepStrictEqual(hover(DOCUMENT, '</title>', 3), {path: 'msg.ClinicalDocument.title', value: null});
        assert.deepStrictEqual(hover(DOCUMENT, '<ClinicalDocument', 4), {path: 'msg.ClinicalDocument', value: null});
    });

    it('returns null outside an element', function () {
        assert.strictEqual(ccdaHoverAt(DOCUMENT, 0, 5), null); // XML declaration
        assert.strictEqual(hover(DOCUMENT, 'a <comment>', 4), null); // comment, tag-like text
        assert.strictEqual(ccdaHoverAt(DOCUMENT, 3, 0), null); // indentation between elements
        assert.strictEqual(ccdaHoverAt(DOCUMENT, 99, 0), null);
        assert.strictEqual(ccdaHoverAt(DOCUMENT, 3, 400), null);
        assert.strictEqual(ccdaHoverAt('', 0, 0), null);
        assert.strictEqual(ccdaHoverAt('plain text', 0, 2), null);
        assert.strictEqual(ccdaHoverAt(undefined, 0, 0), null);
    });

    it('decodes entities and reads CDATA', function () {
        const doc = '<A><b x="1 &amp; 2">a &lt; b</b><c><![CDATA[x<y]]></c></A>';
        assert.deepStrictEqual(hover(doc, 'x="1', 1), {path: 'msg.A.b.x', value: '1 & 2'});
        assert.deepStrictEqual(hover(doc, 'a &lt;', 1), {path: 'msg.A.b._', value: 'a < b'});
        assert.deepStrictEqual(hover(doc, 'x<y', 1), {path: 'msg.A.c._', value: 'x<y'});
    });

    it('survives a half typed document', function () {
        const doc = '<A>\n  <b>one</b>\n  <b attr="two';
        assert.deepStrictEqual(hover(doc, 'one', 1), {path: 'msg.A.b[0]._', value: 'one'});
        assert.deepStrictEqual(hover(doc, 'attr="two', 8), {path: 'msg.A.b[1].attr', value: 'two'});
    });

    it('handles CRLF line endings', function () {
        const doc = DOCUMENT.replace(/\n/g, '\r\n');
        const [line, ch] = at(DOCUMENT, 'Hello', 1);
        assert.deepStrictEqual(ccdaHoverAt(doc, line, ch), {path: 'msg.ClinicalDocument.title._', value: 'Hello'});
    });

    it('keeps the copy in src/static/js/debug-hover.js identical', function () {
        const body = (source, label) => {
            const start = source.indexOf('function ccdaHoverAt(');
            const end = source.indexOf('// end ccdaHoverAt', start);
            assert.ok(start >= 0 && end > start, `${label} has no ccdaHoverAt copy`);
            return source
                .slice(start, end)
                .split('\n')
                .map((row) => row.trim())
                .filter((row) => row.length > 0)
                .join('\n');
        };
        const module = body(readFileSync(new URL('./ccdaHover.js', import.meta.url), 'utf8'), 'ccdaHover.js');
        const browser = body(readFileSync(new URL('../../../static/js/debug-hover.js', import.meta.url), 'utf8'), 'debug-hover.js');
        assert.strictEqual(browser, module);
        assert.ok(!/^\s*(import|export)\s/m.test(readFileSync(new URL('../../../static/js/debug-hover.js', import.meta.url), 'utf8')));
    });
});
