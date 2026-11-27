import assert from "assert";
import {createSecretResolver} from "../vault/secretResolver.js";
import {extractMshMetadata, parseHl7v2Ack, sendHl7v2ToGateway} from "./sendHl7v2.js";

const SAMPLE_MDM =
    "MSH|^~\\&|FHIR_CONV|UK_ESSEN|KIS_MLLP|UK_ESSEN|20261126140000||MDM^T02^MDM_T02|MSG-CTRL-9001|P|2.5.1||||||UNICODE UTF-8\n" +
    "PID|1||9876543^^^UK_ESSEN^MR||MUELLER^ANNA||19800512|F\n" +
    "OBX|1|TX|DOC^Discharge||Discharge summary text||||||F\r\n";

describe("sendHl7v2", function () {
    describe("extractMshMetadata", function () {
        it("extracts MSH-3..MSH-18 fields using the dynamic MSH[3] field separator", function () {
            const msh = extractMshMetadata(SAMPLE_MDM);
            assert.deepStrictEqual(msh, {
                sendingApplication: "FHIR_CONV",
                sendingFacility: "UK_ESSEN",
                receivingApplication: "KIS_MLLP",
                receivingFacility: "UK_ESSEN",
                messageType: "MDM^T02^MDM_T02",
                messageControlId: "MSG-CTRL-9001",
                versionId: "2.5.1",
                charset: "UNICODE UTF-8"
            });

            const customSepMsh = extractMshMetadata("MSH#^~\\&#APP1#FAC1#APP2#FAC2#20261126##ADT^A01#CTRL-7#P#2.4");
            assert.strictEqual(customSepMsh.sendingApplication, "APP1");
            assert.strictEqual(customSepMsh.messageControlId, "CTRL-7");
            assert.strictEqual(customSepMsh.versionId, "2.4");
        });
    });

    describe("parseHl7v2Ack", function () {
        it("marks AA and CA as accepted and AE/AR/CE/CR as rejected with MSA-3 and ERR-3/7/8 details", function () {
            const aaAck = parseHl7v2Ack(
                "MSH|^~\\&|KIS|HOSP|CONV|HOSP|20261126||ACK^T02|ACK1|P|2.5.1\rMSA|AA|MSG-CTRL-9001|Document stored"
            );
            assert.strictEqual(aaAck.accepted, true);
            assert.strictEqual(aaAck.ackCode, "AA");
            assert.strictEqual(aaAck.controlId, "MSG-CTRL-9001");
            assert.strictEqual(aaAck.textMessage, "Document stored");
            assert.strictEqual(aaAck.errorSegment, null);

            const caJsonAck = parseHl7v2Ack({
                ack: "MSH|^~\\&|KIS|HOSP|CONV|HOSP|20261126||ACK|A2|P|2.5.1\rMSA|CA|MSG-CTRL-9001",
                message: "Commit accepted"
            });
            assert.strictEqual(caJsonAck.accepted, true);
            assert.strictEqual(caJsonAck.ackCode, "CA");
            assert.strictEqual(caJsonAck.textMessage, "Commit accepted");

            for (const nackCode of ["AE", "AR", "CE", "CR"]) {
                const nack = parseHl7v2Ack(
                    `MSH|^~\\&|KIS|HOSP|CONV|HOSP|20261126||ACK|A3|P|2.5.1\r` +
                        `MSA|${nackCode}|MSG-CTRL-9001|Application error\r` +
                        `ERR|||204^Unknown key identifier^HL70357|E|||Unknown visit V-404|Patient visit not open`
                );
                assert.strictEqual(nack.accepted, false);
                assert.strictEqual(nack.ackCode, nackCode);
                assert.strictEqual(nack.controlId, "MSG-CTRL-9001");
                assert.ok(nack.textMessage.includes("Application error"));
                assert.ok(nack.textMessage.includes("204^Unknown key identifier^HL70357"));
                assert.ok(nack.textMessage.includes("Unknown visit V-404"));
                assert.ok(nack.textMessage.includes("Patient visit not open"));
                assert.ok(nack.errorSegment.startsWith("ERR|"));
            }

            const statusAck = parseHl7v2Ack({status: "accepted"});
            assert.strictEqual(statusAck.accepted, true);
        });
    });

    describe("sendHl7v2ToGateway", function () {
        it("sends json_envelope with Idempotency-Key (MSH-10) and parses JSON ACK", async function () {
            const calls = [];
            const fetchImpl = async (url, init) => {
                calls.push({url, init});
                return {
                    ok: true,
                    status: 200,
                    text: async () =>
                        JSON.stringify({
                            ack: "MSH|^~\\&|KIS|HOSP|CONV|HOSP|20261126||ACK^T02|ACK9|P|2.5.1\rMSA|AA|MSG-CTRL-9001|OK"
                        })
                };
            };

            const res = await sendHl7v2ToGateway(
                "https://gateway.hospital.example/v1/hl7v2",
                SAMPLE_MDM,
                {type: "api_key_header", headerName: "X-Gateway-Key", apiKey: "gw-secret"},
                {format: "json_envelope", customerId: "example-hospital", fetchImpl}
            );

            assert.strictEqual(res.ok, true);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.format, "json_envelope");
            assert.strictEqual(res.messageControlId, "MSG-CTRL-9001");
            assert.strictEqual(res.ack.accepted, true);
            assert.strictEqual(res.ack.ackCode, "AA");

            assert.strictEqual(calls.length, 1);
            assert.strictEqual(calls[0].init.headers["Content-Type"], "application/json");
            assert.strictEqual(calls[0].init.headers["Idempotency-Key"], "MSG-CTRL-9001");
            assert.strictEqual(calls[0].init.headers["X-Gateway-Key"], "gw-secret");

            const envelope = JSON.parse(calls[0].init.body);
            assert.strictEqual(envelope.encoding, "UNICODE UTF-8");
            assert.deepStrictEqual(envelope.metadata, {
                customerId: "example-hospital",
                messageType: "MDM^T02^MDM_T02",
                messageControlId: "MSG-CTRL-9001",
                correlationId: "MSG-CTRL-9001"
            });
        });

        it("sends raw_er7 with pure \\r segment terminators and retries once on HTTP 401 with secretRef", async function () {
            const env = {GW_TOKEN: "expired-gw-token"};
            const secretResolver = createSecretResolver({env, ttlMs: 60000});
            await secretResolver.resolve("env://GW_TOKEN");
            env.GW_TOKEN = "fresh-gw-token";

            const calls = [];
            const fetchImpl = async (url, init) => {
                calls.push({url, init});
                if (calls.length === 1) {
                    return {ok: false, status: 401, text: async () => "Unauthorized"};
                }
                return {
                    ok: true,
                    status: 200,
                    text: async () => "MSH|^~\\&|KIS|H|CONV|H|20261126||ACK|1|P|2.5.1\rMSA|CA|MSG-CTRL-9001"
                };
            };

            const res = await sendHl7v2ToGateway(
                "https://mllp-bridge.hospital.example/er7",
                SAMPLE_MDM,
                {type: "bearer", secretRef: "env://GW_TOKEN"},
                {format: "raw_er7", secretResolver, fetchImpl}
            );

            assert.strictEqual(res.ok, true);
            assert.strictEqual(calls.length, 2);
            assert.strictEqual(calls[0].init.headers.Authorization, "Bearer expired-gw-token");
            assert.strictEqual(calls[1].init.headers.Authorization, "Bearer fresh-gw-token");
            assert.strictEqual(calls[1].init.headers["Content-Type"], "application/hl7-v2; charset=utf-8");
            assert.strictEqual(calls[1].init.body.includes("\n"), false);
            assert.strictEqual(calls[1].init.body.split("\r").filter(Boolean).length, 3);
        });

        it("throws HTTP 422 with .detail = ack on Application NACK unless requireApplicationAck is false", async function () {
            const nackFetch = async () => ({
                ok: true,
                status: 200,
                text: async () =>
                    "MSH|^~\\&|KIS|H|CONV|H|20261126||ACK|1|P|2.5.1\r" +
                    "MSA|AE|MSG-CTRL-9001|Duplicate document ID\r" +
                    "ERR|||207^Application internal error||||||||"
            });

            await assert.rejects(
                () => sendHl7v2ToGateway("https://gw.example.org/hl7", SAMPLE_MDM, {}, {fetchImpl: nackFetch}),
                (err) => {
                    assert.strictEqual(err.status, 422);
                    assert.ok(err.message.includes("HL7v2 gateway returned application NACK (AE)"));
                    assert.ok(err.message.includes("Duplicate document ID"));
                    assert.strictEqual(err.detail.ackCode, "AE");
                    assert.strictEqual(err.detail.accepted, false);
                    return true;
                }
            );

            const ignoredNack = await sendHl7v2ToGateway(
                "https://gw.example.org/hl7",
                SAMPLE_MDM,
                {},
                {requireApplicationAck: false, fetchImpl: nackFetch}
            );
            assert.strictEqual(ignoredNack.ok, true);
            assert.strictEqual(ignoredNack.ack.accepted, false);
        });

        it("blocks non-http URLs and non-MSH payloads with 400 and wraps non-2xx responses in 502", async function () {
            await assert.rejects(() => sendHl7v2ToGateway("ftp://gw.example.org/hl7", SAMPLE_MDM), {status: 400});
            await assert.rejects(() => sendHl7v2ToGateway("file:///etc/passwd", SAMPLE_MDM), {status: 400});
            await assert.rejects(() => sendHl7v2ToGateway("https://gw.example.org/hl7", "PID|1||123"), {status: 400});
            await assert.rejects(() => sendHl7v2ToGateway("https://gw.example.org/hl7", ""), {status: 400});

            await assert.rejects(
                () =>
                    sendHl7v2ToGateway(
                        "https://gw.example.org/hl7",
                        SAMPLE_MDM,
                        {},
                        {
                            fetchImpl: async () => ({
                                ok: false,
                                status: 503,
                                text: async () => JSON.stringify({error: "MLLP socket closed"})
                            })
                        }
                    ),
                (err) => err.status === 502 && err.detail && err.detail.error === "MLLP socket closed"
            );
        });
    });
});
