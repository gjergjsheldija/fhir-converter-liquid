import {readFile} from "fs/promises";
import path from "path";

export const SEGMENT_LIST_RELATIVE_PATH = "structures/segments.txt";

// Parses the text of structures/segments.txt: one segment id per line, trimmed;
// blank lines and lines starting with '#' are ignored.
export function parseSegmentList(text) {
    return String(text || "")
        .split(/\r\n|\r|\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"));
}

// Returns the project's declared segment ids, or null when the file is missing (check off).
export async function loadDeclaredSegments(projectRoot) {
    let text;
    try {
        text = await readFile(path.join(projectRoot, ...SEGMENT_LIST_RELATIVE_PATH.split("/")), "utf8");
    } catch (err) {
        return null;
    }
    return parseSegmentList(text);
}

// Segment ids of a raw HL7 v2 message, in message order (duplicates kept).
export function segmentIdsFromMessage(rawMessage) {
    let raw = String(rawMessage || "");
    if (raw.charCodeAt(0) === 0xFEFF) {
        raw = raw.slice(1);
    }
    const lines = raw.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
    if (lines.length === 0) {
        return [];
    }
    const fieldSeparator = lines[0][3] || "|";
    return lines.map((line) => line.split(fieldSeparator)[0]);
}

// Distinct segment ids from the message that are not allowed, in message order.
// MSH is never reported. Comparison is case-sensitive.
export function undeclaredSegments(messageSegments, allowed) {
    const allowedSet = allowed instanceof Set ? allowed : new Set(allowed || []);
    const reported = [];
    for (const id of messageSegments || []) {
        if (id !== "MSH" && !allowedSet.has(id) && !reported.includes(id)) {
            reported.push(id);
        }
    }
    return reported;
}
