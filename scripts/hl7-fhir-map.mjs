#!/usr/bin/env node
// Read the HL7v2 Liquid templates and write field mappings:
//   MSH.7 -> Bundle.timestamp
//
// Both sides of a condition are listed. Generated resource ids are left out.
// Usage:
//   node scripts/hl7-fhir-map.mjs ADT_A47
//   node scripts/hl7-fhir-map.mjs --all

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { deflateRawSync, crc32 } from "node:zlib";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const templateRoot = path.join(repoRoot, "src/templates/Hl7v2");
const outRoot = path.join(repoRoot, "docs/mappings");

const fileText = new Map();

function templateFile(root, name) {
    if (typeof name !== "string" || !name || name.includes("..")) return null;
    const parts = name.split("/").filter(Boolean);
    if (!parts.length || parts.some((part) => part === "." || part === "..")) return null;
    const base = parts.pop();
    const rootReal = path.resolve(root);
    const candidates = [
        path.resolve(rootReal, ...parts, `_${base}.liquid`),
        path.resolve(rootReal, ...parts, `${base}.liquid`)
    ];
    for (const file of candidates) {
        if (file !== rootReal && !file.startsWith(rootReal + path.sep)) continue;
        if (fileText.has(file)) return file;
        try {
            fileText.set(file, readFileSync(file, "utf8"));
            return file;
        } catch {
            // The partial may use the other file name.
        }
    }
    return null;
}

function load(root, name) {
    const file = templateFile(root, name);
    if (!file) return null;
    return fileText.get(file);
}

function stripComments(src) {
    return src.replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");
}

function tokenize(src) {
    const tokens = [];
    const re = /\{%-?[\s\S]*?-?%\}|\{\{[\s\S]*?\}\}/g;
    let last = 0;
    let match;
    while ((match = re.exec(src))) {
        if (match.index > last) tokens.push({ kind: "text", value: src.slice(last, match.index) });
        const raw = match[0];
        if (raw.startsWith("{{")) tokens.push({ kind: "out", value: raw.slice(2, -2).trim() });
        else tokens.push({ kind: "tag", value: raw.replace(/^\{%-?\s*/, "").replace(/\s*-?%\}$/, "").trim() });
        last = match.index + raw.length;
    }
    if (last < src.length) tokens.push({ kind: "text", value: src.slice(last) });
    return tokens;
}

const tokenCache = new Map();
function tokensFor(root, name) {
    const key = `${path.resolve(root)}\0${name}`;
    if (tokenCache.has(key)) return tokenCache.get(key);
    const src = load(root, name);
    const tokens = src ? tokenize(stripComments(src)) : null;
    tokenCache.set(key, tokens);
    return tokens;
}

function splitChain(expr) {
    return expr.replace(/\[[^\]]*\]/g, "").split(".").filter(Boolean);
}

function joinPath(base, parts) {
    const nums = parts.filter((part) => /^\d+$/.test(part));
    return nums.length ? `${base}.${nums.join(".")}` : base;
}

function lookup(scope, name) {
    let current = scope;
    while (current) {
        if (current.map.has(name)) return current.map.get(name);
        current = current.parent;
    }
    return null;
}

function childScope(parent) {
    return { map: new Map(), parent };
}

function bindResolved(resolved) {
    if (!resolved) return null;
    if (Array.isArray(resolved)) return { type: "alias", fields: resolved };
    return { type: "segment", path: resolved };
}

function resolveChain(chain, scope) {
    if (!chain.length) return null;
    const binding = lookup(scope, chain[0]);
    if (!binding) return null;
    const rest = chain.slice(1).filter((part) => part !== "Value" && part !== "Repeats");
    if (binding.type === "alias" || binding.type === "ref") return binding.fields;
    if (binding.type === "segment") return joinPath(binding.path, rest);
    if (binding.type === "bag" || binding.type === "lists") {
        const segment = rest[0];
        if (!segment || !binding.segments.includes(segment)) return null;
        return joinPath(segment, rest.slice(1));
    }
    return null;
}

function bindExpr(expr, scope) {
    const trimmed = expr.trim().replace(/\|[\s\S]*$/, "").trim();
    if (!trimmed || trimmed.startsWith("'") || trimmed.startsWith("\"")) return null;
    const chain = splitChain(trimmed);
    return bindResolved(resolveChain(chain, scope));
}

function fieldsIn(expr, scope) {
    const left = expr.split("|")[0].replace(/'[^']*'|"[^"]*"/g, " ");
    const found = [];
    const re = /[A-Za-z_][\w]*(?:\.[A-Za-z0-9_]+)*/g;
    for (const match of left.matchAll(re)) {
        const resolved = resolveChain(splitChain(match[0]), scope);
        if (Array.isArray(resolved)) found.push(...resolved);
        else if (resolved) found.push(resolved);
    }
    return found;
}

function applyAssign(tag, scope) {
    const match = tag.match(/^assign\s+([A-Za-z_]\w*)\s*=\s*([\s\S]+)$/);
    if (!match) return;
    const [, name, expr] = match;
    const first = expr.match(/get_first_segments:\s*'([^']+)'/);
    if (first) {
        scope.map.set(name, { type: "bag", segments: first[1].split("|") });
        return;
    }
    const lists = expr.match(/get_segment_lists:\s*'([^']+)'/);
    if (lists) {
        scope.map.set(name, { type: "lists", segments: lists[1].split("|") });
        return;
    }
    const related = expr.match(/get_related_segment_list:\s*[^,]+,\s*'([^']+)'/);
    if (related) {
        scope.map.set(name, { type: "lists", segments: [related[1]] });
        return;
    }
    const parent = expr.match(/get_parent_segment:\s*'([^']+)'/);
    if (parent) {
        scope.map.set(name, { type: "segment", path: parent[1] });
        return;
    }
    const bound = bindExpr(expr, scope);
    if (bound) scope.map.set(name, bound.type === "segment" ? bound : { type: "alias", fields: bound.fields });
    else {
        const fields = fieldsIn(expr, scope);
        if (fields.length) scope.map.set(name, { type: "alias", fields });
    }
}

function applyFor(tag, scope) {
    const match = tag.match(/^for\s+([A-Za-z_]\w*)\s+in\s+([^\s%]+)/);
    if (!match) return;
    const bound = bindExpr(match[2], scope);
    if (bound?.type === "segment") scope.map.set(match[1], bound);
}

function applyEvaluate(tag, scope) {
    const match = tag.match(/^evaluate\s+([A-Za-z_]\w*)\s+using\s+'([^']+)'\s*([\s\S]*)$/);
    if (!match) return;
    const fields = [];
    const args = match[3];
    const re = /([A-Za-z_]\w*)\s*:\s*([^,]+)/g;
    let arg;
    while ((arg = re.exec(args))) {
        const bound = bindExpr(arg[2], scope);
        if (bound?.type === "segment") fields.push(bound.path);
        else if (bound?.type === "alias") fields.push(...bound.fields);
    }
    scope.map.set(match[1], { type: "ref", fields });
}

function parseInclude(tag) {
    const match = tag.match(/^include\s+'([^']+)'\s*,?\s*([\s\S]*)$/);
    if (!match) return null;
    const args = [];
    const re = /([A-Za-z_]\w*)\s*:\s*([^,]+)/g;
    let arg;
    while ((arg = re.exec(match[2]))) args.push([arg[1], arg[2].trim()]);
    return { name: match[1], args };
}

function createState() {
    return {
        stack: [],
        pendingKey: null,
        expectKey: false,
        inString: false,
        escape: false,
        stringBuf: "",
        readingKey: false
    };
}

function fhirPath(state) {
    if (!state.pendingKey) return null;
    if (state.pendingKey === "resourceType" || state.pendingKey === "id" || state.pendingKey === "fullUrl") return null;
    if (state.pendingKey === "div" || state.pendingKey === "status") return null;
    let type = null;
    const parts = [];
    for (const frame of state.stack) {
        if (frame.key === "request") return null;
        if (frame.resourceType) {
            type = frame.resourceType;
            parts.length = 0;
            continue;
        }
        if (type && frame.key) parts.push(frame.key);
    }
    if (!type || parts.includes("text") || parts.includes("div")) return null;
    parts.push(state.pendingKey);
    return `${type}.${parts.join(".")}`;
}

function consumeText(text, state) {
    for (const char of text) {
        if (state.inString) {
            if (state.escape) {
                state.escape = false;
                state.stringBuf += char;
                continue;
            }
            if (char === "\\") {
                state.escape = true;
                continue;
            }
            if (char === "\"") {
                if (state.readingKey) state.pendingKey = state.stringBuf;
                else if (state.pendingKey === "resourceType" && state.stack.length) {
                    state.stack.at(-1).resourceType = state.stringBuf;
                    state.pendingKey = null;
                }
                state.inString = false;
                state.readingKey = false;
                state.stringBuf = "";
            } else state.stringBuf += char;
            continue;
        }
        if (char === "\"") {
            state.inString = true;
            state.readingKey = state.expectKey;
            state.stringBuf = "";
            state.expectKey = false;
            continue;
        }
        if (char === "{") {
            state.stack.push({ key: state.pendingKey, resourceType: null, array: false });
            state.pendingKey = null;
            state.expectKey = true;
            continue;
        }
        if (char === "}") {
            state.stack.pop();
            state.pendingKey = null;
            state.expectKey = false;
            continue;
        }
        if (char === "[") {
            state.stack.push({ key: state.pendingKey, resourceType: null, array: true });
            state.pendingKey = null;
            state.expectKey = false;
            continue;
        }
        if (char === "]") {
            state.stack.pop();
            state.pendingKey = null;
            continue;
        }
        if (char === ",") {
            const frame = state.stack.at(-1);
            state.pendingKey = null;
            state.expectKey = Boolean(frame && !frame.array);
        }
    }
}

const HL7_FIELD = /^[A-Z][A-Z0-9]{1,3}(?:\.\d+)+$/;

function walk(name, scope, state, rows, seen, trail, root) {
    if (trail.includes(name) || trail.length > 25) return;
    const tokens = tokensFor(root, name);
    if (!tokens) return;
    const nextTrail = trail.concat(name);
    let capturing = null;
    let captured = [];
    for (const token of tokens) {
        if (token.kind === "text") {
            if (!capturing) consumeText(token.value, state);
            continue;
        }
        if (token.kind === "out") {
            const fields = fieldsIn(token.value, scope).filter((field) => HL7_FIELD.test(field));
            if (capturing) {
                captured.push(...fields);
                continue;
            }
            const fhir = fhirPath(state);
            if (!fhir) continue;
            for (const field of fields) {
                const line = `${field} -> ${fhir}`;
                if (seen.has(line)) continue;
                seen.add(line);
                rows.push({ field, fhir, resource: fhir.split(".")[0] });
            }
            continue;
        }
        const tag = token.value;
        if (tag.startsWith("capture ")) {
            capturing = tag.match(/^capture\s+([A-Za-z_]\w*)/)?.[1] ?? null;
            captured = [];
            continue;
        }
        if (tag.startsWith("endcapture")) {
            if (capturing) scope.map.set(capturing, { type: "alias", fields: captured });
            capturing = null;
            captured = [];
            continue;
        }
        if (capturing) continue;
        if (tag.startsWith("assign ")) applyAssign(tag, scope);
        else if (tag.startsWith("for ")) {
            const loopScope = childScope(scope);
            applyFor(tag, loopScope);
            scope = loopScope;
        } else if (tag === "endfor" || tag.startsWith("endfor")) {
            if (scope.parent) scope = scope.parent;
        } else if (tag.startsWith("evaluate ")) applyEvaluate(tag, scope);
        else if (tag.startsWith("include ")) {
            const include = parseInclude(tag);
            if (!include || include.name.startsWith("ID/") || include.name.startsWith("CodeSystem/")) continue;
            const included = childScope(null);
            for (const [key, value] of include.args) {
                const bound = bindExpr(value, scope);
                if (bound) included.map.set(key, bound);
            }
            walk(include.name, included, state, rows, seen, nextTrail, root);
        }
    }
}

const SEGMENT_ORDER = ["MSH", "SFT", "UAC", "EVN", "PID", "PD1", "NK1", "PV1", "PV2", "MRG", "IN1", "OBR", "OBX"];

function segmentRank(name) {
    const index = SEGMENT_ORDER.indexOf(name);
    return index === -1 ? SEGMENT_ORDER.length : index;
}

function hl7Sort(left, right) {
    const a = left.field.split(".");
    const b = right.field.split(".");
    const rank = segmentRank(a[0]) - segmentRank(b[0]);
    if (rank) return rank;
    if (a[0] !== b[0]) return a[0].localeCompare(b[0]);
    const count = Math.max(a.length, b.length);
    for (let i = 1; i < count; i += 1) {
        const diff = Number(a[i] ?? 0) - Number(b[i] ?? 0);
        if (diff) return diff;
    }
    return left.fhir.localeCompare(right.fhir);
}

function render(message, rows) {
    const order = [];
    const groups = new Map();
    for (const row of rows) {
        if (!groups.has(row.resource)) {
            groups.set(row.resource, []);
            order.push(row.resource);
        }
        groups.get(row.resource).push(row);
    }
    const lines = [
        `# ${message.replaceAll("_", " ")}`,
        "",
        "Each line is an HL7v2 field read by this message's Liquid templates, and the FHIR element it feeds.",
        "A condition lists both branches. A generated resource id is left out.",
        ""
    ];
    for (const resource of order) {
        lines.push(`## ${resource}`, "");
        for (const row of groups.get(resource).sort(hl7Sort)) {
            lines.push(`${row.field} -> ${row.fhir}`);
        }
        lines.push("");
    }
    return `${lines.join("\n").trim()}\n`;
}

function mapMessage(message, dir = templateRoot) {
    const rows = [];
    walk(message, childScope(null), createState(), rows, new Set(), [], dir);
    return rows;
}

function rootMessages(dir = templateRoot) {
    return readdirSync(dir)
        .filter((name) => name.endsWith(".liquid") && !name.startsWith("_"))
        .map((name) => name.replace(/\.liquid$/, ""))
        .sort();
}

function splitMessageName(name) {
    const match = name.match(/^([A-Za-z][A-Za-z0-9]*?)_([A-Za-z][A-Za-z0-9]*)$/);
    if (!match) return { type: "Other", event: name };
    return { type: match[1], event: match[2] };
}

function eventSort(left, right) {
    const a = left.match(/^([A-Za-z]*)(\d*)$/) || [left, left, ""];
    const b = right.match(/^([A-Za-z]*)(\d*)$/) || [right, right, ""];
    if (a[1] !== b[1]) return a[1].localeCompare(b[1]);
    return Number(a[2] || 0) - Number(b[2] || 0);
}

function hl7Label(field) {
    const parts = field.split(".");
    return `${parts[0]}-${parts.slice(1).join(".")}`;
}

function tableRows(rows) {
    const sorted = rows.slice().sort(hl7Sort);
    const sortByField = new Map();
    let order = 0;
    return sorted.map((row) => {
        const id = hl7Label(row.field);
        if (!sortByField.has(id)) {
            order += 1;
            sortByField.set(id, order);
        }
        return { sort: sortByField.get(id), id, fhir: row.fhir };
    });
}

function collectFieldMaps(dir) {
    const messages = rootMessages(dir);
    if (!messages.length) return [];
    const byType = new Map();
    for (const message of messages) {
        const split = splitMessageName(message);
        if (!byType.has(split.type)) byType.set(split.type, []);
        byType.get(split.type).push({
            message,
            type: split.type,
            event: split.event,
            rows: tableRows(mapMessage(message, dir))
        });
    }
    const collected = [];
    for (const type of [...byType.keys()].sort((a, b) => a.localeCompare(b))) {
        const events = byType.get(type).sort((a, b) => eventSort(a.event, b.event));
        collected.push(...events);
    }
    return collected;
}

const MAP_NOTE = "One table per message. Each row is an HL7v2 field the Liquid template reads and the FHIR element it feeds. Both sides of a condition are listed. A generated resource id is left out.";

function asMaps(dirOrMaps) {
    return Array.isArray(dirOrMaps) ? dirOrMaps : collectFieldMaps(dirOrMaps);
}

export function renderFieldMap(dir) {
    const messages = asMaps(dir);
    if (!messages.length) return "";
    const lines = [MAP_NOTE, ""];
    let currentType = "";
    for (const item of messages) {
        if (item.type !== currentType) {
            currentType = item.type;
            lines.push(`# ${item.type}`, "");
        }
        const title = item.type === "Other" ? item.event : `${item.type} ${item.event}`;
        lines.push(`## ${title}`, "");
        if (!item.rows.length) {
            lines.push("No fields are read.", "");
            continue;
        }
        lines.push("| Sort | HL7 field | FHIR element |", "| --- | --- | --- |");
        for (const row of item.rows) {
            lines.push(`| ${row.sort} | ${row.id} | ${row.fhir} |`);
        }
        lines.push("");
    }
    return `${lines.join("\n").trim()}\n`;
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (ch) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;"
    })[ch]);
}

export function renderFieldMapHtml(dir) {
    const messages = asMaps(dir);
    if (!messages.length) return "";
    const sections = [];
    let currentType = "";
    for (const item of messages) {
        if (item.type !== currentType) {
            currentType = item.type;
            sections.push(`<h1>${escapeHtml(item.type)}</h1>`);
        }
        const title = item.type === "Other" ? item.event : `${item.type}_${item.event}`;
        const body = item.rows.length
            ? `<table>
<thead><tr><th>Sort</th><th>HL7 field</th><th>FHIR element</th></tr></thead>
<tbody>
${item.rows.map((row) => `<tr><td>${row.sort}</td><td>${escapeHtml(row.id)}</td><td>${escapeHtml(row.fhir)}</td></tr>`).join("\n")}
</tbody>
</table>`
            : "<p>No fields are read.</p>";
        sections.push(`<h2>${escapeHtml(title)}</h2>`, body);
    }
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>HL7v2 to FHIR field maps</title>
<style>
body { font-family: "Source Sans 3", "Segoe UI", sans-serif; margin: 2rem auto; max-width: 960px; color: #1c1917; line-height: 1.4; }
table { border-collapse: collapse; width: 100%; margin: 0 0 2rem; font-size: 14px; }
th, td { border: 1px solid #e7e5e4; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #f5f5f4; }
h1 { margin: 2.2rem 0 0.4rem; font-size: 1.6rem; }
h2 { margin: 1.4rem 0 0.6rem; font-size: 1.15rem; }
p.note { color: #57534e; }
</style>
</head>
<body>
<p class="note">${escapeHtml(MAP_NOTE)}</p>
${sections.join("\n")}
</body>
</html>
`;
}

function conceptMapFor(item) {
    const slug = item.message.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const elements = new Map();
    for (const row of item.rows) {
        if (!elements.has(row.id)) elements.set(row.id, []);
        const targets = elements.get(row.id);
        if (!targets.some((target) => target.code === row.fhir)) {
            targets.push({
                code: row.fhir,
                display: row.fhir,
                equivalence: "equivalent"
            });
        }
    }
    const title = item.type === "Other" ? item.event : `${item.type}_${item.event}`;
    return {
        resourceType: "ConceptMap",
        id: `message-${slug}-to-bundle`,
        url: `urn:fhir-converter-liquid:ConceptMap:message-${slug}-to-bundle`,
        name: `Message${title.replace(/[^A-Za-z0-9]/g, "")}ToBundle`,
        title: `Message ${title} to Bundle Map`,
        status: "draft",
        experimental: true,
        description: `Field mappings read from the ${item.message} Liquid template.`,
        group: [
            {
                source: "urn:fhir-converter-liquid:CodeSystem/hl7v2-field",
                target: "http://hl7.org/fhir/R4",
                element: [...elements.entries()].map(([code, target]) => ({
                    code,
                    display: code,
                    target
                }))
            }
        ]
    };
}

export function renderFieldMapConceptMaps(dir) {
    const messages = asMaps(dir);
    if (!messages.length) return "";
    return `${JSON.stringify({
        resourceType: "Bundle",
        type: "collection",
        timestamp: new Date().toISOString(),
        entry: messages.map((item) => ({ resource: conceptMapFor(item) }))
    }, null, 2)}\n`;
}

function zipFiles(files) {
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const file of files) {
        const data = Buffer.from(file.data);
        const name = Buffer.from(file.name);
        const compressed = deflateRawSync(data);
        const crc = crc32(data) >>> 0;
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(8, 8);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(compressed.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        const localRecord = Buffer.concat([local, name, compressed]);
        locals.push(localRecord);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(8, 10);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(compressed.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(Buffer.concat([central, name]));
        offset += localRecord.length;
    }
    const centralDir = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(centralDir.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, centralDir, end]);
}

export function fieldMapFiles(dir) {
    const messages = collectFieldMaps(dir);
    if (!messages.length) return null;
    return {
        markdown: renderFieldMap(messages),
        html: renderFieldMapHtml(messages),
        conceptMap: renderFieldMapConceptMaps(messages)
    };
}

export function fieldMapArchive(dir) {
    const files = fieldMapFiles(dir);
    if (!files) return null;
    return zipFiles([
        { name: "hl7v2-field-map.md", data: files.markdown },
        { name: "hl7v2-field-map.html", data: files.html },
        { name: "hl7v2-field-map.conceptmap.json", data: files.conceptMap }
    ]);
}

function writeAll() {
    mkdirSync(outRoot, { recursive: true });
    const messages = rootMessages();
    const index = ["# HL7v2 field mappings", "", "Generated from `src/templates/Hl7v2`. Run `node scripts/hl7-fhir-map.mjs --all` to refresh.", ""];
    for (const message of messages) {
        const rows = mapMessage(message);
        writeFileSync(path.join(outRoot, `${message}.md`), render(message, rows));
        index.push(`- [${message.replaceAll("_", " ")}](${message}.md) (${rows.length})`);
    }
    index.push("");
    writeFileSync(path.join(outRoot, "README.md"), index.join("\n"));
    return messages.length;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirect) {
    const arg = process.argv[2];
    if (arg === "--all") {
        const count = writeAll();
        console.log(`Wrote ${count} mappings to ${path.relative(repoRoot, outRoot)}`);
    } else if (arg) {
        const rows = mapMessage(arg);
        process.stdout.write(render(arg, rows));
    } else {
        console.error("Usage: node scripts/hl7-fhir-map.mjs ADT_A47 | --all");
        process.exit(1);
    }
}
