import { createHash, randomUUID } from 'node:crypto';
import he from 'he';

// eslint-disable-next-line no-control-regex
const ASCII_CONTROL_CHARS_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F]/g;

const ISO_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|([+-])(\d{2}):?(\d{2}))?$/;
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_YEAR_MONTH_RE = /^(\d{4})-(\d{2})$/;
const ISO_YEAR_RE = /^(\d{4})$/;
const ALREADY_DTM_RE = /^\d{4,14}([+-]\d{4})?$/;

export function hl7Escape(value, mode) {
    if (value === null || value === undefined) {
        return '';
    }
    let out = String(value);
    out = out.replace(/\\/g, '\\E\\');
    out = out.replace(/\|/g, '\\F\\');
    out = out.replace(/\^/g, '\\S\\');
    out = out.replace(/~/g, '\\R\\');
    out = out.replace(/&/g, '\\T\\');

    const lineBreakReplacement = mode === 'space' ? ' ' : '\\.br\\';
    out = out.replace(/\r\n|\n|\r/g, lineBreakReplacement);
    out = out.replace(ASCII_CONTROL_CHARS_RE, '');
    return out;
}

export function stripXhtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    let s = String(value);
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(?:p|div|tr|h[1-6])\s*>/gi, '\n');
    s = s.replace(/<li(?=\s|>|\/)[^>]*>/gi, '\n- ');
    s = s.replace(/<\/li\s*>/gi, '');
    s = s.replace(/<[^>]+>/g, '');
    s = he.decode(s);

    const lines = s
        .replace(/\r\n|\r/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t\u00A0]+/g, ' ').trim())
        .filter((line) => line.length > 0);

    return lines.join('\n');
}

export function hl7Datetime(value, precision) {
    if (value === null || value === undefined) {
        return '';
    }
    const s = String(value).trim();
    if (s.length === 0) {
        return '';
    }

    const dtMatch = ISO_DATETIME_RE.exec(s);
    if (dtMatch) {
        const [, yyyy, mm, dd, hh, mi, sec, tzRaw, tzSign, tzH, tzM] = dtMatch;
        if (precision === 'date') {
            return `${yyyy}${mm}${dd}`;
        }
        const ss = sec || '00';
        const base = `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
        if (precision === 'local' || !tzRaw) {
            return base;
        }
        if (tzRaw === 'Z') {
            return `${base}+0000`;
        }
        return `${base}${tzSign}${tzH}${tzM}`;
    }

    const dMatch = ISO_DATE_RE.exec(s);
    if (dMatch) {
        return `${dMatch[1]}${dMatch[2]}${dMatch[3]}`;
    }

    const ymMatch = ISO_YEAR_MONTH_RE.exec(s);
    if (ymMatch) {
        return `${ymMatch[1]}${ymMatch[2]}`;
    }

    const yMatch = ISO_YEAR_RE.exec(s);
    if (yMatch) {
        return yMatch[1];
    }

    if (ALREADY_DTM_RE.test(s)) {
        return precision === 'date' ? s.slice(0, 8) : s;
    }

    return '';
}

export function hl7ControlId(seed) {
    if (seed !== null && seed !== undefined && String(seed).trim().length > 0) {
        const digest = createHash('sha256')
            .update(String(seed).trim())
            .digest('hex')
            .slice(0, 17)
            .toUpperCase();
        return `MSG${digest}`;
    }
    const rand = randomUUID().replace(/-/g, '').slice(0, 17).toUpperCase();
    return `MSG${rand}`;
}

export function resolveRef(refOrObj, byRef) {
    if (!refOrObj || !byRef || typeof byRef !== 'object') {
        return null;
    }
    let ref = '';
    if (typeof refOrObj === 'string') {
        ref = refOrObj.trim();
    } else if (typeof refOrObj === 'object' && typeof refOrObj.reference === 'string') {
        ref = refOrObj.reference.trim();
    }
    if (!ref) {
        return null;
    }
    if (Object.prototype.hasOwnProperty.call(byRef, ref)) {
        return byRef[ref];
    }
    const parts = ref.split('/');
    if (parts.length >= 2) {
        const relativeKey = parts.slice(-2).join('/');
        if (Object.prototype.hasOwnProperty.call(byRef, relativeKey)) {
            return byRef[relativeKey];
        }
    }
    return null;
}

function extractIdentifierList(identifiers) {
    if (Array.isArray(identifiers)) {
        return identifiers.filter((item) => item !== null && typeof item === 'object');
    }
    if (identifiers && typeof identifiers === 'object') {
        if (Array.isArray(identifiers.identifier)) {
            return identifiers.identifier.filter((item) => item !== null && typeof item === 'object');
        }
        if (identifiers.identifier && typeof identifiers.identifier === 'object') {
            return [identifiers.identifier];
        }
        if ('value' in identifiers || 'system' in identifiers || 'type' in identifiers) {
            return [identifiers];
        }
    }
    return [];
}

function hasNonEmptyValue(idObj) {
    return idObj && idObj.value !== undefined && idObj.value !== null && String(idObj.value).trim().length > 0;
}

export function identifierBySystem(identifiers, systemUri, fallbackToFirst = true) {
    const list = extractIdentifierList(identifiers);
    if (list.length === 0) {
        return null;
    }
    if (typeof systemUri === 'string' && systemUri.trim().length > 0) {
        const target = systemUri.trim();
        const hit = list.find((idObj) => idObj.system === target && hasNonEmptyValue(idObj));
        if (hit) {
            return hit;
        }
    }
    if (fallbackToFirst !== false) {
        return list.find(hasNonEmptyValue) || null;
    }
    return null;
}

export function identifierByType(identifiers, typeCode) {
    if (typeof typeCode !== 'string' || typeCode.trim().length === 0) {
        return null;
    }
    const target = typeCode.trim();
    const list = extractIdentifierList(identifiers);
    const hit = list.find((idObj) =>
        hasNonEmptyValue(idObj)
        && idObj.type
        && Array.isArray(idObj.type.coding)
        && idObj.type.coding.some((c) => c && c.code === target)
    );
    return hit || null;
}

export function codingBySystem(codeableConceptOrCodings, preferredSystem, fallbackToFirst = true) {
    let codings = [];
    if (Array.isArray(codeableConceptOrCodings)) {
        codings = codeableConceptOrCodings;
    } else if (
        codeableConceptOrCodings
        && typeof codeableConceptOrCodings === 'object'
        && Array.isArray(codeableConceptOrCodings.coding)
    ) {
        codings = codeableConceptOrCodings.coding;
    }
    const valid = codings.filter((c) => c !== null && typeof c === 'object');
    if (valid.length === 0) {
        return null;
    }
    if (typeof preferredSystem === 'string' && preferredSystem.trim().length > 0) {
        const target = preferredSystem.trim();
        const hit = valid.find((c) => c.system === target);
        if (hit) {
            return hit;
        }
    }
    if (fallbackToFirst !== false) {
        return valid[0] || null;
    }
    return null;
}

export function mapGender(fhirGender) {
    if (typeof fhirGender !== 'string') {
        return 'U';
    }
    switch (fhirGender.trim().toLowerCase()) {
        case 'male':
            return 'M';
        case 'female':
            return 'F';
        case 'other':
            return 'O';
        case 'unknown':
        default:
            return 'U';
    }
}

export function mapDocStatus(fhirStatus) {
    if (typeof fhirStatus !== 'string') {
        return 'AU';
    }
    switch (fhirStatus.trim().toLowerCase()) {
        case 'preliminary':
        case 'in-progress':
            return 'PA';
        case 'final':
        case 'completed':
            return 'AU';
        case 'amended':
        case 'corrected':
            return 'LA';
        case 'entered-in-error':
        case 'stopped':
            return 'CA';
        default:
            return 'AU';
    }
}

function extractItemCoding(item) {
    if (Array.isArray(item.code) && item.code.length > 0 && item.code[0] && typeof item.code[0] === 'object') {
        return item.code[0];
    }
    if (item.code && typeof item.code === 'object' && !Array.isArray(item.code)) {
        return item.code;
    }
    return null;
}

function normalizeQrAnswer(ans) {
    if (!ans || typeof ans !== 'object') {
        return null;
    }
    if (ans.valueCoding && typeof ans.valueCoding === 'object') {
        return {
            valueType: 'valueCoding',
            hl7DataType: 'CE',
            value: {
                code: ans.valueCoding.code || '',
                display: ans.valueCoding.display || '',
                system: ans.valueCoding.system || ''
            },
            unit: ''
        };
    }
    if (ans.valueQuantity && typeof ans.valueQuantity === 'object' && ans.valueQuantity.value !== undefined && ans.valueQuantity.value !== null) {
        return {
            valueType: 'valueQuantity',
            hl7DataType: 'NM',
            value: String(ans.valueQuantity.value),
            unit: ans.valueQuantity.unit || ans.valueQuantity.code || ''
        };
    }
    if (typeof ans.valueInteger === 'number') {
        return {
            valueType: 'valueInteger',
            hl7DataType: 'NM',
            value: String(ans.valueInteger),
            unit: ''
        };
    }
    if (typeof ans.valueDecimal === 'number') {
        return {
            valueType: 'valueDecimal',
            hl7DataType: 'NM',
            value: String(ans.valueDecimal),
            unit: ''
        };
    }
    if (typeof ans.valueBoolean === 'boolean') {
        const bool = ans.valueBoolean;
        return {
            valueType: 'valueBoolean',
            hl7DataType: 'CWE',
            value: {
                code: bool ? 'Y' : 'N',
                display: bool ? 'Yes' : 'No',
                system: 'http://terminology.hl7.org/CodeSystem/v2-0136'
            },
            unit: ''
        };
    }
    if (typeof ans.valueDate === 'string') {
        return {
            valueType: 'valueDate',
            hl7DataType: 'DT',
            value: ans.valueDate,
            unit: ''
        };
    }
    if (typeof ans.valueDateTime === 'string') {
        return {
            valueType: 'valueDateTime',
            hl7DataType: 'DTM',
            value: ans.valueDateTime,
            unit: ''
        };
    }
    if (typeof ans.valueString === 'string') {
        return {
            valueType: 'valueString',
            hl7DataType: ans.valueString.includes('\n') ? 'FT' : 'ST',
            value: ans.valueString,
            unit: ''
        };
    }
    if (typeof ans.valueUri === 'string') {
        return {
            valueType: 'valueUri',
            hl7DataType: 'ST',
            value: ans.valueUri,
            unit: ''
        };
    }
    if (ans.valueReference && typeof ans.valueReference === 'object') {
        const refVal = ans.valueReference.display || ans.valueReference.reference || '';
        return {
            valueType: 'valueReference',
            hl7DataType: 'ST',
            value: refVal,
            unit: ''
        };
    }
    return null;
}

export function flattenQrItems(items, prefix = '') {
    let list = items;
    if (items && !Array.isArray(items) && typeof items === 'object' && Array.isArray(items.item)) {
        list = items.item;
    }
    if (!Array.isArray(list)) {
        return [];
    }

    const out = [];
    for (const item of list) {
        if (!item || typeof item !== 'object') {
            continue;
        }
        const linkId = typeof item.linkId === 'string' ? item.linkId : '';
        const itemText = typeof item.text === 'string' ? item.text : '';
        const fullText = prefix && itemText
            ? `${prefix}: ${itemText}`
            : (itemText || prefix || '');
        const itemCoding = extractItemCoding(item);
        const code = (itemCoding && itemCoding.code) || linkId || '';
        const system = (itemCoding && itemCoding.system) || (typeof item.definition === 'string' ? item.definition : '');
        const display = (itemCoding && itemCoding.display) || itemText || linkId || '';

        const answers = Array.isArray(item.answer) ? item.answer : [];
        const hasAnswers = answers.length > 0;
        const nextPrefix = !hasAnswers && itemText
            ? (prefix ? `${prefix}: ${itemText}` : itemText)
            : prefix;

        for (const ans of answers) {
            const normalized = normalizeQrAnswer(ans);
            if (normalized) {
                out.push({
                    linkId,
                    text: fullText,
                    code,
                    system,
                    display,
                    valueType: normalized.valueType,
                    hl7DataType: normalized.hl7DataType,
                    value: normalized.value,
                    unit: normalized.unit
                });
            }
            if (ans && Array.isArray(ans.item) && ans.item.length > 0) {
                const subPrefix = itemText ? (prefix ? `${prefix}: ${itemText}` : itemText) : prefix;
                out.push(...flattenQrItems(ans.item, subPrefix));
            }
        }

        if (Array.isArray(item.item) && item.item.length > 0) {
            out.push(...flattenQrItems(item.item, nextPrefix));
        }
    }

    return out;
}
