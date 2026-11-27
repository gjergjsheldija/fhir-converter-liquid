import crypto from "crypto";
import {readFile, readdir, realpath, stat} from "fs/promises";
import path, {join, resolve, sep} from "path";
import yaml from "js-yaml";
import {LRUCache} from "lru-cache";
import {CUSTOMERS_LOCATION} from "../constants/constants.js";
import {
    defaultSecretResolver,
    parseSecretRef,
    redactSecretsForDisplay
} from "../vault/secretResolver.js";

export const CUSTOMER_ID_REGEX = /^[a-z0-9][a-z0-9._-]{0,62}$/;

const DEFAULT_CUSTOMER_CACHE_TTL_MS = 60000;
let customerCache = new LRUCache({
    max: 128,
    ttl: Math.max(1000, Number(process.env.CUSTOMER_CACHE_TTL_MS) || DEFAULT_CUSTOMER_CACHE_TTL_MS)
});

export function clearCustomerCache() {
    customerCache.clear();
}

const VALID_FHIR_DELIVERY_MODES = new Set(["none", "standard", "conditional_create", "conditional_update"]);
const VALID_HL7V2_WIRE_FORMATS = new Set(["json_envelope", "raw_er7"]);
const AUTH_SECRET_REF_KEYS = [
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

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function validateCustomerId(customerId) {
    if (
        typeof customerId !== "string" ||
        !CUSTOMER_ID_REGEX.test(customerId) ||
        customerId === "." ||
        customerId === ".." ||
        customerId.includes("..")
    ) {
        throw httpError(400, "Invalid customer ID.");
    }
    return customerId;
}

function validateHttpUrl(rawUrl, fieldLabel) {
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
        throw httpError(400, `${fieldLabel} must be a non-empty URL string.`);
    }
    let parsed;
    try {
        parsed = new URL(rawUrl.trim());
    } catch (err) {
        throw httpError(400, `${fieldLabel} must be a valid URL.`);
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw httpError(400, `${fieldLabel} must start with http:// or https://.`);
    }
    return parsed.toString();
}

function validateAuthObject(auth, fieldLabel) {
    if (auth === undefined || auth === null) {
        return undefined;
    }
    if (!isPlainObject(auth)) {
        throw httpError(400, `${fieldLabel} must be an object.`);
    }
    for (const refKey of AUTH_SECRET_REF_KEYS) {
        if (auth[refKey] !== undefined) {
            parseSecretRef(auth[refKey]);
        }
    }
    if (auth.tokenUrl !== undefined) {
        validateHttpUrl(auth.tokenUrl, `${fieldLabel}.tokenUrl`);
    }
    return {...auth};
}

function validateAndNormalizeConfig(parsed, expectedCustomerId) {
    if (!isPlainObject(parsed)) {
        throw httpError(400, "Customer config.yaml must contain a YAML mapping object.");
    }
    validateCustomerId(parsed.customerId);
    if (parsed.customerId !== expectedCustomerId) {
        throw httpError(
            400,
            `Customer config customerId '${parsed.customerId}' does not match directory '${expectedCustomerId}'.`
        );
    }
    if (typeof parsed.name !== "string" || !parsed.name.trim()) {
        throw httpError(400, "Customer config.yaml requires a non-empty 'name' string.");
    }

    let inboundAuth;
    if (parsed.inboundAuth !== undefined && parsed.inboundAuth !== null) {
        inboundAuth = validateAuthObject(parsed.inboundAuth, "inboundAuth");
    }

    let identifiers = {};
    if (parsed.identifiers !== undefined && parsed.identifiers !== null) {
        if (!isPlainObject(parsed.identifiers)) {
            throw httpError(400, "Customer 'identifiers' must be a mapping object.");
        }
        identifiers = {...parsed.identifiers};
        if (identifiers.mrnSystem && !identifiers.patientMrnSystem) {
            identifiers.patientMrnSystem = identifiers.mrnSystem;
        } else if (identifiers.patientMrnSystem && !identifiers.mrnSystem) {
            identifiers.mrnSystem = identifiers.patientMrnSystem;
        }
    }

    let hl7v2 = {};
    if (parsed.msh !== undefined && parsed.msh !== null) {
        if (!isPlainObject(parsed.msh)) {
            throw httpError(400, "Customer 'msh' must be a mapping object.");
        }
        hl7v2 = {...parsed.msh};
    }
    if (parsed.hl7v2 !== undefined && parsed.hl7v2 !== null) {
        if (!isPlainObject(parsed.hl7v2)) {
            throw httpError(400, "Customer 'hl7v2' must be a mapping object.");
        }
        hl7v2 = {...hl7v2, ...parsed.hl7v2};
    }
    if (hl7v2.characterSet && !hl7v2.charset) {
        hl7v2.charset = hl7v2.characterSet;
    }
    if (parsed.requireCorrelationIds !== undefined && hl7v2.requireCorrelationIds === undefined) {
        hl7v2.requireCorrelationIds = Boolean(parsed.requireCorrelationIds);
    }

    const targets = {};
    if (parsed.targets !== undefined && parsed.targets !== null) {
        if (!isPlainObject(parsed.targets)) {
            throw httpError(400, "Customer 'targets' must be a mapping object.");
        }

        if (parsed.targets.fhirServer !== undefined && parsed.targets.fhirServer !== null) {
            const fhirCfg = parsed.targets.fhirServer;
            if (!isPlainObject(fhirCfg)) {
                throw httpError(400, "targets.fhirServer must be a mapping object.");
            }
            const normalizedFhir = {...fhirCfg};
            if (fhirCfg.baseUrl !== undefined && fhirCfg.baseUrl !== "") {
                validateHttpUrl(fhirCfg.baseUrl, "targets.fhirServer.baseUrl");
            }
            const rawMode = fhirCfg.mode !== undefined ? fhirCfg.mode : fhirCfg.transactionMode;
            if (rawMode !== undefined && !VALID_FHIR_DELIVERY_MODES.has(rawMode)) {
                throw httpError(
                    400,
                    `Invalid targets.fhirServer.mode '${rawMode}'. Expected standard, conditional_create, or conditional_update.`
                );
            }
            if (rawMode !== undefined) {
                normalizedFhir.mode = rawMode === "none" ? "standard" : rawMode;
            }
            if (fhirCfg.auth !== undefined) {
                normalizedFhir.auth = validateAuthObject(fhirCfg.auth, "targets.fhirServer.auth");
            }
            targets.fhirServer = normalizedFhir;
        }

        if (parsed.targets.hl7v2Gateway !== undefined && parsed.targets.hl7v2Gateway !== null) {
            const gwCfg = parsed.targets.hl7v2Gateway;
            if (!isPlainObject(gwCfg)) {
                throw httpError(400, "targets.hl7v2Gateway must be a mapping object.");
            }
            const normalizedGw = {...gwCfg};
            const rawGwUrl = gwCfg.baseUrl !== undefined ? gwCfg.baseUrl : gwCfg.url;
            if (rawGwUrl !== undefined && rawGwUrl !== "") {
                validateHttpUrl(rawGwUrl, "targets.hl7v2Gateway.baseUrl");
                normalizedGw.baseUrl = rawGwUrl;
            }
            if (gwCfg.format !== undefined && !VALID_HL7V2_WIRE_FORMATS.has(gwCfg.format)) {
                throw httpError(
                    400,
                    `Invalid targets.hl7v2Gateway.format '${gwCfg.format}'. Expected json_envelope or raw_er7.`
                );
            }
            if (gwCfg.auth !== undefined) {
                normalizedGw.auth = validateAuthObject(gwCfg.auth, "targets.hl7v2Gateway.auth");
            }
            targets.hl7v2Gateway = normalizedGw;
        }
    }

    if (parsed.defaults !== undefined && parsed.defaults !== null && !isPlainObject(parsed.defaults)) {
        throw httpError(400, "Customer 'defaults' must be a mapping object.");
    }
    const rawDefaults = parsed.defaults || {};
    const defaults = {
        fallbackToBuiltin: rawDefaults.fallbackToBuiltin !== undefined ? Boolean(rawDefaults.fallbackToBuiltin) : true,
        autoDeliverInbound: rawDefaults.autoDeliverInbound !== undefined ? Boolean(rawDefaults.autoDeliverInbound) : false,
        autoDeliverOutbound: rawDefaults.autoDeliverOutbound !== undefined ? Boolean(rawDefaults.autoDeliverOutbound) : false
    };

    return {
        customerId: parsed.customerId,
        name: parsed.name.trim(),
        description: typeof parsed.description === "string" ? parsed.description.trim() : "",
        ...(inboundAuth !== undefined ? {inboundAuth} : {}),
        identifiers,
        hl7v2,
        targets,
        defaults
    };
}

async function listLiquidTemplates(rootDir, currentRel = "") {
    const targetDir = currentRel ? join(rootDir, currentRel) : rootDir;
    let entries;
    try {
        entries = await readdir(targetDir, {withFileTypes: true});
    } catch (err) {
        if (err && err.code === "ENOENT") {
            return [];
        }
        throw err;
    }

    const found = [];
    for (const entry of entries) {
        const relPath = currentRel ? `${currentRel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            const sub = await listLiquidTemplates(rootDir, relPath);
            found.push(...sub);
        } else if (entry.isFile() && entry.name.endsWith(".liquid") && !entry.name.startsWith("_")) {
            found.push(relPath);
        }
    }
    return found.sort();
}

async function findCustomerConfigFile(customerDir) {
    for (const filename of ["config.yaml", "config.yml"]) {
        const candidate = join(customerDir, filename);
        try {
            const st = await stat(candidate);
            if (st.isFile()) {
                return candidate;
            }
        } catch (err) {
            if (!err || err.code !== "ENOENT") {
                throw err;
            }
        }
    }
    return null;
}

function resolveCustomersBase(customersRoot) {
    return resolve(customersRoot || process.env.CUSTOMERS_ROOT || CUSTOMERS_LOCATION);
}

export async function loadCustomer(customerId, customersRoot, options = {}) {
    validateCustomerId(customerId);
    const baseRoot = resolveCustomersBase(customersRoot);
    const cacheKey = `${baseRoot}:${customerId}`;
    const shouldUseCache =
        !(options && options.bypassCache === true) && process.env.CUSTOMER_CACHE_TTL_MS !== "0";
    if (shouldUseCache) {
        const cached = customerCache.get(cacheKey);
        if (cached) {
            return cached;
        }
    }

    const candidateDir = resolve(baseRoot, customerId);
    if (!candidateDir.startsWith(baseRoot + sep)) {
        throw httpError(400, "Invalid customer ID.");
    }

    let rootReal;
    try {
        rootReal = await realpath(baseRoot);
    } catch (err) {
        if (err && err.code === "ENOENT") {
            throw httpError(404, `Customer '${customerId}' was not found.`);
        }
        throw err;
    }

    let customerReal;
    try {
        customerReal = await realpath(candidateDir);
    } catch (err) {
        if (err && err.code === "ENOENT") {
            throw httpError(404, `Customer '${customerId}' was not found.`);
        }
        throw err;
    }

    if (customerReal === rootReal || !customerReal.startsWith(rootReal + path.sep)) {
        throw httpError(400, "Customer directory escapes customersRoot.");
    }

    const dirStat = await stat(customerReal);
    if (!dirStat.isDirectory()) {
        throw httpError(404, `Customer '${customerId}' was not found.`);
    }

    const configPath = await findCustomerConfigFile(customerReal);
    if (!configPath) {
        throw httpError(404, `Customer '${customerId}' has no config.yaml.`);
    }

    const rawYaml = await readFile(configPath, "utf8");
    let parsedYaml;
    try {
        parsedYaml = yaml.load(rawYaml, {schema: yaml.JSON_SCHEMA});
    } catch (err) {
        throw httpError(400, `Invalid YAML in ${customerId}/config.yaml: ${err.message}`);
    }

    const normalized = validateAndNormalizeConfig(parsedYaml, customerId);
    const inputDir = join(customerReal, "input");
    const outputDir = join(customerReal, "output");
    const [inputTemplates, outputTemplates] = await Promise.all([
        listLiquidTemplates(inputDir),
        listLiquidTemplates(outputDir)
    ]);

    const loaded = {
        ...normalized,
        customerDir: customerReal,
        inputDir,
        outputDir,
        templates: {
            input: inputTemplates,
            output: outputTemplates
        }
    };
    if (shouldUseCache) {
        customerCache.set(cacheKey, loaded);
    }
    return loaded;
}

export function getRedactedCustomerSummary(customerConfig) {
    if (!customerConfig || typeof customerConfig !== "object") {
        return null;
    }
    const redacted = redactSecretsForDisplay(customerConfig);
    delete redacted.customerDir;
    delete redacted.inputDir;
    delete redacted.outputDir;
    return redacted;
}

export async function listCustomers(customersRoot) {
    const baseRoot = resolveCustomersBase(customersRoot);
    let entries;
    try {
        entries = await readdir(baseRoot, {withFileTypes: true});
    } catch (err) {
        if (err && err.code === "ENOENT") {
            return [];
        }
        throw err;
    }

    const names = entries
        .filter((entry) => entry.isDirectory() && CUSTOMER_ID_REGEX.test(entry.name))
        .map((entry) => entry.name)
        .sort();

    const summaries = [];
    for (const name of names) {
        const cfgFile = await findCustomerConfigFile(join(baseRoot, name));
        if (!cfgFile) {
            continue;
        }
        const loaded = await loadCustomer(name, baseRoot, {bypassCache: true});
        summaries.push(getRedactedCustomerSummary(loaded));
    }
    return summaries;
}

function getHeaderCaseInsensitive(headers, targetName) {
    if (!headers || typeof headers !== "object") {
        return "";
    }
    const lowerTarget = targetName.toLowerCase();
    for (const [key, val] of Object.entries(headers)) {
        if (key.toLowerCase() === lowerTarget) {
            if (Array.isArray(val)) {
                return typeof val[0] === "string" ? val[0] : "";
            }
            return typeof val === "string" ? val : "";
        }
    }
    return "";
}

function constantTimeEquals(provided, expected) {
    if (typeof provided !== "string" || typeof expected !== "string") {
        return false;
    }
    const hashProvided = crypto.createHash("sha256").update(provided, "utf8").digest();
    const hashExpected = crypto.createHash("sha256").update(expected, "utf8").digest();
    const digestsMatch = crypto.timingSafeEqual(hashProvided, hashExpected);
    return digestsMatch && Buffer.byteLength(provided, "utf8") === Buffer.byteLength(expected, "utf8");
}

export async function verifyCustomerInboundAuth(
    reqHeaders = {},
    customerConfig,
    secretResolver = defaultSecretResolver
) {
    if (!customerConfig || !customerConfig.inboundAuth) {
        return true;
    }
    const inboundAuth = customerConfig.inboundAuth;
    if (inboundAuth.enabled === false || inboundAuth.type === "none") {
        return true;
    }

    const resolver = secretResolver || defaultSecretResolver;
    const expectedSecret = inboundAuth.secretRef
        ? await resolver.resolve(inboundAuth.secretRef)
        : (inboundAuth.apiKey || inboundAuth.token);

    if (!expectedSecret) {
        return true;
    }

    let candidate = "";
    if (typeof inboundAuth.headerName === "string" && inboundAuth.headerName.trim()) {
        candidate = getHeaderCaseInsensitive(reqHeaders, inboundAuth.headerName.trim()).trim();
    }
    if (!candidate) {
        candidate = getHeaderCaseInsensitive(reqHeaders, "X-Customer-Key").trim();
    }
    if (!candidate) {
        const authHeader = getHeaderCaseInsensitive(reqHeaders, "Authorization").trim();
        const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
        if (bearerMatch) {
            candidate = bearerMatch[1].trim();
        }
    }

    if (!candidate) {
        throw httpError(401, "Missing customer authentication credentials.");
    }
    if (!constantTimeEquals(candidate, expectedSecret)) {
        throw httpError(401, "Invalid customer authentication credentials.");
    }
    return true;
}
