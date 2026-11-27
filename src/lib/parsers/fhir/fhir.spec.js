import assert from 'node:assert/strict';
import dataHandlerFactory from '../../dataHandler/dataHandlerFactory.js';
import FhirHandler, { parseFhirBundle, summarizeHl7v2Output } from './fhir.js';

const SAMPLE_BUNDLE = {
    resourceType: 'Bundle',
    id: 'bundle-test-1',
    type: 'document',
    entry: [
        {
            fullUrl: 'urn:uuid:comp-1',
            resource: {
                resourceType: 'Composition',
                id: 'comp-1',
                status: 'final',
                title: 'Discharge Summary'
            }
        },
        {
            fullUrl: 'urn:uuid:pat-1',
            resource: {
                resourceType: 'Patient',
                id: 'pat-1',
                gender: 'female',
                birthDate: '1975-03-21'
            }
        },
        {
            fullUrl: 'urn:uuid:enc-1',
            resource: {
                resourceType: 'Encounter',
                id: 'enc-1',
                status: 'finished'
            }
        },
        {
            fullUrl: 'urn:uuid:medreq-1',
            resource: {
                resourceType: 'MedicationRequest',
                id: 'medreq-1',
                contained: [
                    {
                        resourceType: 'Medication',
                        id: 'med-contained-1',
                        code: { text: 'Bisoprolol 5mg' }
                    }
                ],
                medicationReference: { reference: '#med-contained-1' }
            }
        },
        {
            fullUrl: 'urn:uuid:cond-1',
            resource: {
                resourceType: 'Condition',
                id: 'cond-1',
                code: { text: 'Heart failure' }
            }
        },
        {
            fullUrl: 'urn:uuid:cond-2',
            resource: {
                resourceType: 'Condition',
                id: 'cond-2',
                code: { text: 'Hypertension' }
            }
        },
        null,
        { fullUrl: 'urn:uuid:empty' }
    ]
};

describe('FHIR reverse parser (fhir.js)', function () {
    it('registers fhir in dataHandlerFactory', function () {
        const handler = dataHandlerFactory.createDataHandler('fhir');
        assert.ok(handler instanceof FhirHandler);
        assert.equal(handler.dataType, 'fhir');
    });

    describe('parseSrcData / parseFhirBundle', function () {
        it('parses both a JSON string and a plain Bundle object identically', async function () {
            const handler = new FhirHandler();
            const fromString = await handler.parseSrcData(JSON.stringify(SAMPLE_BUNDLE));
            const fromObj = await handler.parseSrcData(SAMPLE_BUNDLE);

            assert.equal(fromString.bundle.id, 'bundle-test-1');
            assert.equal(fromObj.bundle.id, 'bundle-test-1');
            assert.equal(fromString.entries.length, 6);
            assert.equal(fromObj.entries.length, 6);
            assert.equal(fromString.patient.id, 'pat-1');
            assert.equal(fromString.encounter.id, 'enc-1');
            assert.equal(fromString.composition.id, 'comp-1');
            assert.equal(fromString.questionnaireResponse, null);
            assert.equal(fromString.practitioner, null);
            assert.equal(fromString.organization, null);
            assert.equal(fromString.relatedPerson, null);
            assert.equal(fromString.documentReference, null);
        });

        it('indexes resources by resourceType and byRef (ResourceType/id, fullUrl, and #containedId)', async function () {
            const parsed = await parseFhirBundle(SAMPLE_BUNDLE);
            assert.equal(parsed.byType.Condition.length, 2);
            assert.equal(parsed.byType.Patient.length, 1);

            assert.equal(parsed.byRef['Patient/pat-1'].birthDate, '1975-03-21');
            assert.equal(parsed.byRef['urn:uuid:pat-1'].id, 'pat-1');
            assert.equal(parsed.byRef['#med-contained-1'].code.text, 'Bisoprolol 5mg');
            assert.equal(parsed.byRef['Medication/med-contained-1'].code.text, 'Bisoprolol 5mg');
        });

        it('rejects empty strings, invalid JSON, non-objects, and non-Bundle resources', async function () {
            await assert.rejects(() => parseFhirBundle(''), /non-empty JSON string/);
            await assert.rejects(() => parseFhirBundle('   \n  '), /non-empty JSON string/);
            await assert.rejects(() => parseFhirBundle('{bad json'), /Invalid FHIR JSON/);
            await assert.rejects(() => parseFhirBundle(null), /Bundle/);
            await assert.rejects(() => parseFhirBundle([1, 2, 3]), /Bundle/);
            await assert.rejects(() => parseFhirBundle(JSON.stringify({ resourceType: 'Patient', id: '1' })), /Expected FHIR resourceType "Bundle"/);
        });
    });

    describe('preProcessTemplate', function () {
        it('applies DotLiquid compatibility transforms via super.preProcessTemplate', function () {
            const handler = new FhirHandler();
            const out = handler.preProcessTemplate('{% if a %}1{% elseif b %}2{% endif %}');
            assert.ok(out.includes('{% elsif b %}'));
        });
    });

    describe('postProcessResult', function () {
        const handler = new FhirHandler();

        it('normalizes line endings to CR (0x0D), drops blank lines, and strips trailing pipes', function () {
            const raw = [
                '  MSH|^~\\&|APP|FAC|HIS|HOSP|20261126150000||ADT^A03^ADT_A03|MSG001|P|2.5.1|||  ',
                '',
                'PID|1||PAT-1^^^HOSP^MR||Doe^Jane||19800101|F|||||',
                'PV1|1|I|||||||||||||||||VN-1^^^HOSP^VN||||'
            ].join('\r\n');

            const out = handler.postProcessResult(raw);
            assert.equal(out.includes('\n'), false);
            const segs = out.split('\r');
            assert.equal(segs.length, 3);
            assert.equal(segs[0], 'MSH|^~\\&|APP|FAC|HIS|HOSP|20261126150000||ADT^A03^ADT_A03|MSG001|P|2.5.1');
            assert.equal(segs[1], 'PID|1||PAT-1^^^HOSP^MR||Doe^Jane||19800101|F');
            assert.equal(segs[2], 'PV1|1|I|||||||||||||||||VN-1^^^HOSP^VN');
        });

        it('preserves MSH|^~\\&| header semantics even if all subsequent MSH fields are empty', function () {
            const out = handler.postProcessResult('MSH|^~\\&|||||\nPID|1||PAT-1');
            assert.equal(out, 'MSH|^~\\&|\rPID|1||PAT-1');
        });

        it('throws on empty output, non-MSH first segment, or invalid 3-char segment IDs', function () {
            assert.throws(() => handler.postProcessResult('   \n  '), /empty/);
            assert.throws(() => handler.postProcessResult('PID|1||PAT-1'), /first segment must be MSH/);
            assert.throws(() => handler.postProcessResult('MSH|^~\\&|A\ninvalid line without segment'), /Invalid HL7v2 segment/);
        });

        it('validates PID-3 and PV1-19 when requireCorrelationIds is true', function () {
            const valid = [
                'MSH|^~\\&|A|B|C|D|20261126||ADT^A03|MSG1|P|2.5.1',
                'PID|1||PAT-100^^^HOSP^MR||Doe^Jane',
                'PV1|1|I|||||||||||||||||FALL-200^^^HOSP^VN'
            ].join('\n');
            assert.doesNotThrow(() => handler.postProcessResult(valid, { requireCorrelationIds: true }));

            const missingPid3 = [
                'MSH|^~\\&|A|B|C|D|20261126||ADT^A03|MSG1|P|2.5.1',
                'PID|1||||Doe^Jane',
                'PV1|1|I|||||||||||||||||FALL-200^^^HOSP^VN'
            ].join('\n');
            assert.throws(
                () => handler.postProcessResult(missingPid3, { requireCorrelationIds: true }),
                (err) => err.code === 'MissingCorrelationId' && err.message.includes('PID-3')
            );

            const emptyCxPid3 = [
                'MSH|^~\\&|A|B|C|D|20261126||ADT^A03|MSG1|P|2.5.1',
                'PID|1||^^^HOSP^MR||Doe^Jane',
                'PV1|1|I|||||||||||||||||FALL-200^^^HOSP^VN'
            ].join('\n');
            assert.throws(
                () => handler.postProcessResult(emptyCxPid3, { requireCorrelationIds: true }),
                (err) => err.code === 'MissingCorrelationId'
            );

            const missingPv119 = [
                'MSH|^~\\&|A|B|C|D|20261126||ADT^A03|MSG1|P|2.5.1',
                'PID|1||PAT-100^^^HOSP^MR||Doe^Jane',
                'PV1|1|I'
            ].join('\n');
            assert.throws(
                () => handler.postProcessResult(missingPv119, { requireCorrelationIds: true }),
                (err) => err.code === 'MissingCorrelationId' && err.message.includes('PV1-19')
            );
        });
    });

    describe('getConversionResultMetadata / summarizeHl7v2Output', function () {
        const handler = new FhirHandler();

        it('returns empty object when renderedHl7v2 is absent', function () {
            assert.deepEqual(handler.getConversionResultMetadata({}), {});
            assert.deepEqual(summarizeHl7v2Output(''), {});
        });

        it('extracts messageType, messageControlId, segmentCount, and segments from MSH', function () {
            const hl7 = [
                'MSH|^~\\&|CONV|UKB|HIS|HOSP|20261126150000+0100||MDM^T02^MDM_T02|MSG1234567890ABCDEF|P|2.5.1||||||UNICODE UTF-8',
                'EVN|T02|20261126144500+0100',
                'PID|1||PAT-100492^^^HOSPITAL^MR',
                'PV1|1|I|||||||||||||||||FALL-2026-55901^^^HOSPITAL^VN',
                'TXA|1|DS|AP',
                'OBX|1|FT|46241-6^Anamnese^LN|1|Text'
            ].join('\r');

            const meta = handler.getConversionResultMetadata({}, hl7);
            assert.deepEqual(meta, {
                messageType: 'MDM^T02^MDM_T02',
                messageControlId: 'MSG1234567890ABCDEF',
                segmentCount: 6,
                segments: ['MSH', 'EVN', 'PID', 'PV1', 'TXA', 'OBX']
            });
        });
    });
});
