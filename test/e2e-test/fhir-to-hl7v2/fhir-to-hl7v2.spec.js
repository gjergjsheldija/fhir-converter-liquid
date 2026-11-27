import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION,
    HL7V2_DATA_LOCATION,
    REVERSE_SAMPLE_DATA_LOCATION
} from '../../../src/lib/constants/constants.js';
import dataHandlerFactory from '../../../src/lib/dataHandler/dataHandlerFactory.js';
import { convertInlineHl7v2 } from '../../../src/lib/workers/worker.js';
import WorkerPool from '../../../src/lib/workers/workerPool.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKER_SCRIPT = join(__dirname, '../../../src/lib/workers/worker.js');

const compositionBundleRaw = readFileSync(
    join(REVERSE_SAMPLE_DATA_LOCATION, 'fhir', 'Discharge_Composition_Bundle.json'),
    'utf8'
);
const compositionBundleObj = JSON.parse(compositionBundleRaw);

const qrBundleRaw = readFileSync(
    join(REVERSE_SAMPLE_DATA_LOCATION, 'fhir', 'Discharge_QuestionnaireResponse_Bundle.json'),
    'utf8'
);
const qrBundleObj = JSON.parse(qrBundleRaw);

const mdmTemplate = readFileSync(join(FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION, 'MDM_T02.liquid'), 'utf8');
const adtTemplate = readFileSync(join(FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION, 'ADT_A03.liquid'), 'utf8');
const oruTemplate = readFileSync(join(FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION, 'ORU_R01.liquid'), 'utf8');

function splitEr7Segments(hl7) {
    assert.equal(hl7.includes('\n'), false, 'ER7 output must use CR (0x0D) segment terminators without LF');
    return hl7.split('\r');
}

describe('End-to-End Reverse Conversion: FHIR R4 -> HL7v2 (Hospital Discharge)', function () {
    const hl7v2Parser = dataHandlerFactory.createDataHandler('hl7v2');
    let pool;

    before(function () {
        pool = new WorkerPool(WORKER_SCRIPT, 1);
    });

    after(function () {
        if (pool) {
            pool.destroy();
        }
    });

    describe('MDM_T02.liquid with Discharge_Composition_Bundle.json', function () {
        it('renders a valid HL7v2 MDM^T02 discharge document with stripped XHTML narratives, meds, and Base64 PDF', async function () {
            const res = await convertInlineHl7v2({
                srcDataType: 'fhir',
                srcData: compositionBundleRaw,
                template: mdmTemplate
            });

            assert.equal(res.status, 200);
            assert.equal(res.resultMsg.messageType, 'MDM^T02^MDM_T02');
            assert.ok(res.resultMsg.messageControlId.length > 0 && res.resultMsg.messageControlId.length <= 20);

            const segments = splitEr7Segments(res.resultMsg.hl7v2Message);
            assert.equal(res.resultMsg.segmentCount, segments.length);

            const msh = segments[0].split('|');
            assert.equal(msh[0], 'MSH');
            assert.equal(msh[1], '^~\\&');
            assert.equal(msh[3], 'Universitätsklinikum Beispiel');
            assert.equal(msh[8], 'MDM^T02^MDM_T02');
            assert.equal(msh[11], '2.5.1');
            assert.equal(msh[17], 'UNICODE UTF-8');

            const pid = segments.find((s) => s.startsWith('PID|')).split('|');
            assert.equal(pid[3], 'PAT-100492^^^HOSPITAL^MR~A123456789^^^GKV^GKV');
            assert.ok(pid[5].startsWith('Müller^Anna'));
            assert.equal(pid[7], '19540819');
            assert.equal(pid[8], 'F');

            const pv1 = segments.find((s) => s.startsWith('PV1|')).split('|');
            assert.equal(pv1[2], 'I');
            assert.equal(pv1[3], 'Station 4B^Zimmer 412^Bett 1');
            assert.equal(pv1[19], 'FALL-2026-55901^^^HOSPITAL^VN');
            assert.equal(pv1[36], '01');
            assert.equal(pv1[44], '20261118091500+0100');
            assert.equal(pv1[45], '20261126143000+0100');

            const dg1List = segments.filter((s) => s.startsWith('DG1|'));
            assert.equal(dg1List.length, 2);
            assert.ok(dg1List[0].includes('I50.13'));
            assert.ok(dg1List[1].includes('I10.00'));

            const txa = segments.find((s) => s.startsWith('TXA|')).split('|');
            assert.equal(txa[2], 'DS');
            assert.equal(txa[3], 'AP');
            assert.equal(txa[12], 'DOC-2026-88412');
            assert.equal(txa[17], 'AU');

            const obxList = segments.filter((s) => s.startsWith('OBX|'));
            // 5 Composition narrative sections + 2 MedicationRequests + 1 DocumentReference PDF = 8 OBX segments
            assert.equal(obxList.length, 8);
            obxList.forEach((obxLine, idx) => {
                const fields = obxLine.split('|');
                assert.equal(fields[1], String(idx + 1));
                assert.equal(fields[11], 'F');
            });

            // Verify XHTML tags are stripped and German umlauts + escaped ampersand (\T\) + \.br\ are present
            assert.equal(res.resultMsg.hl7v2Message.includes('<div'), false);
            assert.equal(res.resultMsg.hl7v2Message.includes('<p>'), false);
            assert.ok(obxList[0].includes('Anna Müller'));
            assert.ok(obxList[0].includes('\\T\\'));
            assert.ok(obxList[1].includes('\\.br\\'));

            // Verify ED PDF attachment in final OBX
            const edFields = obxList[7].split('|');
            assert.equal(edFields[2], 'ED');
            assert.ok(edFields[5].startsWith('^application^pdf^Base64^'));
            const b64Payload = edFields[5].split('^')[4];
            const decodedPdf = Buffer.from(b64Payload, 'base64').toString('utf8');
            assert.ok(decodedPdf.startsWith('%PDF-1.4'));

            // Verify forward HL7v2 parser parses the generated message cleanly
            const roundTripParsed = await hl7v2Parser.parseSrcData(res.resultMsg.hl7v2Message);
            assert.equal(roundTripParsed.v2.meta[0], 'MSH');
        });
    });

    describe('ADT_A03.liquid with Discharge_Composition_Bundle.json', function () {
        it('renders a valid HL7v2 ADT^A03 discharge notification with NK1, PV1, DG1, PR1, and AL1', async function () {
            const res = await convertInlineHl7v2({
                srcDataType: 'fhir',
                srcData: compositionBundleObj,
                template: adtTemplate,
                customerContext: {
                    sendingApplication: 'CLOUD_DISCHARGE',
                    sendingFacility: 'UK_MUC',
                    receivingApplication: 'SAP_ISH',
                    receivingFacility: 'KIS_PROD',
                    assigningAuthority: 'UKMUC'
                }
            });

            assert.equal(res.status, 200);
            assert.equal(res.resultMsg.messageType, 'ADT^A03^ADT_A03');
            assert.deepEqual(res.resultMsg.segments, [
                'MSH', 'EVN', 'PID', 'NK1', 'PV1', 'DG1', 'DG1', 'PR1', 'AL1'
            ]);

            const segments = splitEr7Segments(res.resultMsg.hl7v2Message);
            const msh = segments[0].split('|');
            assert.equal(msh[2], 'CLOUD_DISCHARGE');
            assert.equal(msh[3], 'UK_MUC');
            assert.equal(msh[4], 'SAP_ISH');
            assert.equal(msh[5], 'KIS_PROD');

            const evn = segments[1].split('|');
            assert.equal(evn[1], 'A03');

            const pid = segments[2].split('|');
            assert.ok(pid[3].startsWith('PAT-100492^^^UKMUC^MR'));

            const nk1 = segments[3].split('|');
            assert.equal(nk1[2], 'Müller^Thomas');
            assert.ok(nk1[3].startsWith('SPS^Spouse'));

            const pr1 = segments.find((s) => s.startsWith('PR1|')).split('|');
            assert.ok(pr1[3].startsWith('5-377.1^'));

            const al1 = segments.find((s) => s.startsWith('AL1|')).split('|');
            assert.equal(al1[2], 'DA');
            assert.equal(al1[3], '764146007^Penicillin^SCT');
            assert.equal(al1[4], 'SV');
            assert.equal(al1[5], 'Exanthem');
            assert.equal(al1[6], '20261118');

            const roundTripParsed = await hl7v2Parser.parseSrcData(res.resultMsg.hl7v2Message);
            assert.equal(roundTripParsed.v2.data.length, 9);
        });
    });

    describe('ORU_R01.liquid with Discharge_QuestionnaireResponse_Bundle.json', function () {
        it('flattens nested QuestionnaireResponse items into typed OBX segments and escapes ER7 delimiters safely', async function () {
            const res = await convertInlineHl7v2({
                srcDataType: 'fhir',
                srcData: qrBundleRaw,
                template: oruTemplate
            });

            assert.equal(res.status, 200);
            assert.equal(res.resultMsg.messageType, 'ORU^R01^ORU_R01');

            const segments = splitEr7Segments(res.resultMsg.hl7v2Message);
            const orc = segments.find((s) => s.startsWith('ORC|')).split('|');
            assert.equal(orc[1], 'RE');
            assert.equal(orc[3], 'qr-discharge-99201');

            const obr = segments.find((s) => s.startsWith('OBR|')).split('|');
            assert.equal(obr[3], 'qr-discharge-99201');
            assert.equal(obr[4], '18842-5^Hospital Discharge Form^LN');
            assert.equal(obr[25], 'F');

            const obxList = segments.filter((s) => s.startsWith('OBX|'));
            assert.equal(obxList.length, 7);

            // 1: Barthel Index = 65 (NM)
            const obx1 = obxList[0].split('|');
            assert.equal(obx1[2], 'NM');
            assert.equal(obx1[3], '96761-2^Barthel Index^LN');
            assert.equal(obx1[5], '65');

            // 2: Discharge Body Weight = 68.4 kg (NM)
            const obx2 = obxList[1].split('|');
            assert.equal(obx2[2], 'NM');
            assert.equal(obx2[5], '68.4');
            assert.equal(obx2[6], 'kg^kg^UCUM');

            // 3: Home Care Needed = true -> Y^Yes^HL70136 (CWE)
            const obx3 = obxList[2].split('|');
            assert.equal(obx3[2], 'CWE');
            assert.equal(obx3[5], 'Y^Yes^HL70136');

            // 4: Nested answer.item Required Medical Aids -> Rollator (CE)
            const obx4 = obxList[3].split('|');
            assert.equal(obx4[2], 'CE');
            assert.equal(obx4[5], '404949001^Rollator^SCT');

            // 5: Discharge Destination -> home (CE)
            const obx5 = obxList[4].split('|');
            assert.equal(obx5[2], 'CE');
            assert.ok(obx5[5].startsWith('home^Home with ambulatory nursing care'));

            // 6: Planned Follow-up Date -> 20261203 (DT)
            const obx6 = obxList[5].split('|');
            assert.equal(obx6[2], 'DT');
            assert.equal(obx6[5], '20261203');

            // 7: Handover Notes with |, ^, ~, &, \n -> FT with zero pipe/component corruption
            const obx7 = obxList[6].split('|');
            assert.equal(obx7[2], 'FT');
            assert.equal(
                obx7[5],
                'Patient needs wound check \\T\\ INR control \\F\\ call GP\\S\\Office \\R\\ urgent\\.br\\Line 2 handover'
            );
            assert.equal(obx7[11], 'F');

            const roundTripParsed = await hl7v2Parser.parseSrcData(res.resultMsg.hl7v2Message);
            assert.equal(roundTripParsed.v2.meta.filter((m) => m === 'OBX').length, 7);
        });
    });

    describe('Cross-bundle compatibility, empty template, debug mode, correlation guard, and WorkerPool', function () {
        it('renders MDM_T02 with QuestionnaireResponse Bundle and ORU_R01 with Composition Bundle', async function () {
            const mdmQr = await convertInlineHl7v2({
                srcDataType: 'fhir',
                srcData: qrBundleObj,
                template: mdmTemplate
            });
            assert.equal(mdmQr.status, 200);
            assert.ok(mdmQr.resultMsg.segments.includes('TXA'));
            assert.ok(mdmQr.resultMsg.hl7v2Message.includes('qr-discharge-99201'));

            const oruComp = await convertInlineHl7v2({
                srcDataType: 'fhir',
                srcData: compositionBundleObj,
                template: oruTemplate
            });
            assert.equal(oruComp.status, 200);
            assert.ok(oruComp.resultMsg.segments.includes('OBR'));
            assert.equal(oruComp.resultMsg.segments.filter((s) => s === 'OBX').length, 7);
        });

        it('returns bundle metadata when template is empty and attaches debugInfo when debug=true', async function () {
            const emptyTplRes = await convertInlineHl7v2({
                srcDataType: 'fhir',
                srcData: compositionBundleObj,
                template: ''
            });
            assert.equal(emptyTplRes.status, 200);
            assert.deepEqual(emptyTplRes.resultMsg, {
                bundleType: 'document',
                entryCount: 13
            });

            const debugRes = await convertInlineHl7v2({
                srcDataType: 'fhir',
                srcData: qrBundleObj,
                template: oruTemplate,
                debug: true
            });
            assert.equal(debugRes.status, 200);
            assert.ok(debugRes.resultMsg.debugInfo);
            assert.equal(debugRes.resultMsg.debugInfo.hl7v2Summary.messageType, 'ORU^R01^ORU_R01');
        });

        it('rejects with status 422 when requireCorrelationIds=true and MRN or Visit Number is missing', async function () {
            const bundleWithoutVisitNr = JSON.parse(qrBundleRaw);
            const encEntry = bundleWithoutVisitNr.entry.find((e) => e.resource.resourceType === 'Encounter');
            encEntry.resource.identifier = [];

            await assert.rejects(
                () => convertInlineHl7v2({
                    srcDataType: 'fhir',
                    srcData: bundleWithoutVisitNr,
                    template: adtTemplate,
                    requireCorrelationIds: true
                }),
                (err) => err.status === 422 && err.resultMsg.error.message.includes('PID-3')
            );
        });

        it('executes stored templates via WorkerPool without colliding with hl7v2 template cache keys', async function () {
            const fhirRes = await pool.exec({
                type: '/api/convert/:srcDataType/:template',
                srcDataType: 'fhir',
                templateName: 'ORU_R01.liquid',
                srcData: qrBundleRaw
            });
            assert.equal(fhirRes.status, 200);
            assert.equal(fhirRes.resultMsg.messageType, 'ORU^R01^ORU_R01');
            assert.ok(fhirRes.resultMsg.hl7v2Message.startsWith('MSH|^~\\&|'));

            // Now execute same-named ORU_R01.liquid for forward hl7v2 -> FHIR on the exact same worker!
            const hl7Sample = readFileSync(join(HL7V2_DATA_LOCATION, 'LAB-ORU-1.hl7'), 'utf8');
            const forwardRes = await pool.exec({
                type: '/api/convert/:srcDataType/:template',
                srcDataType: 'hl7v2',
                templateName: 'ORU_R01.liquid',
                srcData: hl7Sample
            });
            assert.equal(forwardRes.status, 200);
            assert.equal(forwardRes.resultMsg.fhirResource.resourceType, 'Bundle');
        });
    });
});
