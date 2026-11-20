import assert from "assert";
import {existsSync, mkdtempSync, readFileSync, rmSync} from "fs";
import {tmpdir} from "os";
import {join} from "path";
import {MAX_LOG_BYTES, appendFailure, appendFailureAsync, controlIdOf, listFailures} from "./failureLog.js";

const RAW = "MSH|^~\\&|APP|FAC|APP2|FAC2|20260101||ADT^A01|CTRL-123|P|2.5\rPID|1||SECRET-MRN||DOE^JANE\r";

describe("failure log", function () {
    let dir;
    let file;

    beforeEach(function () {
        dir = mkdtempSync(join(tmpdir(), "failure-log-"));
        file = join(dir, "nested", "conversion-failures.jsonl");
    });

    afterEach(function () {
        rmSync(dir, {recursive: true, force: true});
    });

    it("lists nothing when the file is missing", function () {
        assert.deepStrictEqual(listFailures(50, file), []);
    });

    it("writes MSH-10 and never the raw message", function () {
        appendFailure({template: "ADT_A01.liquid", message: "boom", raw: RAW}, file);
        const text = readFileSync(file, "utf8");
        assert.ok(!text.includes("SECRET-MRN"));
        assert.ok(!text.includes("DOE"));
        const [row] = listFailures(50, file);
        assert.deepStrictEqual(Object.keys(row).sort(), ["at", "controlId", "message", "template"]);
        assert.strictEqual(row.controlId, "CTRL-123");
        assert.strictEqual(row.template, "ADT_A01.liquid");
        assert.strictEqual(row.message, "boom");
        assert.ok(!Number.isNaN(Date.parse(row.at)));
    });

    it("keeps a second failure as the second row", function () {
        appendFailure({template: "a", message: "first", raw: RAW}, file);
        appendFailure({template: "", message: "second", raw: "not hl7"}, file);
        const rows = listFailures(50, file);
        assert.deepStrictEqual(rows.map((r) => r.message), ["first", "second"]);
        assert.strictEqual(rows[1].controlId, "");
        assert.strictEqual(rows[1].template, "");
        assert.deepStrictEqual(listFailures(1, file).map((r) => r.message), ["second"]);
    });

    it("truncates the message to 500 characters and caps the list at 50", function () {
        for (let i = 0; i < 55; i++) {
            appendFailure({message: i === 54 ? "x".repeat(900) : "m" + i}, file);
        }
        const rows = listFailures(500, file);
        assert.strictEqual(rows.length, 50);
        assert.strictEqual(rows[49].message.length, 500);
    });

    it("finds MSH-10 only when the first segment is MSH and field 10 exists", function () {
        assert.strictEqual(controlIdOf("PID|1\rMSH|^~\\&|A|B|C|D|E||F|ID|P"), "");
        assert.strictEqual(controlIdOf("MSH|^~\\&|A|B|C|D|E||F"), "");
        assert.strictEqual(controlIdOf("MSH|^~\\&|A|B|C|D|E||F|ID9\n"), "ID9");
        assert.strictEqual(controlIdOf(undefined), "");
    });

    it("rotates to .1 when file size reaches maxBytes and overwrites previous .1", function () {
        assert.strictEqual(MAX_LOG_BYTES, 5 * 1024 * 1024);
        appendFailure({template: "ADT_A01", message: "first failure", raw: RAW}, file, {maxBytes: 150});
        appendFailure({template: "ADT_A02", message: "second failure", raw: RAW}, file, {maxBytes: 150});
        assert.strictEqual(existsSync(file + ".1"), false);

        appendFailure({template: "ADT_A03", message: "third failure", raw: RAW}, file, {maxBytes: 150});
        assert.strictEqual(existsSync(file + ".1"), true);
        const rotatedFirst = readFileSync(file + ".1", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).message);
        const activeFirst = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).message);
        assert.deepStrictEqual(rotatedFirst, ["first failure", "second failure"]);
        assert.deepStrictEqual(activeFirst, ["third failure"]);

        appendFailure({template: "ADT_A04", message: "fourth failure", raw: RAW}, file, {maxBytes: 150});
        appendFailure({template: "ADT_A05", message: "fifth failure", raw: RAW}, file, {maxBytes: 150});
        const rotatedSecond = readFileSync(file + ".1", "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).message);
        const activeSecond = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).message);
        assert.deepStrictEqual(rotatedSecond, ["third failure", "fourth failure"]);
        assert.deepStrictEqual(activeSecond, ["fifth failure"]);
    });

    it("serializes concurrent appendFailureAsync calls with rotation and strips PHI", async function () {
        const asyncFile = join(dir, "async", "conversion-failures.jsonl");
        await Promise.all([
            appendFailureAsync({template: "ADT_A01", message: "err-1", raw: RAW}, asyncFile, {maxBytes: 150}),
            appendFailureAsync({template: "ADT_A02", message: "err-2", raw: RAW}, asyncFile, {maxBytes: 150}),
            appendFailureAsync({template: "ADT_A03", message: "err-3", raw: RAW}, asyncFile, {maxBytes: 150})
        ]);
        assert.strictEqual(existsSync(asyncFile + ".1"), true);
        const combinedText = readFileSync(asyncFile + ".1", "utf8") + readFileSync(asyncFile, "utf8");
        assert.ok(!combinedText.includes("SECRET-MRN"));
        const messages = combinedText.split("\n").filter(Boolean).map((l) => JSON.parse(l).message);
        assert.deepStrictEqual(messages, ["err-1", "err-2", "err-3"]);
    });
});
