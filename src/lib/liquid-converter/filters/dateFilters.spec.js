import assert from "assert";
import { addHyphensDate, formatAsDateTime, nowFilter, dateAdd } from "./dateFilters.js";

describe("date filters", function () {
    it("add_hyphens_date hyphenates a bare YYYYMMDD date", function () {
        assert.strictEqual(addHyphensDate("20040629"), "2004-06-29");
    });

    it("add_hyphens_date hyphenates a partial YYYYMM date", function () {
        assert.strictEqual(addHyphensDate("200406"), "2004-06");
    });

    it("add_hyphens_date returns empty string for an invalid input", function () {
        assert.strictEqual(addHyphensDate(""), "");
    });

    it("format_as_date_time converts a full HL7v2 datetime to FHIR format", function () {
        const result = formatAsDateTime("20040629175400.000");
        assert.ok(result.startsWith("2004-06-29T17:54:00"));
    });

    it("format_as_date_time preserves positive timezone offset (+0200)", function () {
        const result = formatAsDateTime("20220315103000+0200");
        assert.strictEqual(result, "2022-03-15T10:30:00+02:00");
    });

    it("format_as_date_time preserves negative timezone offset (-0530)", function () {
        const result = formatAsDateTime("20220315103000-0530");
        assert.strictEqual(result, "2022-03-15T10:30:00-05:30");
    });

    it("format_as_date_time handles UTC offset (+00)", function () {
        const result = formatAsDateTime("20220315103000+00");
        assert.strictEqual(result, "2022-03-15T10:30:00+00:00");
    });

    it("format_as_date_time handles bare datetime without offset", function () {
        const result = formatAsDateTime("20220315103000");
        assert.ok(result.includes("2022-03-15T10:30:00"));
    });

    it("format_as_date_time handles partial datetime (YYYYMM)", function () {
        const result = formatAsDateTime("202203");
        assert.strictEqual(result, "2022-03");
    });

    it("now returns a FHIR-instant-formatted current timestamp", function () {
        const result = nowFilter();
        assert.match(result, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it("date_add adds whole days to an ISO datetime", function () {
        const result = dateAdd("2021-01-01T00:00:00.000Z", 5, "day");
        assert.strictEqual(result, "2021-01-06T00:00:00.000Z");
    });
});
