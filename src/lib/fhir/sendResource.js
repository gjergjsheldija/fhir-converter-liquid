// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
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

export function conditionalTransaction(resource) {
    if (!resource || resource.resourceType !== "Bundle" || (resource.type !== "batch" && resource.type !== "collection")) {
        return resource;
    }
    const copy = JSON.parse(JSON.stringify(resource));
    copy.type = "transaction";
    copy.entry = (Array.isArray(copy.entry) ? copy.entry : []).map((entry) => {
        const entryResource = entry && entry.resource;
        const request = {method: "POST", url: entryResource && entryResource.resourceType};
        const identifier = entryResource && Array.isArray(entryResource.identifier) ? entryResource.identifier[0] : undefined;
        if (identifier && typeof identifier === "object" &&
            typeof identifier.system === "string" && identifier.system !== "" &&
            typeof identifier.value === "string" && identifier.value !== "") {
            request.ifNoneExist = "identifier=" + encodeURIComponent(identifier.system) + "|" + encodeURIComponent(identifier.value);
        }
        return Object.assign({}, entry, {request});
    });
    return copy;
}

export function conditionalUpdate(resource) {
    if (!resource || resource.resourceType !== "Bundle" || (resource.type !== "batch" && resource.type !== "collection")) {
        return resource;
    }
    const copy = JSON.parse(JSON.stringify(resource));
    copy.type = "transaction";
    copy.entry = (Array.isArray(copy.entry) ? copy.entry : []).map((entry) => {
        const entryResource = entry && entry.resource;
        const request = {method: "POST", url: entryResource && entryResource.resourceType};
        const identifier = entryResource && Array.isArray(entryResource.identifier) ? entryResource.identifier[0] : undefined;
        if (identifier && typeof identifier === "object" &&
            typeof identifier.system === "string" && identifier.system !== "" &&
            typeof identifier.value === "string" && identifier.value !== "") {
            request.method = "PUT";
            request.url = entryResource.resourceType + "?identifier=" + encodeURIComponent(identifier.system) + "|" + encodeURIComponent(identifier.value);
        }
        return Object.assign({}, entry, {request});
    });
    return copy;
}

export async function sendResource(baseUrl, resource, auth, options) {
    let payload = resource;
    if (options && options.update === true) {
        payload = conditionalUpdate(resource);
    } else if (options && options.conditional === true) {
        payload = conditionalTransaction(resource);
    }
    const target = fhirTarget(baseUrl, payload);
    let response;
    try {
        response = await fetch(target, {
            method: "POST",
            headers: fhirHeaders(auth),
            body: JSON.stringify(payload)
        });
    } catch (err) {
        throw httpError(400, `FHIR server request failed: ${err.message}`);
    }
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
    return {ok: true, status: response.status, location: response.headers.get("location") || "", body};
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
    let response;
    try {
        response = await fetch(target, {
            method: "POST",
            headers: fhirHeaders(auth),
            body: JSON.stringify(resource)
        });
    } catch (err) {
        throw httpError(400, `FHIR server request failed: ${err.message}`);
    }
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
