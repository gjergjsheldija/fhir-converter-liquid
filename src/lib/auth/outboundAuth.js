import crypto from "crypto";
import {defaultSecretResolver} from "../vault/secretResolver.js";

const oauthTokenCache = new Map();
const oauthInflight = new Map();

const SECRET_REF_FIELDS = [
    "secretRef",
    "tokenRef",
    "tokenSecretRef",
    "usernameRef",
    "usernameSecretRef",
    "passwordRef",
    "passwordSecretRef",
    "apiKeyRef",
    "apiKeySecretRef",
    "clientIdRef",
    "clientIdSecretRef",
    "clientSecretRef"
];

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function validateOAuthTokenUrl(rawUrl) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        throw httpError(400, "OAuth2 tokenUrl is required.");
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch (err) {
        throw httpError(400, "OAuth2 tokenUrl must be a valid URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw httpError(400, "OAuth2 tokenUrl must start with http:// or https://.");
    }
    return parsed.toString();
}

function buildConfigFingerprint(authConfig) {
    const normalizedUrl = typeof authConfig.tokenUrl === "string" ? authConfig.tokenUrl.trim() : "";
    return JSON.stringify([
        normalizedUrl,
        authConfig.clientId || authConfig.clientIdSecretRef || "",
        authConfig.clientSecretRef || authConfig.secretRef || "",
        authConfig.scope || "",
        authConfig.audience || ""
    ]);
}

function buildCredentialCacheKey(tokenUrl, clientId, clientSecret, scope, audience) {
    return crypto
        .createHash("sha256")
        .update(JSON.stringify([tokenUrl, clientId, clientSecret, scope || "", audience || ""]))
        .digest("hex");
}

export function isRefreshableAuth(authConfig) {
    if (!authConfig || typeof authConfig !== "object") {
        return false;
    }
    const rawType = String(authConfig.type || authConfig.auth || "").toLowerCase();
    if (rawType === "oauth2_client_credentials") {
        return true;
    }
    return SECRET_REF_FIELDS.some(
        (field) => typeof authConfig[field] === "string" && authConfig[field].trim().length > 0
    );
}

export function clearOAuthTokenCache() {
    oauthTokenCache.clear();
    oauthInflight.clear();
}

export function invalidateAuthSecrets(authConfig, secretResolver = defaultSecretResolver) {
    if (!authConfig || typeof authConfig !== "object") {
        return;
    }
    const resolver = secretResolver || defaultSecretResolver;
    for (const field of SECRET_REF_FIELDS) {
        const ref = authConfig[field];
        if (typeof ref === "string" && ref.trim().length > 0 && resolver && typeof resolver.invalidate === "function") {
            resolver.invalidate(ref);
        }
    }

    const rawType = String(authConfig.type || authConfig.auth || "").toLowerCase();
    if (rawType === "oauth2_client_credentials") {
        const targetFingerprint = buildConfigFingerprint(authConfig);
        const targetUrl = typeof authConfig.tokenUrl === "string" ? authConfig.tokenUrl.trim() : "";
        for (const [cacheKey, entry] of oauthTokenCache.entries()) {
            if (entry.configFingerprint === targetFingerprint || (targetUrl && entry.tokenUrl === targetUrl)) {
                oauthTokenCache.delete(cacheKey);
            }
        }
    }
}

async function resolveOAuthAccessToken(authConfig, resolver, doFetch) {
    const tokenUrl = validateOAuthTokenUrl(authConfig.tokenUrl);

    const clientIdRef = authConfig.clientIdSecretRef || authConfig.clientIdRef;
    const clientId = clientIdRef
        ? await resolver.resolve(clientIdRef)
        : authConfig.clientId;
    const secretRef = authConfig.clientSecretRef || authConfig.secretRef;
    const clientSecret = secretRef
        ? await resolver.resolve(secretRef)
        : authConfig.clientSecret;

    if (typeof clientId !== "string" || !clientId.trim()) {
        throw httpError(400, "OAuth2 client_credentials requires clientId or clientIdSecretRef.");
    }
    if (typeof clientSecret !== "string" || !clientSecret) {
        throw httpError(400, "OAuth2 client_credentials requires clientSecret or clientSecretRef.");
    }

    const scope = typeof authConfig.scope === "string" ? authConfig.scope.trim() : "";
    const audience = typeof authConfig.audience === "string" ? authConfig.audience.trim() : "";
    const cacheKey = buildCredentialCacheKey(tokenUrl, clientId, clientSecret, scope, audience);
    const configFingerprint = buildConfigFingerprint(authConfig);

    const cached = oauthTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.accessToken;
    }
    if (cached) {
        oauthTokenCache.delete(cacheKey);
    }

    if (oauthInflight.has(cacheKey)) {
        return oauthInflight.get(cacheKey);
    }

    const exchangePromise = (async () => {
        if (typeof doFetch !== "function") {
            throw httpError(500, "No fetch implementation available for OAuth2 token exchange.");
        }
        const form = new URLSearchParams();
        form.set("grant_type", "client_credentials");
        form.set("client_id", clientId);
        form.set("client_secret", clientSecret);
        if (scope) {
            form.set("scope", scope);
        }
        if (audience) {
            form.set("audience", audience);
        }

        let response;
        try {
            response = await doFetch(tokenUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json"
                },
                body: form.toString()
            });
        } catch (err) {
            throw httpError(502, `OAuth2 token request failed: ${err.message}`);
        }

        const rawText = await response.text();
        let parsedBody;
        try {
            parsedBody = JSON.parse(rawText);
        } catch (err) {
            parsedBody = rawText.slice(0, 500);
        }

        if (!response.ok) {
            const err = httpError(502, `OAuth2 token endpoint returned HTTP ${response.status}.`);
            err.detail = parsedBody;
            throw err;
        }

        const accessToken = parsedBody && typeof parsedBody === "object" ? parsedBody.access_token : null;
        if (typeof accessToken !== "string" || !accessToken.trim()) {
            throw httpError(502, "OAuth2 token endpoint response did not include a valid access_token.");
        }

        const rawExpiresIn = parsedBody.expires_in !== undefined ? Number(parsedBody.expires_in) : 300;
        const effectiveSeconds = Number.isFinite(rawExpiresIn) ? Math.max(0, rawExpiresIn - 30) : 270;
        if (effectiveSeconds > 0) {
            oauthTokenCache.set(cacheKey, {
                accessToken,
                expiresAt: Date.now() + effectiveSeconds * 1000,
                configFingerprint,
                tokenUrl
            });
        }
        return accessToken;
    })();

    oauthInflight.set(cacheKey, exchangePromise);
    try {
        return await exchangePromise;
    } finally {
        oauthInflight.delete(cacheKey);
    }
}

export async function buildOutboundHeaders(
    authConfig = {},
    {secretResolver = defaultSecretResolver, fetchImpl, baseHeaders = {}} = {}
) {
    const headers = Object.assign({}, baseHeaders);
    if (!authConfig || typeof authConfig !== "object") {
        return headers;
    }

    const resolver = secretResolver || defaultSecretResolver;
    const doFetch = fetchImpl || global.fetch;
    const isLegacyInline = authConfig.type === undefined && authConfig.auth !== undefined;
    const rawType = authConfig.type !== undefined ? authConfig.type : (authConfig.auth || "none");
    const authType = String(rawType).trim().toLowerCase();

    if (!authType || authType === "none") {
        return headers;
    }

    if (authType === "bearer") {
        const ref = authConfig.secretRef || authConfig.tokenSecretRef || authConfig.tokenRef;
        const token = ref ? await resolver.resolve(ref) : authConfig.token;
        if (typeof token === "string" && token.length > 0) {
            headers.Authorization = `Bearer ${token}`;
            return headers;
        }
        if (isLegacyInline) {
            return headers;
        }
        throw httpError(400, "Bearer authentication requires token or secretRef.");
    }

    if (authType === "basic") {
        const userRef = authConfig.usernameSecretRef || authConfig.usernameRef;
        let username = userRef
            ? await resolver.resolve(userRef)
            : authConfig.username;
        let password;

        const passRef = authConfig.passwordSecretRef || authConfig.passwordRef;
        if (passRef) {
            password = await resolver.resolve(passRef);
        } else if (authConfig.secretRef) {
            const resolvedSecret = await resolver.resolve(authConfig.secretRef);
            if (!username) {
                try {
                    const parsedJson = JSON.parse(resolvedSecret);
                    if (parsedJson && typeof parsedJson === "object" && typeof parsedJson.username === "string") {
                        username = parsedJson.username;
                        password = parsedJson.password !== undefined ? String(parsedJson.password) : "";
                    }
                } catch (err) {
                    const colonIdx = resolvedSecret.indexOf(":");
                    if (colonIdx > 0) {
                        username = resolvedSecret.slice(0, colonIdx);
                        password = resolvedSecret.slice(colonIdx + 1);
                    }
                }
            } else {
                password = resolvedSecret;
            }
        } else {
            password = authConfig.password !== undefined ? String(authConfig.password) : "";
        }

        if (typeof username === "string" && username.length > 0) {
            const encoded = Buffer.from(`${username}:${password !== undefined ? password : ""}`).toString("base64");
            headers.Authorization = `Basic ${encoded}`;
            return headers;
        }
        if (isLegacyInline) {
            return headers;
        }
        throw httpError(400, "Basic authentication requires username (or usernameSecretRef).");
    }

    if (authType === "api_key" || authType === "header" || authType === "api_key_header") {
        const headerName = typeof authConfig.headerName === "string" && authConfig.headerName.trim()
            ? authConfig.headerName.trim()
            : "X-API-Key";
        if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(headerName)) {
            throw httpError(400, "Invalid headerName for API key authentication.");
        }
        const ref = authConfig.secretRef || authConfig.apiKeySecretRef || authConfig.apiKeyRef;
        const apiKey = ref
            ? await resolver.resolve(ref)
            : (authConfig.apiKey || authConfig.value || authConfig.token);
        if (typeof apiKey !== "string" || !apiKey) {
            throw httpError(400, "API key authentication requires secretRef or apiKey.");
        }
        headers[headerName] = apiKey;
        return headers;
    }

    if (authType === "oauth2_client_credentials") {
        const accessToken = await resolveOAuthAccessToken(authConfig, resolver, doFetch);
        headers.Authorization = `Bearer ${accessToken}`;
        return headers;
    }

    throw httpError(400, `Unsupported outbound authentication type '${rawType}'.`);
}
