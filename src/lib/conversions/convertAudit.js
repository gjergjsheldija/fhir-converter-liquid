import {appendFileSync, mkdirSync, renameSync, statSync} from "fs";
import {appendFile, mkdir, rename, stat} from "fs/promises";
import {createHash, timingSafeEqual} from "crypto";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const AUDIT_FILE = join(__dirname, "../../../data/conversion-audit.jsonl");
export const MAX_LOG_BYTES = 5 * 1024 * 1024;

let auditWriteChain = Promise.resolve();

function resolveMaxBytes(options) {
    if (options && typeof options.maxBytes === "number" && Number.isFinite(options.maxBytes) && options.maxBytes > 0) {
        return options.maxBytes;
    }
    return MAX_LOG_BYTES;
}

function rotateIfNeededSync(file, maxBytes) {
    try {
        const info = statSync(file);
        if (info.size >= maxBytes) {
            renameSync(file, file + ".1");
        }
    } catch (err) {
        if (!err || err.code !== "ENOENT") {
            throw err;
        }
    }
}

async function rotateIfNeededAsync(file, maxBytes) {
    try {
        const info = await stat(file);
        if (info.size >= maxBytes) {
            await rename(file, file + ".1");
        }
    } catch (err) {
        if (!err || err.code !== "ENOENT") {
            throw err;
        }
    }
}

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
    const line = auditLine(entry);
    const maxBytes = resolveMaxBytes(options);
    mkdirSync(dirname(file), {recursive: true});
    rotateIfNeededSync(file, maxBytes);
    appendFileSync(file, line + "\n");
    return line;
}

export async function appendAuditAsync(entry, file = AUDIT_FILE, options) {
    const line = auditLine(entry);
    const maxBytes = resolveMaxBytes(options);
    const task = auditWriteChain.then(async () => {
        await mkdir(dirname(file), {recursive: true});
        await rotateIfNeededAsync(file, maxBytes);
        await appendFile(file, line + "\n");
        return line;
    });
    auditWriteChain = task.catch(() => {});
    return task;
}
