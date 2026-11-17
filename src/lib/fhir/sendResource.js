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

export async function sendResource(baseUrl, resource, auth) {
    const target = fhirTarget(baseUrl, resource);
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
