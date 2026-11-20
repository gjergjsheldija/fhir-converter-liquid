import { readFileSync } from 'fs';

let DEFAULT_CONVERTER_VERSION = '0.1.0';
try {
    const pkg = JSON.parse(
        readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')
    );
    if (pkg && typeof pkg.version === 'string' && pkg.version.trim() !== '') {
        DEFAULT_CONVERTER_VERSION = pkg.version.trim();
    }
} catch {
    DEFAULT_CONVERTER_VERSION = '0.1.0';
}

const UPSTREAM_PROVENANCE_DIV_REGEX = /^<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"><p><span>Resource bundle generated on ([^<]+) using Microsoft FHIR Converter\.<\/span><span>Template Version: [^<]*<\/span><span>Template URL: [^<]*<\/span><span>Root template: ([^<]+)\.<\/span><\/p><\/div>$/;

function rewriteSingleProvenance(provenance, ver) {
    if (
        !provenance ||
        typeof provenance !== 'object' ||
        provenance.resourceType !== 'Provenance' ||
        !provenance.text ||
        typeof provenance.text.div !== 'string'
    ) {
        return;
    }

    const match = provenance.text.div.match(UPSTREAM_PROVENANCE_DIV_REGEX);
    if (!match) {
        return;
    }

    const instant = match[1];
    const rootTemplate = match[2];
    provenance.text.div = `<div xmlns="http://www.w3.org/1999/xhtml"><p><span>Resource bundle generated on ${instant} using FHIR Converter Liquid.</span><span>Converter version: ${ver}.</span><span>Root template: ${rootTemplate}.</span></p></div>`;
}

export function rewriteProvenanceNarratives(resource, version) {
    if (!resource || typeof resource !== 'object') {
        return resource;
    }

    const ver = (typeof version === 'string' && version.trim() !== '')
        ? version.trim()
        : DEFAULT_CONVERTER_VERSION;

    if (resource.resourceType === 'Provenance') {
        rewriteSingleProvenance(resource, ver);
    } else if (resource.resourceType === 'Bundle' && Array.isArray(resource.entry)) {
        for (const entry of resource.entry) {
            if (entry && entry.resource && typeof entry.resource === 'object') {
                rewriteSingleProvenance(entry.resource, ver);
            }
        }
    }

    return resource;
}

export default {
    rewriteProvenanceNarratives,
};
