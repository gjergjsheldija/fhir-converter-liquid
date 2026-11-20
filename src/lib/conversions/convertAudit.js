import {createHash, timingSafeEqual} from "crypto";
import {dirname, join} from "path";
import {fileURLToPath} from "url";
import {MAX_LOG_BYTES, appendJsonlLineSync, createAsyncJsonlQueue} from "./jsonlLog.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const AUDIT_FILE = join(__dirname, "../../../data/conversion-audit.jsonl");
export {MAX_LOG_BYTES};

const appendAuditLineAsync = createAsyncJsonlQueue();

function digest(value) {
    return createHash("sha256").update(String(value)).digest();
}

// True when no key is configured, or when the header is exactly `Bearer <key>`.
export function authorizeConvert(envValue, headerValue) {
    if (envValue === undefined || envValue === null || envValue === "") {
        return true;
    }
    if (typeof headerValue !== "string") {
        return false;
    }
    return timingSafeEqual(digest(headerValue), digest("Bearer " + envValue));
}

// One JSON line. `entry` has no body property; the caller derives `controlId` (MSH-10) from the message.
export function auditLine(entry) {
    const input = entry || {};
    return JSON.stringify({
        at: new Date().toISOString(),
        status: Number.isInteger(input.status) ? input.status : 0,
        template: typeof input.template === "string" ? input.template : "",
        controlId: typeof input.controlId === "string" ? input.controlId : ""
    });
}

export function appendAudit(entry, file = AUDIT_FILE, options) {
    return appendJsonlLineSync(file, auditLine(entry), options);
}

export async function appendAuditAsync(entry, file = AUDIT_FILE, options) {
    return appendAuditLineAsync(file, auditLine(entry), options);
}
