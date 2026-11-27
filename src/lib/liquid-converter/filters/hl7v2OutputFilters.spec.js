import assert from 'node:assert/strict';
import { Liquid } from 'liquidjs';
import { external as registeredHelpers } from '../liquid-helpers.js';
import {
    hl7Escape,
    stripXhtml,
    hl7Datetime,
    hl7ControlId,
    resolveRef,
    identifierBySystem,
    identifierByType,
    codingBySystem,
    mapGender,
    mapDocStatus,
    flattenQrItems
} from './hl7v2OutputFilters.js';

describe('HL7v2 Healthcare Output Filters (hl7v2OutputFilters.js)', function () {
    describe('hl7Escape', function () {
        it('returns empty string for null or undefined and stringifies primitives', function () {
            assert.equal(hl7Escape(null), '');
            assert.equal(hl7Escape(undefined), '');
            assert.equal(hl7Escape(42), '42');
            assert.equal(hl7Escape(false), 'false');
        });

        it('escapes \\, |, ^, ~, & in exact order without double-escaping \\E\\', function () {
            const raw = 'Path\\dir | A^B ~ C&D';
            assert.equal(hl7Escape(raw), 'Path\\E\\dir \\F\\ A\\S\\B \\R\\ C\\T\\D');
        });

        it('replaces CRLF/LF/CR with \\.br\\ by default or space when mode="space", and strips control chars', function () {
            const multiline = 'Line 1\r\nLine 2\nLine 3\rLine 4\x00\x07\x1F';
            assert.equal(hl7Escape(multiline), 'Line 1\\.br\\Line 2\\.br\\Line 3\\.br\\Line 4');
            assert.equal(hl7Escape(multiline, 'space'), 'Line 1 Line 2 Line 3 Line 4');
        });
    });

    describe('stripXhtml', function () {
        it('converts XHTML paragraphs, breaks, headings, and list items to clean decoded lines', function () {
            const xhtml = `
                <div xmlns="http://www.w3.org/1999/xhtml">
                    <h2>Entlassungsbrief</h2>
                    <p>Patientin Anna   M&uuml;ller &amp; Partner.<br/>Zustand stabil &lt;NYHA II&gt;.</p>
                    <ul>
                        <li>Ramipril 5 mg</li>
                        <li class="med">Torasemid 10 mg</li>
                    </ul>
                </div>
            `;
            assert.equal(
                stripXhtml(xhtml),
                [
                    'Entlassungsbrief',
                    'Patientin Anna Müller & Partner.',
                    'Zustand stabil <NYHA II>.',
                    '- Ramipril 5 mg',
                    '- Torasemid 10 mg'
                ].join('\n')
            );
            assert.equal(stripXhtml(null), '');
        });
    });

    describe('hl7Datetime', function () {
        it('converts ISO-8601 dates, UTC instants, and offset dateTimes to HL7v2 DTM', function () {
            assert.equal(hl7Datetime('1980-05-14'), '19800514');
            assert.equal(hl7Datetime('1980-05'), '198005');
            assert.equal(hl7Datetime('1980'), '1980');
            assert.equal(hl7Datetime('2026-11-26T14:30:05+01:00'), '20261126143005+0100');
            assert.equal(hl7Datetime('2026-11-26T09:15:00-05:00'), '20261126091500-0500');
            assert.equal(hl7Datetime('2026-11-26T13:30:05.123Z'), '20261126133005+0000');
        });

        it('supports precision="date" and precision="local" and handles empty/invalid inputs', function () {
            assert.equal(hl7Datetime('2026-11-26T14:30:05+01:00', 'date'), '20261126');
            assert.equal(hl7Datetime('2026-11-26T13:30:05.123Z', 'local'), '20261126133005');
            assert.equal(hl7Datetime('2026-11-26T14:30:05+01:00', 'local'), '20261126143005');
            assert.equal(hl7Datetime(null), '');
            assert.equal(hl7Datetime(''), '');
            assert.equal(hl7Datetime('not-a-date'), '');
        });
    });

    describe('hl7ControlId', function () {
        it('produces deterministic <=20 char IDs for non-empty seeds and random <=20 char IDs otherwise', function () {
            const id1 = hl7ControlId('discharge-doc-bundle-001');
            const id2 = hl7ControlId('discharge-doc-bundle-001');
            const id3 = hl7ControlId('discharge-qr-bundle-002');
            assert.equal(id1, id2);
            assert.notEqual(id1, id3);
            assert.ok(id1.startsWith('MSG'));
            assert.ok(id1.length <= 20);
            assert.match(id1, /^MSG[0-9A-F]{17}$/);

            const rand1 = hl7ControlId('');
            const rand2 = hl7ControlId(null);
            assert.ok(rand1.length <= 20);
            assert.ok(rand2.length <= 20);
            assert.notEqual(rand1, rand2);
        });
    });

    describe('resolveRef', function () {
        const byRef = {
            'Patient/pat-1': { resourceType: 'Patient', id: 'pat-1' },
            'urn:uuid:abc-123': { resourceType: 'Practitioner', id: 'prac-1' },
            '#med-1': { resourceType: 'Medication', id: 'med-1' }
        };

        it('resolves string references, Reference objects, contained #ids, and full URLs', function () {
            assert.equal(resolveRef('Patient/pat-1', byRef).id, 'pat-1');
            assert.equal(resolveRef({ reference: 'urn:uuid:abc-123' }, byRef).id, 'prac-1');
            assert.equal(resolveRef('#med-1', byRef).id, 'med-1');
            assert.equal(resolveRef('https://fhir.example.org/r4/Patient/pat-1', byRef).id, 'pat-1');
            assert.equal(resolveRef('Patient/missing', byRef), null);
            assert.equal(resolveRef(null, byRef), null);
        });
    });

    describe('identifierBySystem & identifierByType & codingBySystem', function () {
        const ids = [
            {
                system: 'https://hosp.example/mrn',
                value: 'MRN-001',
                type: { coding: [{ code: 'MR' }] }
            },
            {
                system: 'http://fhir.de/sid/gkv/kvid-10',
                value: 'A999888777',
                type: { coding: [{ code: 'GKV' }] }
            }
        ];

        it('finds identifiers by system with configurable fallback and supports single Identifier objects', function () {
            assert.equal(identifierBySystem(ids, 'http://fhir.de/sid/gkv/kvid-10').value, 'A999888777');
            assert.equal(identifierBySystem(ids, 'https://unknown', true).value, 'MRN-001');
            assert.equal(identifierBySystem(ids, 'https://unknown', false), null);
            assert.equal(identifierBySystem({ identifier: ids }, 'https://hosp.example/mrn').value, 'MRN-001');
            assert.equal(identifierBySystem({ system: 'urn:doc', value: 'DOC-1' }, '').value, 'DOC-1');
        });

        it('finds identifiers by type.coding[].code', function () {
            assert.equal(identifierByType(ids, 'MR').value, 'MRN-001');
            assert.equal(identifierByType(ids, 'GKV').value, 'A999888777');
            assert.equal(identifierByType(ids, 'VN'), null);
        });

        it('finds codings by preferred system from CodeableConcept or coding[]', function () {
            const cc = {
                coding: [
                    { system: 'http://snomed.info/sct', code: '84114007', display: 'Heart failure' },
                    { system: 'http://fhir.de/CodeSystem/bfarm/icd-10-gm', code: 'I50.13', display: 'NYHA III' }
                ],
                text: 'Herzinsuffizienz'
            };
            assert.equal(codingBySystem(cc, 'http://fhir.de/CodeSystem/bfarm/icd-10-gm').code, 'I50.13');
            assert.equal(codingBySystem(cc.coding, 'http://loinc.org', true).code, '84114007');
            assert.equal(codingBySystem(cc.coding, 'http://loinc.org', false), null);
        });
    });

    describe('mapGender & mapDocStatus', function () {
        it('maps FHIR gender codes to HL7v2 Table 0001', function () {
            assert.equal(mapGender('male'), 'M');
            assert.equal(mapGender('female'), 'F');
            assert.equal(mapGender('other'), 'O');
            assert.equal(mapGender('unknown'), 'U');
            assert.equal(mapGender(null), 'U');
        });

        it('maps FHIR Composition / QuestionnaireResponse statuses to HL7v2 TXA-17 codes', function () {
            assert.equal(mapDocStatus('preliminary'), 'PA');
            assert.equal(mapDocStatus('in-progress'), 'PA');
            assert.equal(mapDocStatus('final'), 'AU');
            assert.equal(mapDocStatus('completed'), 'AU');
            assert.equal(mapDocStatus('amended'), 'LA');
            assert.equal(mapDocStatus('corrected'), 'LA');
            assert.equal(mapDocStatus('entered-in-error'), 'CA');
            assert.equal(mapDocStatus('stopped'), 'CA');
            assert.equal(mapDocStatus(undefined), 'AU');
        });
    });

    describe('flattenQrItems', function () {
        it('recursively flattens nested groups and answer sub-items across all FHIR answer types', function () {
            const qrItems = [
                {
                    linkId: 'grp-1',
                    text: 'Assessment',
                    item: [
                        {
                            linkId: 'score',
                            text: 'Barthel Score',
                            code: [{ system: 'http://loinc.org', code: '96761-2', display: 'Barthel Index' }],
                            answer: [{ valueInteger: 0 }]
                        },
                        {
                            linkId: 'weight',
                            text: 'Weight',
                            answer: [{ valueQuantity: { value: 70.5, unit: 'kg' } }]
                        },
                        {
                            linkId: 'rehab',
                            text: 'Needs Rehab',
                            answer: [
                                {
                                    valueBoolean: false,
                                    item: [
                                        {
                                            linkId: 'aid',
                                            text: 'Aid',
                                            answer: [{ valueCoding: { system: 'http://snomed.info/sct', code: '404949001', display: 'Rollator' } }]
                                        }
                                    ]
                                }
                            ]
                        },
                        {
                            linkId: 'followup-date',
                            text: 'Follow-up',
                            answer: [{ valueDate: '2026-12-03' }]
                        },
                        {
                            linkId: 'timestamp',
                            text: 'Recorded At',
                            answer: [{ valueDateTime: '2026-11-26T15:00:00Z' }]
                        },
                        {
                            linkId: 'short-note',
                            text: 'Short Note',
                            answer: [{ valueString: 'Single line' }]
                        },
                        {
                            linkId: 'long-note',
                            text: 'Long Note',
                            answer: [{ valueString: 'Line 1\nLine 2' }]
                        }
                    ]
                }
            ];

            const flat = flattenQrItems(qrItems);
            assert.equal(flat.length, 8);

            assert.equal(flat[0].hl7DataType, 'NM');
            assert.equal(flat[0].value, '0');
            assert.equal(flat[0].code, '96761-2');

            assert.equal(flat[1].hl7DataType, 'NM');
            assert.equal(flat[1].value, '70.5');
            assert.equal(flat[1].unit, 'kg');

            assert.equal(flat[2].hl7DataType, 'CWE');
            assert.deepEqual(flat[2].value, {
                code: 'N',
                display: 'No',
                system: 'http://terminology.hl7.org/CodeSystem/v2-0136'
            });

            assert.equal(flat[3].hl7DataType, 'CE');
            assert.equal(flat[3].value.code, '404949001');

            assert.equal(flat[4].hl7DataType, 'DT');
            assert.equal(flat[4].value, '2026-12-03');

            assert.equal(flat[5].hl7DataType, 'DTM');
            assert.equal(flat[6].hl7DataType, 'ST');
            assert.equal(flat[7].hl7DataType, 'FT');
        });
    });

    describe('Liquid registration in liquid-helpers.js', function () {
        it('registers all 11 snake_case filters and executes them in a LiquidJS pipeline', async function () {
            const expectedNames = [
                'hl7_escape',
                'strip_xhtml',
                'hl7_datetime',
                'hl7_control_id',
                'resolve_ref',
                'identifier_by_system',
                'identifier_by_type',
                'coding_by_system',
                'map_gender',
                'map_doc_status',
                'flatten_qr_items'
            ];
            const engine = new Liquid();
            for (const f of registeredHelpers) {
                engine.registerFilter(f.name, f.func);
            }
            for (const name of expectedNames) {
                assert.ok(registeredHelpers.some((h) => h.name === name), `Missing filter ${name}`);
            }

            const rendered = await engine.parseAndRender(
                '{{ html | strip_xhtml | hl7_escape }}|{{ gender | map_gender }}|{{ status | map_doc_status }}|{{ dt | hl7_datetime }}',
                {
                    html: '<p>A &amp; B<br/>C | D</p>',
                    gender: 'female',
                    status: 'final',
                    dt: '2026-11-26T14:45:00+01:00'
                }
            );
            assert.equal(rendered, 'A \\T\\ B\\.br\\C \\F\\ D|F|AU|20261126144500+0100');
        });
    });
});
