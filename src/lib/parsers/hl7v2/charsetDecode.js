const HEADER_SCAN_LIMIT = 1024;

const MSH18_ENCODING_MAP = {
    '': 'utf-8',
    'UTF-8': 'utf-8',
    'UTF8': 'utf-8',
    'UNICODE': 'utf-8',
    'UNICODE UTF-8': 'utf-8',
    'ASCII': 'utf-8',
    'US-ASCII': 'utf-8',
    'ISO-IR-6': 'utf-8',
    '8859/1': 'iso-8859-1',
    'ISO-8859-1': 'iso-8859-1',
    'ISO_8859-1': 'iso-8859-1',
    'ISO8859-1': 'iso-8859-1',
    'ISO88591': 'iso-8859-1',
    'LATIN1': 'iso-8859-1',
    'LATIN-1': 'iso-8859-1',
    'ISO-IR-100': 'iso-8859-1',
    '8859/15': 'iso-8859-15',
    'ISO-8859-15': 'iso-8859-15',
    'ISO_8859-15': 'iso-8859-15',
    'ISO8859-15': 'iso-8859-15',
    'ISO885915': 'iso-8859-15',
    'LATIN9': 'iso-8859-15',
    'LATIN-9': 'iso-8859-15',
    'WINDOWS-1252': 'windows-1252',
    'CP1252': 'windows-1252',
    'WIN-1252': 'windows-1252',
    'WIN1252': 'windows-1252',
    '1252': 'windows-1252'
};

function extractFirstSegmentAscii(headerBytesOrString) {
    if (typeof headerBytesOrString === 'string') {
        let s = headerBytesOrString;
        if (s.charCodeAt(0) === 0xFEFF) {
            s = s.slice(1);
        }
        const crIdx = s.indexOf('\r');
        const lfIdx = s.indexOf('\n');
        let end = s.length;
        if (crIdx !== -1 && crIdx < end) {
            end = crIdx;
        }
        if (lfIdx !== -1 && lfIdx < end) {
            end = lfIdx;
        }
        return s.slice(0, end);
    }

    if (headerBytesOrString instanceof Uint8Array) {
        let start = 0;
        if (headerBytesOrString.length >= 3
            && headerBytesOrString[0] === 0xEF
            && headerBytesOrString[1] === 0xBB
            && headerBytesOrString[2] === 0xBF) {
            start = 3;
        }
        const limit = Math.min(headerBytesOrString.length, start + HEADER_SCAN_LIMIT);
        let chars = '';
        for (let i = start; i < limit; i++) {
            const byte = headerBytesOrString[i];
            if (byte === 0x0D || byte === 0x0A) {
                break;
            }
            chars += String.fromCharCode(byte);
        }
        return chars;
    }

    return '';
}

export function detectMsh18Encoding(headerBytesOrString) {
    const msh = extractFirstSegmentAscii(headerBytesOrString);
    if (msh.length < 4 || msh.slice(0, 3) !== 'MSH') {
        return 'utf-8';
    }

    const fieldSep = msh[3];
    const compSep = msh.length > 4 ? msh[4] : '^';
    const repSep = msh.length > 5 ? msh[5] : '~';
    const subSep = msh.length > 7 ? msh[7] : '&';

    const fields = msh.split(fieldSep);
    if (fields.length <= 17 || !fields[17]) {
        return 'utf-8';
    }

    let rawCode = fields[17];
    if (repSep) {
        rawCode = rawCode.split(repSep)[0];
    }
    if (compSep) {
        rawCode = rawCode.split(compSep)[0];
    }
    if (subSep) {
        rawCode = rawCode.split(subSep)[0];
    }

    const normalized = rawCode.trim().replace(/\s+/g, ' ').toUpperCase();
    if (Object.prototype.hasOwnProperty.call(MSH18_ENCODING_MAP, normalized)) {
        return MSH18_ENCODING_MAP[normalized];
    }

    const isoSlashMatch = /^8859\/(\d+)$/.exec(normalized);
    if (isoSlashMatch) {
        const candidate = 'iso-8859-' + isoSlashMatch[1];
        try {
            new TextDecoder(candidate);
            return candidate;
        } catch (e) {
            return 'utf-8';
        }
    }

    return 'utf-8';
}

export function decodeHl7v2Payload(input) {
    if (typeof input === 'string') {
        return input;
    }
    if (!(input instanceof Uint8Array)) {
        return input;
    }

    const encoding = detectMsh18Encoding(input);
    if (encoding === 'utf-8') {
        try {
            return new TextDecoder('utf-8', {fatal: true}).decode(input);
        } catch (e) {
            return new TextDecoder('windows-1252').decode(input);
        }
    }

    return new TextDecoder(encoding).decode(input);
}
