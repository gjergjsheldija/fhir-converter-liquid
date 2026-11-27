import assert from "assert";
import {findMissingInboundCorrelationIds} from "./inboundCorrelation.js";

const MSH = "MSH|^~\\&|SYN_HIS|EXHOSP|FHIR_CONV|EXHOSP|20261127100000+0100||ADT^A01^ADT_A01|SYN-MSG-1|P|2.5.1";
const PID = "PID|1||SYN-MRN-1^^^EXHOSP^MR||MUSTER^MAX||19850412|M";
const PV1 = "PV1|1|I|WARD-A^01^1||||||||||||||||SYN-VISIT-1^^^EXHOSP^VN";

describe("findMissingInboundCorrelationIds", function () {
    it("accepts a message with MSH-10, PID-3 and PV1-19", function () {
        assert.deepStrictEqual(findMissingInboundCorrelationIds([MSH, PID, PV1].join("\r")), []);
    });

    it("tolerates a BOM and LF line endings", function () {
        assert.deepStrictEqual(findMissingInboundCorrelationIds("\uFEFF" + [MSH, PID, PV1].join("\n")), []);
    });

    it("reports an empty PID-3", function () {
        const pid = "PID|1||^^^EXHOSP^MR||MUSTER^MAX";
        assert.deepStrictEqual(findMissingInboundCorrelationIds([MSH, pid, PV1].join("\r")), ["PID-3"]);
    });

    it("reports a missing PID segment and an empty PV1-19", function () {
        const pv1 = "PV1|1|I|WARD-A^01^1";
        assert.deepStrictEqual(findMissingInboundCorrelationIds([MSH, pv1].join("\r")), ["PID-3", "PV1-19"]);
    });

    it("does not require PV1-19 when there is no PV1 segment", function () {
        assert.deepStrictEqual(findMissingInboundCorrelationIds([MSH, PID].join("\r")), []);
    });

    it("reports an empty MSH-10", function () {
        const msh = "MSH|^~\\&|SYN_HIS|EXHOSP|FHIR_CONV|EXHOSP|20261127100000+0100||ADT^A01^ADT_A01||P|2.5.1";
        assert.deepStrictEqual(findMissingInboundCorrelationIds([msh, PID, PV1].join("\r")), ["MSH-10"]);
    });

    it("reports an empty TXA-12 on a document message", function () {
        const txa = "TXA|1|DS|ED|20261127112500+0100";
        assert.deepStrictEqual(findMissingInboundCorrelationIds([MSH, PID, PV1, txa].join("\r")), ["TXA-12"]);
    });

    it("leaves messages without MSH to the parser", function () {
        assert.deepStrictEqual(findMissingInboundCorrelationIds(PID), []);
    });
});
