import assert from "assert";
import {mkdir, mkdtemp, rm, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {
    loadDeclaredSegments,
    parseSegmentList,
    segmentIdsFromMessage,
    undeclaredSegments
} from "./declaredSegments.js";

describe("hl7v2/declaredSegments", function () {
    it("reports segment ids that are not on the allow list", function () {
        assert.deepStrictEqual(undeclaredSegments(["MSH", "PID", "ZDG"], new Set(["PID", "PV1"])), ["ZDG"]);
    });

    it("never reports MSH, reports distinct ids in message order, and is case-sensitive", function () {
        assert.deepStrictEqual(
            undeclaredSegments(["MSH", "ZZZ", "pid", "ZDG", "ZZZ", "PID"], ["PID"]),
            ["ZZZ", "pid", "ZDG"]
        );
    });

    it("parses the list file: trims, skips blanks and # comments", function () {
        assert.deepStrictEqual(parseSegmentList("# header\n PID \n\r\nPV1\r\n  # note\nEVN"), ["PID", "PV1", "EVN"]);
    });

    it("reads segment ids from a raw message", function () {
        const raw = "MSH|^~\\&|A|B|C|D|2020||ADT^A04|1|P|2.5\rPID|1||x\nZDG|1\r\n";
        assert.deepStrictEqual(segmentIdsFromMessage(raw), ["MSH", "PID", "ZDG"]);
    });

    describe("loadDeclaredSegments", function () {
        let root;
        before(async function () {
            root = await mkdtemp(path.join(os.tmpdir(), "fhir-declared-seg-"));
        });
        after(async function () {
            await rm(root, {recursive: true, force: true});
        });

        it("returns null when structures/segments.txt is missing", async function () {
            assert.strictEqual(await loadDeclaredSegments(root), null);
        });

        it("returns the listed ids when the file exists", async function () {
            await mkdir(path.join(root, "structures"), {recursive: true});
            await writeFile(path.join(root, "structures", "segments.txt"), "PID\n# x\nPV1\n");
            assert.deepStrictEqual(await loadDeclaredSegments(root), ["PID", "PV1"]);
        });
    });
});
