// Coverage score between a generated field-map ConceptMap and a v2-to-FHIR IG ConceptMap.
// The browser copy of this logic lives in src/static/js/file-browser.js (classic script, no imports).

export function groupsOf(resource) {
    if (!resource || typeof resource !== 'object') {
        return [];
    }
    if (resource.resourceType === 'ConceptMap') {
        return Array.isArray(resource.group) ? resource.group : [];
    }
    if (resource.resourceType === 'Bundle' && Array.isArray(resource.entry)) {
        return resource.entry.reduce((all, entry) => {
            const inner = entry && entry.resource;
            return inner && inner.resourceType === 'ConceptMap' && Array.isArray(inner.group)
                ? all.concat(inner.group)
                : all;
        }, []);
    }
    return [];
}

function keysOf(resource) {
    const keys = new Set();
    for (const group of groupsOf(resource)) {
        if (!group || typeof group !== 'object') {
            continue;
        }
        const elements = Array.isArray(group.element) ? group.element : [];
        for (const element of elements) {
            if (!element || typeof element !== 'object') {
                continue;
            }
            const target = Array.isArray(element.target) && element.target[0] ? element.target[0].code : undefined;
            keys.add([group.source, element.code, group.target, target].join('|'));
        }
    }
    return keys;
}

export function coverageScore(generated, guide) {
    const generatedKeys = keysOf(generated);
    const guideKeys = keysOf(guide);
    let shared = 0;
    for (const key of generatedKeys) {
        if (guideKeys.has(key)) {
            shared += 1;
        }
    }
    return {
        shared,
        onlyGenerated: generatedKeys.size - shared,
        onlyGuide: guideKeys.size - shared
    };
}
