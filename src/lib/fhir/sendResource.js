import {buildOutboundHeaders, invalidateAuthSecrets, isRefreshableAuth} from "../auth/outboundAuth.js";

const DEFAULT_FHIR_TIMEOUT_MS = 15000;
const FHIR_BASE_HEADERS = {
    Accept: "application/fhir+json",
    "Content-Type": "application/fhir+json"
};

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function buildTimeoutSignal(options) {
    const timeoutMs = options && options.timeoutMs !== undefined ? Number(options.timeoutMs) : DEFAULT_FHIR_TIMEOUT_MS;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0 && global.AbortSignal && typeof global.AbortSignal.timeout === "function") {
        return global.AbortSignal.timeout(timeoutMs);
    }
    return undefined;
}

function isTransformableBundle(resource) {
    return Boolean(
        resource &&
        resource.resourceType === "Bundle" &&
        (resource.type === "batch" || resource.type === "collection" || resource.type === "document")
    );
}

export function fhirTarget(baseUrl, resource) {
    let url;
    try {
        url = new URL(baseUrl);
    } catch (err) {
        throw httpError(400, "Enter a FHIR server URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw httpError(400, "FHIR server URL must start with http:// or https://.");
    }
    if (!resource || !resource.resourceType) {
        throw httpError(400, "Result has no resourceType.");
    }
    const base = url.toString().replace(/\/+$/, "");
    if (resource.resourceType === "Bundle" && (resource.type === "transaction" || resource.type === "batch")) {
        return base;
    }
    return base + "/" + encodeURIComponent(resource.resourceType);
}

export function fhirHeaders(auth) {
    const headers = {
        Accept: "application/fhir+json",
        "Content-Type": "application/fhir+json"
    };
    if (auth && auth.auth === "bearer" && auth.token) {
        headers.Authorization = "Bearer " + auth.token;
    }
    if (auth && auth.auth === "basic" && auth.username) {
        headers.Authorization = "Basic " + Buffer.from(`${auth.username}:${auth.password || ""}`).toString("base64");
    }
    return headers;
}

function firstValidIdentifier(entryResource) {
    const identifier = entryResource && Array.isArray(entryResource.identifier) ? entryResource.identifier[0] : undefined;
    if (identifier && typeof identifier === "object" &&
        typeof identifier.system === "string" && identifier.system !== "" &&
        typeof identifier.value === "string" && identifier.value !== "") {
        return identifier;
    }
    return undefined;
}

function rewriteReferences(node, refMap) {
    if (!node || typeof node !== "object") {
        return;
    }
    if (Array.isArray(node)) {
        for (const item of node) {
            rewriteReferences(item, refMap);
        }
        return;
    }
    if (typeof node.reference === "string" && refMap.has(node.reference)) {
        node.reference = refMap.get(node.reference);
    }
    for (const key of Object.keys(node)) {
        const value = node[key];
        if (value && typeof value === "object") {
            rewriteReferences(value, refMap);
        }
    }
}

function prepareTransactionEntries(copy, isUpdate) {
    const entries = Array.isArray(copy.entry) ? copy.entry : [];
    const refMap = new Map();
    const promotedEntries = new Set();

    for (const entry of entries) {
        const entryResource = entry && typeof entry === "object" && !Array.isArray(entry) ? entry.resource : undefined;
        if (entryResource && typeof entryResource === "object" && !Array.isArray(entryResource) &&
            typeof entryResource.resourceType === "string" && entryResource.resourceType !== "" &&
            typeof entryResource.id === "string" && entryResource.id !== "") {
            if (!(typeof entry.fullUrl === "string" && entry.fullUrl.startsWith("urn:uuid:"))) {
                entry.fullUrl = "urn:uuid:" + entryResource.id;
            }
            refMap.set(`${entryResource.resourceType}/${entryResource.id}`, entry.fullUrl);
            promotedEntries.add(entry);
        }
    }

    copy.entry = entries.map((entry) => {
        const entryResource = entry && entry.resource;
        if (refMap.size > 0 && entryResource && typeof entryResource === "object") {
            rewriteReferences(entryResource, refMap);
        }
        const request = {method: "POST", url: entryResource && entryResource.resourceType};
        const identifier = firstValidIdentifier(entryResource);
        if (identifier) {
            if (isUpdate) {
                request.method = "PUT";
                request.url = entryResource.resourceType + "?identifier=" + encodeURIComponent(identifier.system) + "|" + encodeURIComponent(identifier.value);
            } else {
                request.ifNoneExist = "identifier=" + encodeURIComponent(identifier.system) + "|" + encodeURIComponent(identifier.value);
            }
        }
        if (promotedEntries.has(entry) &&
            (request.method === "POST" || (request.method === "PUT" && typeof request.url === "string" && request.url.includes("?identifier=")))) {
            delete entryResource.id;
        }
        return Object.assign({}, entry, {request});
    });
}

export function conditionalTransaction(resource) {
    if (!isTransformableBundle(resource)) {
        return resource;
    }
    const copy = JSON.parse(JSON.stringify(resource));
    copy.type = "transaction";
    prepareTransactionEntries(copy, false);
    return copy;
}

export function conditionalUpdate(resource) {
    if (!isTransformableBundle(resource)) {
        return resource;
    }
    const copy = JSON.parse(JSON.stringify(resource));
    copy.type = "transaction";
    prepareTransactionEntries(copy, true);
    return copy;
}

function buildFhirBaseHeaders(options) {
    const baseHeaders = {
        ...FHIR_BASE_HEADERS
    };
    if (options && typeof options.requestId === "string" && options.requestId.trim()) {
        baseHeaders["X-Request-Id"] = options.requestId.trim();
    }
    if (options && typeof options.traceparent === "string" && options.traceparent.trim()) {
        baseHeaders.traceparent = options.traceparent.trim();
    }
    return baseHeaders;
}

async function executeFhirPost(target, serializedBody, auth, options) {
    const doFetch = (options && options.fetchImpl) || global.fetch;
    const secretResolver = options && options.secretResolver;
    const baseHeaders = buildFhirBaseHeaders(options);
    let headers = await buildOutboundHeaders(auth, {
        secretResolver,
        fetchImpl: doFetch,
        baseHeaders
    });

    const performFetch = async (reqHeaders) => {
        const signal = buildTimeoutSignal(options);
        const init = {
            method: "POST",
            headers: reqHeaders,
            body: serializedBody
        };
        if (signal) {
            init.signal = signal;
        }
        return doFetch(target, init);
    };

    let response;
    try {
        response = await performFetch(headers);
    } catch (err) {
        throw httpError(400, `FHIR server request failed: ${err.message}`);
    }

    if (response && response.status === 401 && isRefreshableAuth(auth)) {
        invalidateAuthSecrets(auth, secretResolver);
        headers = await buildOutboundHeaders(auth, {
            secretResolver,
            fetchImpl: doFetch,
            baseHeaders
        });
        try {
            response = await performFetch(headers);
        } catch (err) {
            throw httpError(400, `FHIR server request failed: ${err.message}`);
        }
    }

    return response;
}

export async function sendResource(baseUrl, resource, auth, options) {
    let payload = resource;
    if (options && options.update === true) {
        payload = conditionalUpdate(resource);
    } else if (options && options.conditional === true) {
        payload = conditionalTransaction(resource);
    }
    const target = fhirTarget(baseUrl, payload);
    const response = await executeFhirPost(target, JSON.stringify(payload), auth, options);
    const text = await response.text();
    let body = text.slice(0, 500);
    try {
        body = JSON.parse(text);
    } catch (err) {
        body = text.slice(0, 500);
    }
    if (!response.ok) {
        const error = httpError(400, `FHIR server returned ${response.status}.`);
        error.detail = body;
        throw error;
    }
    return {
        ok: true,
        status: response.status,
        location: (response.headers && typeof response.headers.get === "function" && response.headers.get("location")) || "",
        body
    };
}

export function validateTarget(baseUrl, profile) {
    let url;
    try {
        url = new URL(baseUrl);
    } catch (err) {
        throw httpError(400, "Enter a FHIR server URL.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw httpError(400, "FHIR server URL must start with http:// or https://.");
    }
    const target = url.toString().replace(/\/+$/, "") + "/$validate";
    if (typeof profile === "string" && profile.trim() !== "") {
        return target + "?profile=" + encodeURIComponent(profile.trim());
    }
    return target;
}

export async function validateResource(baseUrl, resource, auth, options) {
    const target = validateTarget(baseUrl, options && options.profile);
    if (!resource || typeof resource !== "object" || !resource.resourceType) {
        throw httpError(400, "Result has no resourceType.");
    }
    const response = await executeFhirPost(target, JSON.stringify(resource), auth, options);
    const text = await response.text();
    let body;
    try {
        body = JSON.parse(text);
    } catch (err) {
        body = text.slice(0, 500);
    }
    const result = {ok: response.ok, status: response.status, issues: []};
    if (body && typeof body === "object" && body.resourceType === "OperationOutcome") {
        result.issues = Array.isArray(body.issue) ? body.issue : [];
    } else {
        result.body = body;
    }
    return result;
}
