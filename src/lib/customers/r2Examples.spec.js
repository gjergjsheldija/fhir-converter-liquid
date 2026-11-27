import assert from "assert";
import {execFile} from "child_process";
import {readFile} from "fs/promises";
import path from "path";
import {promisify} from "util";

const execFileAsync = promisify(execFile);
const EXAMPLES_ROOT = path.resolve("docs/r2-contract/examples");
const readJson = async (rel) => JSON.parse(await readFile(path.join(EXAMPLES_ROOT, rel), "utf8"));
const MRN_URL = "Patient?identifier=https%3A%2F%2Ffhir.example-hospital.org%2Fsid%2Fmrn|SYN-MRN-0001";
const VISIT_URL = "Encounter?identifier=https%3A%2F%2Ffhir.example-hospital.org%2Fsid%2Fvisit-number|SYN-VISIT-1001";

describe("R2 first-case synthetic examples (scripts/build-r2-examples.mjs)", function () {
    it("regenerates all 7 example outputs and sent bundles with zero drift (--check)", async function () {
        const {stdout} = await execFileAsync(process.execPath, ["scripts/build-r2-examples.mjs", "--check"]);
        assert.match(stdout, /All 7 R2 example outputs are up to date/);
    });

    it("emits the same minimal resource set for every first-case message", async function () {
        const expected = {
            "01-admit": ["Patient", "Encounter"],
            "02-update": ["Patient", "Encounter"],
            "03-document": ["Patient", "Encounter", "DocumentReference"],
            "04-discharge": ["Patient", "Encounter"],
            "05-duplicate": ["Patient", "Encounter"]
        };
        for (const [dir, types] of Object.entries(expected)) {
            const out = await readJson(`${dir}/output.json`);
            assert.deepStrictEqual(out.fhirResource.entry.map((e) => e.resource.resourceType), types, dir);
        }
    });

    it("sends a conditional-update transaction keyed on hospital identifiers", async function () {
        const sent = await readJson("01-admit/sent.json");
        assert.strictEqual(sent.type, "transaction");
        assert.deepStrictEqual(sent.entry.map((e) => e.request), [
            {method: "PUT", url: MRN_URL},
            {method: "PUT", url: VISIT_URL}
        ]);
        const encounter = sent.entry[1].resource;
        assert.strictEqual(encounter.subject.reference, sent.entry[0].fullUrl);
        assert.ok(sent.entry[0].fullUrl.startsWith("urn:uuid:"));

        assert.deepStrictEqual(await readJson("05-duplicate/sent.json"), sent);
    });

    it("updates the address on A08 and finishes the Encounter on A03", async function () {
        const update = await readJson("02-update/sent.json");
        assert.strictEqual(update.entry[0].resource.address[0].line[0], "200 Example Ave");
        const discharge = await readJson("04-discharge/sent.json");
        const encounter = discharge.entry[1].resource;
        assert.strictEqual(encounter.status, "finished");
        assert.ok(encounter.period && encounter.period.end);
    });

    it("carries the PDF in DocumentReference.content linked to Patient and Encounter", async function () {
        const sent = await readJson("03-document/sent.json");
        const [patient, encounter, doc] = sent.entry;
        assert.strictEqual(doc.resource.resourceType, "DocumentReference");
        assert.strictEqual(doc.request.method, "PUT");
        assert.match(doc.request.url, /^DocumentReference\?identifier=.*\|SYN-DOC-9001$/);
        assert.strictEqual(doc.resource.content[0].attachment.contentType, "application/pdf");
        assert.ok(doc.resource.content[0].attachment.data.length > 0);
        assert.strictEqual(doc.resource.subject.reference, patient.fullUrl);
        assert.strictEqual(doc.resource.context.encounter[0].reference, encounter.fullUrl);
    });

    it("rejects an unparseable message with 400 and a missing identifier with 422", async function () {
        const rejected = await readJson("06-rejected/output.json");
        assert.strictEqual(rejected.resourceType, "OperationOutcome");
        assert.strictEqual(rejected.phase, "conversion");
        assert.strictEqual(rejected.issue[0].code, "invalid");

        const missing = await readJson("07-missing-identifier/output.json");
        assert.strictEqual(missing.resourceType, "OperationOutcome");
        assert.strictEqual(missing.phase, "validation");
        assert.strictEqual(missing.issue[0].code, "processing");
        assert.match(missing.issue[0].diagnostics, /PID-3/);
    });
});
