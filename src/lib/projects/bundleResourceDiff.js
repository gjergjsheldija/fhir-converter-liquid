// Browser twin: the same function lives between the BEGIN/END markers in
// src/static/js/debug-drawer.js (classic scripts cannot import this module).
// bundleResourceDiff.spec.js runs both copies against the same cases.

function canonicalJson(value) {
    if (Array.isArray(value)) {
        return "[" + value.map(canonicalJson).join(",") + "]";
    }
    if (value && typeof value === "object") {
        return "{" + Object.keys(value).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(value[k])).join(",") + "}";
    }
    return JSON.stringify(value === undefined ? null : value);
}

function indexBundle(bundle) {
    const keyed = new Map();
    const unmatched = [];
    const entries = bundle && Array.isArray(bundle.entry) ? bundle.entry : [];
    entries.forEach((entry, index) => {
        const resource = (entry && entry.resource) || {};
        const resourceType = resource.resourceType || "Resource";
        let id = resource.id;
        if (!id && entry && typeof entry.fullUrl === "string" && entry.fullUrl.startsWith("urn:uuid:")) {
            id = entry.fullUrl.substring("urn:uuid:".length);
        }
        if (!id) {
            unmatched.push({key: resourceType + "/" + index, resourceType, id: ""});
            return;
        }
        const key = resourceType + "/" + id;
        if (!keyed.has(key)) {
            keyed.set(key, []);
        }
        keyed.get(key).push({key, resourceType, id, json: canonicalJson(resource)});
    });
    return {keyed, unmatched};
}

function byKey(a, b) {
    return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
}

function strip(item) {
    return {key: item.key, resourceType: item.resourceType, id: item.id};
}

export function bundleResourceDiff(actual, expected) {
    const act = indexBundle(actual);
    const exp = indexBundle(expected);
    const added = act.unmatched.slice();
    const removed = exp.unmatched.slice();
    const changed = [];

    for (const [key, actualList] of act.keyed) {
        const expectedList = exp.keyed.get(key) || [];
        actualList.forEach((item, i) => {
            if (i >= expectedList.length) {
                added.push(strip(item));
            } else if (item.json !== expectedList[i].json) {
                changed.push(strip(item));
            }
        });
    }
    for (const [key, expectedList] of exp.keyed) {
        const actualList = act.keyed.get(key) || [];
        expectedList.forEach((item, i) => {
            if (i >= actualList.length) {
                removed.push(strip(item));
            }
        });
    }

    return {added: added.sort(byKey), removed: removed.sort(byKey), changed: changed.sort(byKey)};
}
