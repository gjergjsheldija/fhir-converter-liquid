import {GetSecretValueCommand, SecretsManagerClient} from "@aws-sdk/client-secrets-manager";
import {lstat, readFile, readlink, realpath} from "fs/promises";
import path from "path";

const SUPPORTED_SCHEMES = new Set(["aws-sm", "vault", "infisical", "file", "env"]);
const FORBIDDEN_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const INLINE_SECRET_FIELD_NAMES = new Set([
    "token",
    "password",
    "clientSecret",
    "apiKey",
    "secret",
    "accessToken",
    "privateKey",
    "secretId"
]);

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function isSecretRef(value) {
    if (typeof value !== "string") {
        return false;
    }
    const match = value.trim().match(/^([a-zA-Z0-9+.-]+):\/\//);
    return Boolean(match && SUPPORTED_SCHEMES.has(match[1].toLowerCase()));
}

export function parseSecretRef(uri) {
    if (typeof uri !== "string" || !uri.trim()) {
        throw httpError(400, "Secret reference URI must be a non-empty string.");
    }
    const trimmed = uri.trim();
    const hashIdx = trimmed.indexOf("#");
    const basePart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
    let jsonKey = null;
    if (hashIdx >= 0) {
        const rawFragment = trimmed.slice(hashIdx + 1).trim();
        if (!rawFragment) {
            throw httpError(400, "Secret reference fragment (#jsonKey) must not be empty.");
        }
        jsonKey = rawFragment;
    }

    const schemeMatch = basePart.match(/^([a-zA-Z0-9+.-]+):\/\/(.*)$/);
    if (!schemeMatch) {
        throw httpError(400, "Invalid secret reference URI format.");
    }

    const scheme = schemeMatch[1].toLowerCase();
    const rest = schemeMatch[2];

    if (!SUPPORTED_SCHEMES.has(scheme)) {
        throw httpError(400, `Unsupported secret reference scheme '${scheme}'.`);
    }

    switch (scheme) {
        case "aws-sm": {
            const secretId = rest.trim();
            if (!secretId) {
                throw httpError(400, "Invalid aws-sm:// secret reference; secretId is required.");
            }
            return {
                scheme,
                baseUri: `aws-sm://${secretId}`,
                secretId,
                jsonKey
            };
        }

        case "vault": {
            const marker = "/data/";
            const markerIdx = rest.indexOf(marker);
            const mount = markerIdx > 0 ? rest.slice(0, markerIdx).replace(/^\/+|\/+$/g, "") : "";
            const secretPath = markerIdx > 0 ? rest.slice(markerIdx + marker.length).replace(/^\/+|\/+$/g, "") : "";
            if (!mount || !secretPath) {
                throw httpError(400, "Invalid vault:// secret reference; expected vault://<mount>/data/<path>[#jsonKey].");
            }
            return {
                scheme,
                baseUri: `vault://${mount}/data/${secretPath}`,
                mount,
                path: secretPath,
                jsonKey
            };
        }

        case "infisical": {
            const segments = rest.split("/").filter((part) => part.length > 0);
            if (segments.length < 3) {
                throw httpError(
                    400,
                    "Invalid infisical:// secret reference; expected infisical://<projectId>/<environment>/<secretPathAndName>[#jsonKey]."
                );
            }
            const projectId = segments[0];
            const environment = segments[1];
            const secretName = segments[segments.length - 1];
            const folderSegments = segments.slice(2, -1);
            const secretPath = folderSegments.length > 0 ? "/" + folderSegments.join("/") : "/";
            return {
                scheme,
                baseUri: `infisical://${projectId}/${environment}/${segments.slice(2).join("/")}`,
                projectId,
                environment,
                secretPath,
                secretName,
                jsonKey
            };
        }

        case "file": {
            if (!rest || !rest.trim() || rest.includes("\0")) {
                throw httpError(400, "Invalid file:// secret reference; file path is required.");
            }
            return {
                scheme,
                baseUri: `file://${rest}`,
                filePath: rest,
                jsonKey
            };
        }

        case "env": {
            const varName = rest.trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(varName)) {
                throw httpError(400, `Invalid env:// secret reference variable name '${varName}'.`);
            }
            return {
                scheme,
                baseUri: `env://${varName}`,
                varName,
                jsonKey
            };
        }

        default:
            throw httpError(400, `Unsupported secret reference scheme '${scheme}'.`);
    }
}

function lookupJsonKey(obj, jsonKey) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
        return undefined;
    }
    if (FORBIDDEN_OBJECT_KEYS.has(jsonKey)) {
        return undefined;
    }
    if (Object.prototype.hasOwnProperty.call(obj, jsonKey)) {
        return obj[jsonKey];
    }
    if (!jsonKey.includes(".")) {
        return undefined;
    }
    const parts = jsonKey.split(".");
    let cursor = obj;
    for (const part of parts) {
        if (!part || FORBIDDEN_OBJECT_KEYS.has(part) || !cursor || typeof cursor !== "object") {
            return undefined;
        }
        if (!Object.prototype.hasOwnProperty.call(cursor, part)) {
            return undefined;
        }
        cursor = cursor[part];
    }
    return cursor;
}

function extractValueFromBasePayload(basePayload, jsonKey, scheme) {
    if (!jsonKey) {
        if (typeof basePayload === "string") {
            return basePayload;
        }
        if (basePayload && typeof basePayload === "object") {
            const keys = Object.keys(basePayload);
            if (keys.length === 1 && typeof basePayload.value === "string") {
                return basePayload.value;
            }
            return JSON.stringify(basePayload);
        }
        return String(basePayload);
    }

    let parsedObj = basePayload;
    if (typeof basePayload === "string") {
        try {
            parsedObj = JSON.parse(basePayload);
        } catch (err) {
            throw httpError(422, `Secret payload for ${scheme} reference with #${jsonKey} is not valid JSON.`);
        }
    }

    const extracted = lookupJsonKey(parsedObj, jsonKey);
    if (extracted === undefined || extracted === null) {
        throw httpError(404, `Key '${jsonKey}' not found in ${scheme} secret.`);
    }
    if (typeof extracted === "string") {
        return extracted;
    }
    if (typeof extracted === "object") {
        return JSON.stringify(extracted);
    }
    return String(extracted);
}

function validateHttpOrigin(rawUrl, label) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch (err) {
        throw httpError(500, `${label} must be a valid URL.`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw httpError(500, `${label} must start with http:// or https://.`);
    }
    return parsed.toString().replace(/\/+$/, "");
}

async function resolveConfinedSecretFile(filePath, secretsRoot) {
    const lexicalRoot = path.resolve(secretsRoot);
    const lexicalCandidate = path.resolve(lexicalRoot, filePath);

    if (lexicalCandidate === lexicalRoot || !lexicalCandidate.startsWith(lexicalRoot + path.sep)) {
        throw httpError(400, "Secret file path must stay within secretsFileRoot.");
    }

    let rootReal;
    try {
        rootReal = await realpath(lexicalRoot);
    } catch (err) {
        if (err && err.code === "ENOENT") {
            throw httpError(404, "Secrets mount root directory does not exist.");
        }
        throw err;
    }

    let targetReal;
    try {
        targetReal = await realpath(lexicalCandidate);
    } catch (err) {
        if (err && err.code === "ENOENT") {
            const statInfo = await lstat(lexicalCandidate).catch(() => null);
            if (statInfo && statInfo.isSymbolicLink()) {
                const rawLink = await readlink(lexicalCandidate);
                const resolvedLink = path.resolve(path.dirname(lexicalCandidate), rawLink);
                if (
                    resolvedLink !== rootReal &&
                    !resolvedLink.startsWith(rootReal + path.sep) &&
                    resolvedLink !== lexicalRoot &&
                    !resolvedLink.startsWith(lexicalRoot + path.sep)
                ) {
                    throw httpError(400, "Secret symlink target escapes secretsFileRoot.");
                }
            }
            let parentCursor = path.dirname(lexicalCandidate);
            while (parentCursor.length >= lexicalRoot.length) {
                const parentReal = await realpath(parentCursor).catch(() => null);
                if (parentReal) {
                    if (parentReal !== rootReal && !parentReal.startsWith(rootReal + path.sep)) {
                        throw httpError(400, "Secret file directory symlink escapes secretsFileRoot.");
                    }
                    break;
                }
                const nextParent = path.dirname(parentCursor);
                if (nextParent === parentCursor) {
                    break;
                }
                parentCursor = nextParent;
            }
            throw httpError(404, "Mounted secret file was not found.");
        }
        throw err;
    }

    if (targetReal === rootReal || !targetReal.startsWith(rootReal + path.sep)) {
        throw httpError(400, "Secret file realpath escapes secretsFileRoot.");
    }

    const statInfo = await lstat(targetReal);
    if (!statInfo.isFile()) {
        throw httpError(400, "Mounted secret target must be a regular file.");
    }

    return targetReal;
}

export function createSecretResolver(options = {}) {
    const ttlMs = options.ttlMs !== undefined ? Number(options.ttlMs) : 300000;
    const env = options.env || process.env;
    let awsClientInstance = options.awsClient || null;

    const cache = new Map();
    const inflight = new Map();

    let vaultAuthCache = null;
    let infisicalAuthCache = null;

    function getFetch() {
        const fn = options.fetchImpl || global.fetch;
        if (typeof fn !== "function") {
            throw httpError(500, "No fetch implementation available for SecretResolver.");
        }
        return fn;
    }

    function getAwsClient() {
        if (!awsClientInstance) {
            const region = env.AWS_REGION || env.AWS_DEFAULT_REGION || "eu-central-1";
            awsClientInstance = new SecretsManagerClient({region});
        }
        return awsClientInstance;
    }

    async function getVaultToken(vaultBase, namespaceHeaders) {
        if (env.VAULT_TOKEN) {
            return env.VAULT_TOKEN;
        }
        if (vaultAuthCache && vaultAuthCache.expiresAt > Date.now()) {
            return vaultAuthCache.token;
        }
        if (!env.VAULT_ROLE_ID || !env.VAULT_SECRET_ID) {
            throw httpError(500, "Vault authentication requires VAULT_TOKEN or VAULT_ROLE_ID and VAULT_SECRET_ID.");
        }
        const doFetch = getFetch();
        const response = await doFetch(`${vaultBase}/v1/auth/approle/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...namespaceHeaders
            },
            body: JSON.stringify({
                role_id: env.VAULT_ROLE_ID,
                secret_id: env.VAULT_SECRET_ID
            })
        });
        if (!response.ok) {
            throw httpError(502, `Vault AppRole login failed with status ${response.status}.`);
        }
        const payload = await response.json();
        const token = payload && payload.auth && payload.auth.client_token;
        if (typeof token !== "string" || !token) {
            throw httpError(502, "Vault AppRole login response did not contain auth.client_token.");
        }
        const leaseSeconds = Number(payload.auth.lease_duration);
        const tokenTtlMs = Number.isFinite(leaseSeconds) && leaseSeconds > 30
            ? (leaseSeconds - 30) * 1000
            : Math.max(0, ttlMs);
        if (tokenTtlMs > 0) {
            vaultAuthCache = {
                token,
                expiresAt: Date.now() + tokenTtlMs
            };
        }
        return token;
    }

    async function getInfisicalToken(infisicalBase) {
        if (env.INFISICAL_TOKEN) {
            return env.INFISICAL_TOKEN;
        }
        if (infisicalAuthCache && infisicalAuthCache.expiresAt > Date.now()) {
            return infisicalAuthCache.token;
        }
        if (!env.INFISICAL_CLIENT_ID || !env.INFISICAL_CLIENT_SECRET) {
            throw httpError(
                500,
                "Infisical authentication requires INFISICAL_TOKEN or INFISICAL_CLIENT_ID and INFISICAL_CLIENT_SECRET."
            );
        }
        const doFetch = getFetch();
        const response = await doFetch(`${infisicalBase}/api/v1/auth/universal-auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({
                clientId: env.INFISICAL_CLIENT_ID,
                clientSecret: env.INFISICAL_CLIENT_SECRET
            })
        });
        if (!response.ok) {
            throw httpError(502, `Infisical Universal Auth login failed with status ${response.status}.`);
        }
        const payload = await response.json();
        const token = payload && payload.accessToken;
        if (typeof token !== "string" || !token) {
            throw httpError(502, "Infisical Universal Auth response did not contain accessToken.");
        }
        const expiresInSeconds = Number(payload.expiresIn);
        const tokenTtlMs = Number.isFinite(expiresInSeconds) && expiresInSeconds > 30
            ? (expiresInSeconds - 30) * 1000
            : Math.max(0, ttlMs);
        if (tokenTtlMs > 0) {
            infisicalAuthCache = {
                token,
                expiresAt: Date.now() + tokenTtlMs
            };
        }
        return token;
    }

    async function fetchBaseSecret(parsed) {
        switch (parsed.scheme) {
            case "aws-sm": {
                const client = getAwsClient();
                const res = await client.send(new GetSecretValueCommand({SecretId: parsed.secretId}));
                if (res && typeof res.SecretString === "string") {
                    return res.SecretString;
                }
                if (res && res.SecretBinary != null) {
                    if (typeof res.SecretBinary === "string") {
                        return Buffer.from(res.SecretBinary, "base64").toString("utf8");
                    }
                    return Buffer.from(res.SecretBinary).toString("utf8");
                }
                throw httpError(404, `AWS Secrets Manager secret '${parsed.secretId}' returned an empty value.`);
            }

            case "vault": {
                if (!env.VAULT_ADDR) {
                    throw httpError(500, "VAULT_ADDR environment variable is required for vault:// secrets.");
                }
                const vaultBase = validateHttpOrigin(env.VAULT_ADDR, "VAULT_ADDR");
                const namespaceHeaders = env.VAULT_NAMESPACE ? {"X-Vault-Namespace": env.VAULT_NAMESPACE} : {};
                const token = await getVaultToken(vaultBase, namespaceHeaders);
                const encodedMount = parsed.mount.split("/").map(encodeURIComponent).join("/");
                const encodedPath = parsed.path.split("/").map(encodeURIComponent).join("/");
                const doFetch = getFetch();
                const response = await doFetch(`${vaultBase}/v1/${encodedMount}/data/${encodedPath}`, {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                        "X-Vault-Token": token,
                        ...namespaceHeaders
                    }
                });
                if (response.status === 404) {
                    throw httpError(404, `Vault secret '${parsed.mount}/data/${parsed.path}' was not found.`);
                }
                if (!response.ok) {
                    throw httpError(502, `Vault request failed with status ${response.status}.`);
                }
                const json = await response.json();
                const data = json && json.data && json.data.data;
                if (!data || typeof data !== "object") {
                    throw httpError(502, "Vault KV v2 response did not contain data.data.");
                }
                return data;
            }

            case "infisical": {
                const infisicalBase = validateHttpOrigin(
                    env.INFISICAL_URL || "https://app.infisical.com",
                    "INFISICAL_URL"
                );
                const token = await getInfisicalToken(infisicalBase);
                const query =
                    `workspaceId=${encodeURIComponent(parsed.projectId)}` +
                    `&environment=${encodeURIComponent(parsed.environment)}` +
                    `&secretPath=${encodeURIComponent(parsed.secretPath)}`;
                const url = `${infisicalBase}/api/v3/secrets/raw/${encodeURIComponent(parsed.secretName)}?${query}`;
                const doFetch = getFetch();
                const response = await doFetch(url, {
                    method: "GET",
                    headers: {
                        Accept: "application/json",
                        Authorization: `Bearer ${token}`
                    }
                });
                if (response.status === 404) {
                    throw httpError(404, `Infisical secret '${parsed.secretName}' was not found.`);
                }
                if (!response.ok) {
                    throw httpError(502, `Infisical request failed with status ${response.status}.`);
                }
                const json = await response.json();
                const secretValue = json && json.secret && json.secret.secretValue;
                if (typeof secretValue !== "string") {
                    throw httpError(502, "Infisical response did not contain secret.secretValue.");
                }
                return secretValue;
            }

            case "file": {
                const secretsRoot = options.secretsFileRoot || env.SECRETS_FILE_ROOT || "/var/run/secrets";
                const safePath = await resolveConfinedSecretFile(parsed.filePath, secretsRoot);
                const rawContent = await readFile(safePath, "utf8");
                return rawContent.replace(/[\r\n]+$/, "");
            }

            case "env": {
                const raw = env[parsed.varName];
                if (raw === undefined || raw === "") {
                    throw httpError(404, `Environment variable '${parsed.varName}' is not set.`);
                }
                return String(raw);
            }

            default:
                throw httpError(400, `Unsupported secret reference scheme '${parsed.scheme}'.`);
        }
    }

    async function getBaseSecret(parsed) {
        const now = Date.now();
        if (ttlMs > 0) {
            const cached = cache.get(parsed.baseUri);
            if (cached && cached.expiresAt > now) {
                return cached.value;
            }
            if (cached) {
                cache.delete(parsed.baseUri);
            }
        }

        if (inflight.has(parsed.baseUri)) {
            return inflight.get(parsed.baseUri);
        }

        const pending = fetchBaseSecret(parsed)
            .then((value) => {
                inflight.delete(parsed.baseUri);
                if (ttlMs > 0) {
                    cache.set(parsed.baseUri, {
                        value,
                        expiresAt: Date.now() + ttlMs
                    });
                }
                return value;
            })
            .catch((err) => {
                inflight.delete(parsed.baseUri);
                throw err;
            });

        inflight.set(parsed.baseUri, pending);
        return pending;
    }

    async function resolve(secretRef) {
        const parsed = parseSecretRef(secretRef);
        const basePayload = await getBaseSecret(parsed);
        return extractValueFromBasePayload(basePayload, parsed.jsonKey, parsed.scheme);
    }

    function invalidate(secretRef) {
        if (typeof secretRef !== "string" || !secretRef.trim()) {
            return false;
        }
        try {
            const parsed = parseSecretRef(secretRef);
            if (parsed.scheme === "vault") {
                vaultAuthCache = null;
            } else if (parsed.scheme === "infisical") {
                infisicalAuthCache = null;
            }
            return cache.delete(parsed.baseUri);
        } catch (err) {
            return false;
        }
    }

    function clear() {
        cache.clear();
        inflight.clear();
        vaultAuthCache = null;
        infisicalAuthCache = null;
    }

    return {
        resolve,
        invalidate,
        clear,
        parseSecretRef
    };
}

export const defaultSecretResolver = createSecretResolver();

function redactNode(node) {
    if (node === null || node === undefined) {
        return node;
    }
    if (typeof node === "string") {
        if (isSecretRef(node)) {
            try {
                const parsed = parseSecretRef(node);
                return `[REDACTED:${parsed.scheme}]`;
            } catch (err) {
                return "[REDACTED]";
            }
        }
        return node;
    }
    if (Array.isArray(node)) {
        return node.map((item) => redactNode(item));
    }
    if (typeof node !== "object") {
        return node;
    }

    const out = {};
    for (const [key, value] of Object.entries(node)) {
        if (FORBIDDEN_OBJECT_KEYS.has(key)) {
            continue;
        }
        if (INLINE_SECRET_FIELD_NAMES.has(key)) {
            continue;
        }
        if ((key === "secretRef" || key.endsWith("SecretRef") || key.endsWith("Ref")) && typeof value === "string") {
            try {
                const parsed = parseSecretRef(value);
                out[key] = `[REDACTED:${parsed.scheme}]`;
            } catch (err) {
                out[key] = "[REDACTED]";
            }
            continue;
        }
        out[key] = redactNode(value);
    }
    return out;
}

export function redactSecretsForDisplay(configObj) {
    return redactNode(configObj);
}
