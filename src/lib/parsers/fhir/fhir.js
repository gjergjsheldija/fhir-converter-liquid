import dataHandler from '../../dataHandler/dataHandler.js';

const SEGMENT_LINE_RE = /^[A-Z][A-Z0-9]{2}\|/;

function isPlainObject(val) {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
}

function hasCxIdentifierValue(fieldVal) {
    if (typeof fieldVal !== 'string' || fieldVal.trim().length === 0) {
        return false;
    }
    return fieldVal.split('~').some((rep) => {
        const idNumber = rep.split('^')[0];
        return typeof idNumber === 'string' && idNumber.trim().length > 0;
    });
}

function stripTrailingFieldPipes(line) {
    if (line.startsWith('MSH|^~\\&')) {
        const stripped = line.replace(/\|+$/, '');
        return stripped.length <= 8 ? 'MSH|^~\\&|' : stripped;
    }
    const stripped = line.replace(/\|+$/, '');
    // Preserve at least `SEG|` if a valid segment header had only empty fields (e.g. `EVN|||`)
    if (/^[A-Z][A-Z0-9]{2}$/.test(stripped) && line.length > 3 && line[3] === '|') {
        return `${stripped}|`;
    }
    return stripped;
}

export function parseFhirBundle(data) {
    return new Promise((fulfill, reject) => {
        let bundle = data;
        if (typeof data === 'string') {
            if (data.trim().length === 0) {
                reject(new Error('FHIR input must be a non-empty JSON string or Bundle object.'));
                return;
            }
            try {
                bundle = JSON.parse(data);
            } catch (err) {
                reject(new Error(`Invalid FHIR JSON: ${err.message}`));
                return;
            }
        }

        if (!isPlainObject(bundle)) {
            reject(new Error('FHIR input must be a JSON object with resourceType "Bundle".'));
            return;
        }

        if (bundle.resourceType !== 'Bundle') {
            reject(new Error(`Expected FHIR resourceType "Bundle", got "${bundle.resourceType || 'undefined'}".`));
            return;
        }

        const rawEntries = Array.isArray(bundle.entry) ? bundle.entry : [];
        const entries = [];
        const byType = {};
        const byRef = {};

        for (const entry of rawEntries) {
            if (!isPlainObject(entry) || !isPlainObject(entry.resource)) {
                continue;
            }
            const res = entry.resource;
            entries.push(res);

            const rt = typeof res.resourceType === 'string' ? res.resourceType : '';
            if (rt) {
                if (!byType[rt]) {
                    byType[rt] = [];
                }
                byType[rt].push(res);
            }

            if (rt && typeof res.id === 'string' && res.id.length > 0) {
                byRef[`${rt}/${res.id}`] = res;
            }

            if (typeof entry.fullUrl === 'string' && entry.fullUrl.length > 0) {
                byRef[entry.fullUrl] = res;
            }

            if (Array.isArray(res.contained)) {
                for (const containedRes of res.contained) {
                    if (!isPlainObject(containedRes)) {
                        continue;
                    }
                    if (typeof containedRes.id === 'string' && containedRes.id.length > 0) {
                        byRef[`#${containedRes.id}`] = containedRes;
                        if (typeof containedRes.resourceType === 'string' && containedRes.resourceType.length > 0) {
                            const typedKey = `${containedRes.resourceType}/${containedRes.id}`;
                            if (!byRef[typedKey]) {
                                byRef[typedKey] = containedRes;
                            }
                        }
                    }
                }
            }
        }

        fulfill({
            bundle,
            entries,
            byType,
            byRef,
            patient: (byType.Patient && byType.Patient[0]) || null,
            encounter: (byType.Encounter && byType.Encounter[0]) || null,
            composition: (byType.Composition && byType.Composition[0]) || null,
            questionnaireResponse: (byType.QuestionnaireResponse && byType.QuestionnaireResponse[0]) || null,
            practitioner: (byType.Practitioner && byType.Practitioner[0]) || null,
            organization: (byType.Organization && byType.Organization[0]) || null,
            relatedPerson: (byType.RelatedPerson && byType.RelatedPerson[0]) || null,
            documentReference: (byType.DocumentReference && byType.DocumentReference[0]) || null
        });
    });
}

export function summarizeHl7v2Output(hl7v2String) {
    if (typeof hl7v2String !== 'string' || hl7v2String.trim().length === 0) {
        return {};
    }
    const lines = hl7v2String
        .split(/\r?\n|\r/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    if (lines.length === 0) {
        return {};
    }

    const segments = lines.map((line) => line.slice(0, 3));
    const mshLine = lines.find((line) => line.startsWith('MSH|')) || '';
    const mshFields = mshLine ? mshLine.split('|') : [];

    return {
        messageType: mshFields[8] || '',
        messageControlId: mshFields[9] || '',
        segmentCount: segments.length,
        segments
    };
}

export default class fhir extends dataHandler {
    constructor() {
        super('fhir');
    }

    parseSrcData(data) {
        return parseFhirBundle(data);
    }

    preProcessTemplate(templateStr) {
        return super.preProcessTemplate(templateStr);
    }

    postProcessResult(inResult, options = {}) {
        if (typeof inResult !== 'string') {
            throw new Error('Rendered HL7v2 output must be a string.');
        }

        const rawLines = inResult
            .split(/\r?\n|\r/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (rawLines.length === 0) {
            throw new Error('Rendered HL7v2 output is empty.');
        }

        const segments = rawLines.map((line, idx) => {
            const normalized = stripTrailingFieldPipes(line);
            if (!SEGMENT_LINE_RE.test(normalized)) {
                throw new Error(`Invalid HL7v2 segment at line ${idx + 1}: "${line.slice(0, 60)}"`);
            }
            return normalized;
        });

        if (!segments[0].startsWith('MSH|')) {
            throw new Error(`Invalid HL7v2 output: first segment must be MSH, got "${segments[0].slice(0, 10)}".`);
        }

        if (options && options.requireCorrelationIds === true) {
            const pidLine = segments.find((seg) => seg.startsWith('PID|'));
            const pv1Line = segments.find((seg) => seg.startsWith('PV1|'));
            const pidFields = pidLine ? pidLine.split('|') : [];
            const pv1Fields = pv1Line ? pv1Line.split('|') : [];

            const hasPid3 = Boolean(pidLine && hasCxIdentifierValue(pidFields[3]));
            const hasPv119 = Boolean(pv1Line && hasCxIdentifierValue(pv1Fields[19]));

            if (!hasPid3 || !hasPv119) {
                const err = new Error('Missing required hospital correlation ID: PID-3 (Patient MRN) or PV1-19 (Visit/Case number).');
                err.code = 'MissingCorrelationId';
                throw err;
            }
        }

        return segments.join('\r');
    }

    getConversionResultMetadata(parsedData, renderedHl7v2) {
        if (!renderedHl7v2) {
            return {};
        }
        return summarizeHl7v2Output(renderedHl7v2);
    }
}
