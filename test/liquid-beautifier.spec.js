/* eslint-env es2020 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';
import assert from 'assert';
import supertest from 'supertest';
import express from 'express';
import routes from '../src/routes.js';
import '../src/static/js/liquid-beautifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const beautify = () => globalThis.beautifyLiquidTemplate;

describe('Liquid template beautifier', function () {
    this.timeout(10000);

    it('indents nested liquid blocks and JSON with 4-space steps', () => {
        const input = [
            '{% assign x = 1 %}',
            '{',
            '  "a": 1,',
            '  {% if x %}',
            '  "b": {',
            '    "c": [',
            '      {% if x == 1 %}',
            '      1,',
            '      {% else %}',
            '      2,',
            '      {% endif %}',
            '    ]',
            '  },',
            '  {% endif %}',
            '  "d": 2',
            '}',
            ''
        ].join('\n');
        const expected = [
            '{% assign x = 1 %}',
            '{',
            '    "a": 1,',
            '{% if x %}',
            '        "b": {',
            '            "c": [',
            '                {% if x == 1 %}',
            '                    1,',
            '                {% else %}',
            '                    2,',
            '                {% endif %}',
            '            ]',
            '        },',
            '{% endif %}',
            '    "d": 2',
            '}',
            ''
        ].join('\n');
        assert.strictEqual(beautify()(input), expected);
    });

    it('preserves whitespace-control dash flags byte-for-byte', () => {
        const input = [
            '{%- assign x = 1 -%}',
            '{%- if x -%}',
            '    {{x}}',
            '{%- else -%}',
            '    {{ x }}',
            '{%- endif -%}',
            ''
        ].join('\n');
        const expected = [
            '{%- assign x = 1 -%}',
            '{%- if x -%}',
            '    {{ x }}',
            '{%- else -%}',
            '    {{ x }}',
            '{%- endif -%}',
            ''
        ].join('\n');
        assert.strictEqual(beautify()(input), expected);
    });

    it('keeps comment and raw bodies byte-verbatim with opener/closer at opener depth', () => {
        const input = [
            '    {% comment %}',
            '  raw { } "text" with {{ not a tag }} and {% not a tag %}',
            '        {% endcomment %}',
            'text',
            '{% raw %}',
            '    {{ kept }} and {% kept %} [1] {2}',
            '  {% endraw %}',
            'done',
            ''
        ].join('\n');
        const expected = [
            '{% comment %}',
            '  raw { } "text" with {{ not a tag }} and {% not a tag %}',
            '{% endcomment %}',
            'text',
            '{% raw %}',
            '    {{ kept }} and {% kept %} [1] {2}',
            '{% endraw %}',
            'done',
            ''
        ].join('\n');
        assert.strictEqual(beautify()(input), expected);
    });

    it('is idempotent', () => {
        const input = [
            '{%- assign x = 1 -%}',
            '{',
            '  "a": 1,',
            '  {% if x %}',
            '  "b": {',
            '    "c": [',
            '      {% if x == 1 %}',
            '      1,',
            '      {% else %}',
            '      2,',
            '      {% endif %}',
            '    ]',
            '  },',
            '  {% endif %}',
            '',
            '',
            '',
            '  "d": 2',
            '}',
            '    {% comment %}',
            '  body { } {{ kept }}',
            '        {% endcomment %}',
            ''
        ].join('\n');
        const once = beautify()(input);
        const twice = beautify()(once);
        assert.strictEqual(twice, once);
    });

    it('renders identically to the unformatted official templates', async () => {
        const app = routes(express());
        const adtRaw = readFileSync(join(__dirname, '../src/templates/Hl7v2/ADT_A04.liquid'), 'utf8');
        const locationRaw = readFileSync(join(__dirname, '../src/templates/Hl7v2/ID/_Location.liquid'), 'utf8');
        const adtFormatted = beautify()(adtRaw);
        const locationFormatted = beautify()(locationRaw);
        const srcData = readFileSync(join(__dirname, 'e2e-test/liquid-fixtures/SampleData/Hl7v2/ADT04-23.hl7'), 'utf8');

        assert.notStrictEqual(adtFormatted, adtRaw, 'formatter must change the root template layout');
        assert.notStrictEqual(locationFormatted, locationRaw, 'formatter must change the partial layout');

        const normalize = (value) => JSON.stringify(value)
            .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, 'UUID')
            .replace(/Resource bundle generated on \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/g, 'Resource bundle generated on TIMESTAMP');

        const baseline = await supertest(app)
            .post('/api/v1/convert/hl7v2')
            .send({ template: adtRaw, srcData });
        assert.strictEqual(baseline.status, 200, `baseline convert failed: ${JSON.stringify(baseline.body).slice(0, 500)}`);
        assert.ok(baseline.body.fhirResource, 'baseline response must include fhirResource');

        const formatted = await supertest(app)
            .post('/api/v1/convert/hl7v2')
            .send({
                template: adtFormatted,
                srcData,
                templatesOverride: {
                    'ADT_A04.liquid': adtFormatted,
                    'ID/_Location.liquid': locationFormatted
                }
            });
        assert.strictEqual(formatted.status, 200, `formatted convert failed: ${JSON.stringify(formatted.body).slice(0, 500)}`);
        assert.ok(formatted.body.fhirResource, 'formatted response must include fhirResource');

        // generate_uuid output and the Provenance "generated on" instant are non-deterministic; normalize both before comparing.
        assert.strictEqual(
            normalize(formatted.body.fhirResource),
            normalize(baseline.body.fhirResource),
            'formatted templates must render the same FHIR resource as the unformatted templates'
        );
    });
});
