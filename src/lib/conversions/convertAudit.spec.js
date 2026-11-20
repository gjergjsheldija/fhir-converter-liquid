import assert from "assert";
import {mkdtempSync, readFileSync, rmSync} from "fs";
import {tmpdir} from "os";
import {join} from "path";
import {appendAudit, auditLine, authorizeConvert} from "./convertAudit.js";
import {controlIdOf} from "./failureLog.js";

const RAW = "MSH|^~\\&|APP|FAC|APP2|FAC2|20260101||ADT^A01|CTRL-123|P|2.5\rPID|1||SECRET-MRN||DOE^JANE\r";

describe("convert API key and audit line", function () {
    describe("authorizeConvert", function () {
        it("allows everything when the key is empty", function () {
            assert.strictEqual(authorizeConvert("", undefined), true);
            assert.strictEqual(authorizeConvert(undefined, undefined), true);
            assert.strictEqual(authorizeConvert("", "Bearer anything"), true);
        });

        it("allows the exact Bearer token", function () {
            assert.strictEqual(authorizeConvert("k1", "Bearer k1"), true);
        });

        it("rejects a missing, wrong, or differently shaped header", function () {
            assert.strictEqual(authorizeConvert("k1", undefined), false);
            assert.strictEqual(authorizeConvert("k1", ""), false);
            assert.strictEqual(authorizeConvert("k1", "Bearer k2"), false);
            assert.strictEqual(authorizeConvert("k1", "k1"), false);
            assert.strictEqual(authorizeConvert("k1", "bearer k1"), false);
            assert.strictEqual(authorizeConvert("k1", "Bearer k1 "), false);
        });
    });

    describe("auditLine", function () {
        it("has time, status, template and MSH-10 and no message text", function () {
            const line = auditLine({status: 200, template: "ADT_A01.liquid", controlId: controlIdOf(RAW)});
            assert.ok(!line.includes("\n"));
            const row = JSON.parse(line);
            assert.deepStrictEqual(Object.keys(row).sort(), ["at", "controlId", "status", "template"]);
            assert.strictEqual(row.status, 200);
            assert.strictEqual(row.template, "ADT_A01.liquid");
            assert.strictEqual(row.controlId, "CTRL-123");
            assert.ok(!Number.isNaN(Date.parse(row.at)));
            assert.ok(!line.includes("SECRET-MRN"));
            assert.ok(!line.includes("DOE"));
        });

        it("ignores a body property if one is passed", function () {
            const line = auditLine({status: 400, template: "", controlId: "", raw: RAW, srcData: RAW, body: RAW, key: "k1"});
            assert.ok(!line.includes("SECRET-MRN"));
            assert.ok(!line.includes("k1"));
            assert.deepStrictEqual(Object.keys(JSON.parse(line)).sort(), ["at", "controlId", "status", "template"]);
        });

        it("writes a 401 with an empty controlId", function () {
            const row = JSON.parse(auditLine({status: 401}));
            assert.strictEqual(row.status, 401);
            assert.strictEqual(row.controlId, "");
            assert.strictEqual(row.template, "");
        });
    });

    describe("appendAudit", function () {
        let dir;

        beforeEach(function () {
            dir = mkdtempSync(join(tmpdir(), "convert-audit-"));
        });

        afterEach(function () {
            rmSync(dir, {recursive: true, force: true});
        });

        it("appends one line per attempt and creates the folder", function () {
            const file = join(dir, "nested", "conversion-audit.jsonl");
            appendAudit({status: 200, template: "a", controlId: "C1"}, file);
            appendAudit({status: 401}, file);
            const lines = readFileSync(file, "utf8").split("\n").filter(Boolean);
            assert.strictEqual(lines.length, 2);
            assert.strictEqual(JSON.parse(lines[0]).controlId, "C1");
            assert.strictEqual(JSON.parse(lines[1]).status, 401);
        });
    });
});
