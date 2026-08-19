import assert from "assert";
import {
    getFirstSegments,
    getSegmentLists,
    getRelatedSegmentList,
    getParentSegment,
    hasSegments,
    splitDataBySegments
} from "./segmentFilters.js";
import { parseHL7v2 } from "../../parsers/hl7v2/hl7v2.js";

const sampleMsg = "MSH|^~\\&|A|B|C|D|20230101120000||ADT^A01|1|P|2.3\r\n" +
    "PID|1||111^^^MRN\r\n" +
    "PD1|||\r\n" +
    "PID|2||222^^^MRN\r\n";

describe("segment filters", function () {
    const parsed = parseHL7v2(sampleMsg).v2;

    it("get_first_segments returns the first instance of each requested segment", function () {
        const result = getFirstSegments(parsed, "MSH|PID");
        assert.ok(result.MSH);
        assert.ok(result.PID);
        assert.strictEqual(result.MSH.length, 11);
        assert.ok(result.PID[0]); // First field should exist
    });

    it("get_segment_lists returns every instance of each requested segment", function () {
        const result = getSegmentLists(parsed, "PID");
        assert.strictEqual(result.PID.length, 2);
        assert.ok(result.PID[1]); // Second PID segment
        assert.ok(result.PID[1][0]); // First field of second PID
    });

    it("has_segments returns true only when every requested segment is present", function () {
        assert.strictEqual(hasSegments(parsed, "MSH|PID"), true);
        assert.strictEqual(hasSegments(parsed, "MSH|OBX"), false);
    });

    it("get_related_segment_list returns child segments following a specific parent occurrence", function () {
        // The parent segment must be the exact object reference that appears in msg.data,
        // matched by identity - not a segment name/index pair.
        const parentSegment = parsed.data[1]; // first PID segment
        const result = getRelatedSegmentList(parsed, parentSegment, "PD1");
        assert.ok(Array.isArray(result.PD1));
        assert.strictEqual(result.PD1.length, 1);
    });

    it("get_related_segment_list is case-insensitive on the child segment id", function () {
        const parentSegment = parsed.data[1]; // first PID segment
        const result = getRelatedSegmentList(parsed, parentSegment, "pd1");
        assert.ok(Array.isArray(result.pd1));
        assert.strictEqual(result.pd1.length, 1);
    });

    it("get_parent_segment returns the nearest preceding parent segment", function () {
        const result = getParentSegment(parsed, "PD1", 0, "PID");
        assert.ok(result.PID);
        assert.ok(result.PID[0]); // Should have first field set to "1"
    });

    it("split_data_by_segments splits the message at each occurrence of the given segment", function () {
        const result = splitDataBySegments(parsed, "PID");
        assert.strictEqual(result.length, 3);
        assert.strictEqual(result[0].meta.includes("PID"), false);
        assert.strictEqual(result[1].meta[0], "PID");
        assert.strictEqual(result[2].meta[0], "PID");
    });

    it("split_data_by_segments pushes an empty leading sub-message when the split segment is the very first segment", function () {
        // When splitting by MSH (which is at position 0), should get empty leading segment.
        // This matches upstream behavior (see SegmentFiltersTests.cs line 138-143).
        const result = splitDataBySegments(parsed, "MSH");
        assert.strictEqual(result.length, 2);
        assert.strictEqual(result[0].meta.length, 0);
        assert.strictEqual(result[0].data.length, 0);
        assert.strictEqual(result[1].meta[0], "MSH");
    });

    it("split_data_by_segments returns the whole message unsplit when the separator is empty", function () {
        const result = splitDataBySegments(parsed, "");
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0], parsed);
    });

    it("split_data_by_segments returns the whole message unsplit when none of the requested segments are present", function () {
        const result = splitDataBySegments(parsed, "OBX");
        assert.strictEqual(result.length, 1);
        assert.strictEqual(result[0], parsed);
    });
});
