import {readFile, writeFile} from "fs/promises";
import {dirname, join, resolve} from "path";
import {fileURLToPath} from "url";
import {CUSTOMERS_LOCATION} from "../src/lib/constants/constants.js";
import {loadCustomer} from "../src/lib/customers/customerConfig.js";
import {runCustomerInbound} from "../src/lib/customers/customerPipeline.js";
import {conditionalTransaction, conditionalUpdate} from "../src/lib/fhir/sendResource.js";
import {convertInlineHl7v2} from "../src/lib/workers/worker.js";
import {buildCustomerOperationOutcome} from "../src/routes/customers.routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const EXAMPLES_ROOT = resolve(repoRoot, "docs/r2-contract/examples");
const FIXED_NOW_MS = Date.parse("2026-11-27T10:00:00.000Z");

export const EXAMPLE_STEPS = [
    {dir: "01-admit", template: "ADT_A01", requestId: "r2-example-01-admit"},
    {dir: "02-update", template: "ADT_A08", requestId: "r2-example-02-update"},
    {dir: "03-document", template: "MDM_T02", requestId: "r2-example-03-document"},
    {dir: "04-discharge", template: "ADT_A03", requestId: "r2-example-04-discharge"},
    {dir: "05-duplicate", template: "ADT_A01", requestId: "r2-example-05-duplicate"},
    {dir: "06-rejected", template: "ADT_A01", requestId: "r2-example-06-rejected"},
    {dir: "07-missing-identifier", template: "ADT_A01", requestId: "r2-example-07-missing-identifier"}
];

const CUSTOMER_ID = "example-hospital";

function createInProcessWorkerPool() {
    return {
        exec: async (task) => {
            try {
                return await convertInlineHl7v2(task);
            } catch (err) {
                if (err && typeof err === "object" && Number.isInteger(err.status) && err.resultMsg) {
                    return err;
                }
                throw err;
            }
        }
    };
}

async function withFixedClock(fn) {
    const RealDate = global.Date;
    class FixedDate extends RealDate {
        constructor(...args) {
            if (args.length === 0) {
                super(FIXED_NOW_MS);
            } else {
                super(...args);
            }
        }
        static now() {
            return FIXED_NOW_MS;
        }
    }
    global.Date = FixedDate;
    try {
        return await fn();
    } finally {
        global.Date = RealDate;
    }
}

export async function generateStepOutput(step) {
    const stepDir = join(EXAMPLES_ROOT, step.dir);
    const inputPath = join(stepDir, "input.hl7");
    const rawInput = await readFile(inputPath, "utf8");
    const srcData = rawInput.replace(/\r?\n/g, "\r").replace(/\r+$/, "\r");
    const workerPool = createInProcessWorkerPool();

    const toOutcome = (status, message) => {
        const err = new Error(message || "Customer inbound conversion failed.");
        err.status = status;
        err.phase = status === 422 ? "validation" : "conversion";
        return buildCustomerOperationOutcome({requestId: step.requestId}, err, status);
    };

    let status;
    let resultMessage;
    try {
        ({status, resultMessage} = await withFixedClock(() =>
            runCustomerInbound({
                customerId: CUSTOMER_ID,
                customersRoot: CUSTOMERS_LOCATION,
                templateName: step.template,
                srcData,
                deliver: false,
                workerPool,
                requestId: step.requestId
            })
        ));
    } catch (err) {
        if (err && Number.isInteger(err.status)) {
            return toOutcome(err.status, err.message);
        }
        throw err;
    }

    if (status >= 400) {
        return toOutcome(status, resultMessage && resultMessage.error && resultMessage.error.message);
    }

    return resultMessage;
}

/**
 * The exact Bundle the mapper POSTs to R2 for this customer: the converted
 * Bundle after the customer's targets.fhirServer.mode rewrite, built with
 * the same functions sendResource() uses. Returns null for rejected steps.
 */
export async function buildSentBundle(output) {
    if (!output || !output.fhirResource) {
        return null;
    }
    const customer = await loadCustomer(CUSTOMER_ID, CUSTOMERS_LOCATION);
    const mode = customer.targets && customer.targets.fhirServer && customer.targets.fhirServer.mode;
    if (mode === "conditional_update") {
        return conditionalUpdate(output.fhirResource);
    }
    if (mode === "conditional_create") {
        return conditionalTransaction(output.fhirResource);
    }
    return output.fhirResource;
}

async function writeOrCheck(filePath, label, value, check, diffs) {
    const serialized = `${JSON.stringify(value, null, 2)}\n`;
    if (!check) {
        await writeFile(filePath, serialized, "utf8");
        return;
    }
    let committed = "";
    try {
        committed = await readFile(filePath, "utf8");
    } catch (err) {
        diffs.push(`${label} (missing)`);
        return;
    }
    if (committed !== serialized) {
        diffs.push(label);
    }
}

export async function buildR2Examples({check = false} = {}) {
    const diffs = [];
    for (const step of EXAMPLE_STEPS) {
        const stepDir = join(EXAMPLES_ROOT, step.dir);
        const generated = await generateStepOutput(step);
        await writeOrCheck(join(stepDir, "output.json"), `${step.dir}/output.json`, generated, check, diffs);

        const sent = await buildSentBundle(generated);
        if (sent) {
            await writeOrCheck(join(stepDir, "sent.json"), `${step.dir}/sent.json`, sent, check, diffs);
        }
    }
    return diffs;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const check = process.argv.includes("--check");
    const diffs = await buildR2Examples({check});
    if (check) {
        if (diffs.length > 0) {
            console.error(`R2 example outputs out of date: ${diffs.join(", ")}`);
            process.exit(1);
        }
        console.log(`All ${EXAMPLE_STEPS.length} R2 example outputs are up to date.`);
    } else {
        console.log(`Generated ${EXAMPLE_STEPS.length} R2 example outputs under docs/r2-contract/examples/.`);
    }
}
