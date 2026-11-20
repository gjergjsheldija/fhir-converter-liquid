import assert from 'assert';
import {decodeHl7v2Payload, detectMsh18Encoding} from './charsetDecode.js';
import {parseHL7v2} from './hl7v2.js';

function buildMsh(msh18Value) {
    // Fields: 0=MSH, 1=^~\&(MSH-2), 2=App(3), 3=Fac(4), 4=RApp(5), 5=RFac(6),
    // 6=TS(7), 7=Sec(8), 8=Type(9), 9=Ctrl(10), 10=Proc(11), 11=Ver(12),
    // 12..16=(13..17), 17=Charset(MSH-18)
    return 'MSH|^~\\&|ORBIS|HOSP|FHIR|GW|20261120120000||ADT^A01|MSG001|P|2.5||||||' + (msh18Value || '');
}

describe('charsetDecode.js & parseHL7v2 MLLP/charset support', function () {
    describe('detectMsh18Encoding', function () {
        it('maps HL7 table 0211 MSH-18 codes to TextDecoder encodings', function () {
            assert.strictEqual(detectMsh18Encoding(buildMsh('8859/1')), 'iso-8859-1');
            assert.strictEqual(detectMsh18Encoding(buildMsh('ISO-8859-1')), 'iso-8859-1');
            assert.strictEqual(detectMsh18Encoding(buildMsh('LATIN1')), 'iso-8859-1');
            assert.strictEqual(detectMsh18Encoding(buildMsh('8859/15')), 'iso-8859-15');
            assert.strictEqual(detectMsh18Encoding(buildMsh('ISO-8859-15')), 'iso-8859-15');
            assert.strictEqual(detectMsh18Encoding(buildMsh('WINDOWS-1252')), 'windows-1252');
            assert.strictEqual(detectMsh18Encoding(buildMsh('CP1252')), 'windows-1252');
            assert.strictEqual(detectMsh18Encoding(buildMsh('WIN-1252')), 'windows-1252');
            assert.strictEqual(detectMsh18Encoding(buildMsh('ASCII')), 'utf-8');
            assert.strictEqual(detectMsh18Encoding(buildMsh('UNICODE')), 'utf-8');
            assert.strictEqual(detectMsh18Encoding(buildMsh('UNICODE UTF-8')), 'utf-8');
            assert.strictEqual(detectMsh18Encoding(buildMsh('UTF-8')), 'utf-8');
            assert.strictEqual(detectMsh18Encoding(buildMsh('')), 'utf-8');
        });

        it('extracts first component/repeat from MSH-18 on Buffer and Uint8Array inputs', function () {
            const raw = Buffer.from(buildMsh('8859/1~UNICODE UTF-8') + '\rPID|1||12345||M\xfcller^Hans\r', 'latin1');
            assert.strictEqual(detectMsh18Encoding(raw), 'iso-8859-1');
            assert.strictEqual(detectMsh18Encoding(new Uint8Array(raw)), 'iso-8859-1');
        });
    });

    describe('decodeHl7v2Payload & parseHL7v2', function () {
        it('decodes MSH-18 = 8859/1 Buffer payloads (Müller)', function () {
            const latin1Msg = buildMsh('8859/1') + '\rPID|1||4711||M\xfcller^J\xfcrgen||19750501|M\r';
            const buf = Buffer.from(latin1Msg, 'latin1');

            const decoded = decodeHl7v2Payload(buf);
            assert.ok(decoded.includes('Müller^Jürgen'));
            assert.strictEqual(decoded.includes('\uFFFD'), false);

            const parsed = parseHL7v2(buf);
            assert.strictEqual(parsed.v2.meta.length, 2);
            assert.strictEqual(parsed.v2.data[1][4][0][0], 'Müller');
            assert.strictEqual(parsed.v2.data[1][4][1][0], 'Jürgen');
        });

        it('falls back gracefully to windows-1252 for undeclared non-UTF-8 hospital feeds (François)', function () {
            // MSH-18 is empty, payload has raw 0xE7 ('ç') and 0x80 ('€') in Windows-1252
            const header = Buffer.from(buildMsh('') + '\rPID|1||9001||Fran', 'ascii');
            const mid = Buffer.from([0xE7]); // 'ç' in Latin-1 / Windows-1252 (invalid standalone UTF-8)
            const tail = Buffer.from('ois^Jean\rOBX|1|ST|NOTE||Cost 50 ', 'ascii');
            const euro = Buffer.from([0x80, 0x0D]); // '€' in Windows-1252 + '\r'
            const payload = new Uint8Array(Buffer.concat([header, mid, tail, euro]));

            const decoded = decodeHl7v2Payload(payload);
            assert.strictEqual(decoded.includes('\uFFFD'), false);
            assert.ok(decoded.includes('François^Jean'));
            assert.ok(decoded.includes('Cost 50 €'));

            const parsed = parseHL7v2(payload);
            assert.strictEqual(parsed.v2.data[1][4][0][0], 'François');
            assert.strictEqual(parsed.v2.data[1][4][1][0], 'Jean');
            assert.strictEqual(parsed.v2.data[2][4][0][0], 'Cost 50 €');
        });

        it('decodes UTF-8 Buffer payloads (Müller)', function () {
            const utf8Str = buildMsh('UNICODE UTF-8') + '\r\nPID|1||4711||Müller^ Anna||19800101|F\r\n';
            const buf = Buffer.from(utf8Str, 'utf8');

            const parsed = parseHL7v2(buf);
            assert.strictEqual(parsed.v2.meta.length, 2);
            assert.strictEqual(parsed.v2.data[1][4][0][0], 'Müller');
        });

        it('decodes MSH-18 = 8859/15 Buffer payloads with Euro sign (0xA4)', function () {
            const prefix = Buffer.from(buildMsh('8859/15') + '\rOBX|1|ST|COPAY||15 ', 'ascii');
            const euro885915 = Buffer.from([0xA4, 0x0D]); // '€' in ISO-8859-15
            const parsed = parseHL7v2(Buffer.concat([prefix, euro885915]));
            assert.strictEqual(parsed.v2.data[1][4][0][0], '15 €');
        });

        it('splits bare-\\r MLLP segment delimiters in parseHL7v2 for strings and Buffers', function () {
            const mllpMsg =
                buildMsh('UTF-8') + '\r' +
                'PID|1||MRN-42||Müller^Karl||19640229|M\r' +
                'PV1|1|I|ICU^101^A||||1234^Weber^ Eva\r';

            const parsedFromString = parseHL7v2(mllpMsg);
            assert.deepStrictEqual(parsedFromString.v2.meta, ['MSH', 'PID', 'PV1']);
            assert.strictEqual(parsedFromString.v2.data.length, 3);
            assert.strictEqual(parsedFromString.v2.data[1][4][0][0], 'Müller');
            assert.strictEqual(parsedFromString.v2.data[2][2][0][0], 'ICU');

            const parsedFromBuffer = parseHL7v2(Buffer.from(mllpMsg, 'utf8'));
            assert.deepStrictEqual(parsedFromBuffer.v2.meta, ['MSH', 'PID', 'PV1']);
            assert.strictEqual(parsedFromBuffer.v2.data[2][6][1][0], 'Weber');
        });

        it('returns JS strings unchanged from decodeHl7v2Payload', function () {
            const s = buildMsh('8859/1') + '\rPID|1||1||Müller\r';
            assert.strictEqual(decodeHl7v2Payload(s), s);
        });
    });
});
