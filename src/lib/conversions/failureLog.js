import {appendFileSync, existsSync, mkdirSync, readFileSync} from "fs";
import {dirname, join} from "path";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FAILURE_LOG_FILE = join(__dirname, "../../../data/conversion-failures.jsonl");
export const MAX_MESSAGE_LENGTH = 500;
export const MAX_LIST = 50;

// MSH-10 of an HL7 v2 message, or "" when the first segment is not MSH or field 10 is missing.
export function controlIdOf(raw) {
    if (typeof raw !== "string") {
        return "";
    }
    const first = raw.replace(/^\uFEFF/, "").split(/\r\n|\r|\n/)[0];
    if (first.slice(0, 3) !== "MSH" || first.length < 4) {
        return "";
    }
    const fields = first.split(first[3]);
    return typeof fields[9] === "string" ? fields[9] : "";
}

// Appends one row. `entry.raw` is only read to find MSH-10; it is never written.
export function appendFailure(entry, file = FAILURE_LOG_FILE) {
    const input = entry || {};
    const row = {
        at: new Date().toISOString(),
        template: typeof input.template === "string" ? input.template : "",
        message: String(input.message === undefined || input.message === null ? "" : input.message).slice(0, MAX_MESSAGE_LENGTH),
        controlId: controlIdOf(input.raw)
    };
    mkdirSync(dirname(file), {recursive: true});
    appendFileSync(file, JSON.stringify(row) + "\n");
    return row;
}

// Last `limit` rows (at most 50), newest last. A missing file is an empty list.
export function listFailures(limit = MAX_LIST, file = FAILURE_LOG_FILE) {
    if (!existsSync(file)) {
        return [];
    }
    const n = Math.min(Math.max(Math.floor(Number(limit)) || 0, 0), MAX_LIST);
    if (n === 0) {
        return [];
    }
    const rows = [];
    for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) {
            continue;
        }
        try {
            rows.push(JSON.parse(line));
        } catch (err) {
            // skip a damaged line
        }
    }
    return rows.slice(-n);
}
