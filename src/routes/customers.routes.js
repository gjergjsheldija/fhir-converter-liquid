import {authorizeConvert} from "../lib/conversions/convertAudit.js";
import {parseConversionQueryFlags} from "../lib/conversions/runConversion.js";
import {
    getRedactedCustomerSummary,
    listCustomers,
    loadCustomer,
    verifyCustomerInboundAuth
} from "../lib/customers/customerConfig.js";
import {
    runCustomerInbound,
    runCustomerOutbound
} from "../lib/customers/customerPipeline.js";

function parseDeliverFlag(query = {}) {
    if (query.deliver === undefined) {
        return undefined;
    }
    return query.deliver === "true" || query.deliver === "1" || query.deliver === true;
}

function mapStatusToIssueCode(status) {
    if (status === 401) {
        return "login";
    }
    if (status === 403) {
        return "forbidden";
    }
    if (status === 404) {
        return "not-found";
    }
    if (status === 409) {
        return "conflict";
    }
    if (status === 422) {
        return "processing";
    }
    if (status === 502 || status === 503) {
        return "transient";
    }
    if (status === 504) {
        return "timeout";
    }
    if (status >= 500) {
        return "exception";
    }
    return "invalid";
}

export function buildCustomerOperationOutcome(req, err, status) {
    const diagnostics = err && err.message ? err.message : "Customer pipeline request failed.";
    const payload = {
        resourceType: "OperationOutcome",
        issue: [
            {
                severity: "error",
                code: mapStatusToIssueCode(status),
                diagnostics
            }
        ]
    };
    if (req && req.requestId) {
        payload.id = req.requestId;
        payload.requestId = req.requestId;
    }
    if (err && err.phase) {
        payload.phase = err.phase;
    }
    if (err && err.detail !== undefined) {
        payload.detail = err.detail;
    }
    return payload;
}

function sendCustomerError(req, res, err) {
    const status = err && Number.isInteger(err.status) ? err.status : 400;
    const payload = buildCustomerOperationOutcome(req, err, status);
    res.status(status).json(payload);
}

function extractInboundHl7Text(body) {
    if (typeof body === "string") {
        return body;
    }
    if (Buffer.isBuffer(body)) {
        return body.toString("utf8");
    }
    if (body && typeof body === "object" && typeof body.srcData === "string") {
        return body.srcData;
    }
    return "";
}

function extractOutboundFhirInput(body) {
    if (typeof body === "string") {
        return body;
    }
    if (Buffer.isBuffer(body)) {
        return body.toString("utf8");
    }
    if (body && typeof body === "object" && !Array.isArray(body)) {
        if (body.resourceType === "Bundle") {
            return body;
        }
        if (body.srcData !== undefined) {
            return body.srcData;
        }
    }
    return "";
}

function prefersRawHl7v2(req) {
    const accept = String((req.headers && req.headers.accept) || "").toLowerCase();
    return accept.includes("application/hl7-v2") || accept.includes("x-application/hl7-v2+er7");
}

async function authorizeCustomerPipelineRequest(req, customer, secretResolver) {
    const hasCustomerInboundAuth = Boolean(
        customer &&
        customer.inboundAuth &&
        customer.inboundAuth.enabled !== false &&
        customer.inboundAuth.type !== "none" &&
        (customer.inboundAuth.secretRef || customer.inboundAuth.apiKey || customer.inboundAuth.token)
    );

    if (hasCustomerInboundAuth) {
        await verifyCustomerInboundAuth(req.headers, customer, secretResolver);
        return;
    }

    if (!authorizeConvert(process.env.CONVERT_API_KEY, req.headers.authorization)) {
        const err = new Error("Convert API key is required.");
        err.status = 401;
        throw err;
    }
}

export default function registerCustomersRoutes(app, {workerPool, recorder, requireApiKey, secretResolver, customersRoot}) {
    /**
     * @swagger
     * /api/v1/customers:
     *   get:
     *     summary: Lists configured customer bidirectional pipelines
     *     description: Returns all customer profiles under CUSTOMERS_ROOT with Vault secret references redacted.
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: Array of redacted customer configurations
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/customers", requireApiKey, async function (req, res) {
        try {
            const customers = await listCustomers(customersRoot);
            res.status(200).json({customers});
        } catch (err) {
            sendCustomerError(req, res, err);
        }
    });

    /**
     * @swagger
     * /api/v1/customers/{customerId}:
     *   get:
     *     summary: Inspects a single customer pipeline configuration
     *     description: Returns a customer's input/output templates, identifiers, MSH settings, and target metadata with secrets redacted.
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: customerId
     *         in: path
     *         required: true
     *         type: string
     *     responses:
     *       200:
     *         description: Redacted customer configuration
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Customer not found
     */
    app.get("/api/v1/customers/:customerId", requireApiKey, async function (req, res) {
        try {
            const customer = await loadCustomer(req.params.customerId, customersRoot);
            res.status(200).json(getRedactedCustomerSummary(customer));
        } catch (err) {
            sendCustomerError(req, res, err);
        }
    });

    /**
     * @swagger
     * /api/v1/customers/{customerId}/inbound/{template}:
     *   post:
     *     summary: Converts an inbound HL7v2 message to FHIR for a customer and optionally sends it to the customer's FHIR server
     *     description: Uses templates from customers/{customerId}/input/ (with fallback to built-in Hl7v2/) and resolves FHIR server credentials from Vault when deliver=true.
     *     consumes:
     *       - text/plain
     *       - application/hl7-v2
     *       - application/json
     *     produces:
     *       - application/json
     *     parameters:
     *       - name: customerId
     *         in: path
     *         required: true
     *         type: string
     *       - name: template
     *         in: path
     *         required: true
     *         type: string
     *         description: Template name inside customers/{customerId}/input/ (e.g. ADT_A01)
     *       - name: deliver
     *         in: query
     *         required: false
     *         type: boolean
     *         description: When true, delivers the resulting FHIR Bundle to targets.fhirServer from config.yaml
     *       - name: srcData
     *         in: body
     *         required: true
     *         schema:
     *           type: string
     *     responses:
     *       200:
     *         description: Converted FHIR Bundle and optional FHIR server delivery status
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Customer or template not found
     */
    app.post("/api/v1/customers/:customerId/inbound/:template(*)", async function (req, res) {
        const flags = parseConversionQueryFlags(req.query);
        const deliver = parseDeliverFlag(req.query);
        const srcData = extractInboundHl7Text(req.body);

        try {
            const customer = await loadCustomer(req.params.customerId, customersRoot);
            await authorizeCustomerPipelineRequest(req, customer, secretResolver);

            const {status, resultMessage} = await runCustomerInbound({
                customerId: customer.customerId,
                customer,
                customersRoot,
                templateName: req.params.template,
                srcData,
                timezone: req.headers.timezone,
                deliver,
                flags,
                workerPool,
                recorder,
                secretResolver,
                requestId: req.requestId,
                traceparent: req.traceparent
            });

            if (status >= 400) {
                const err = new Error(
                    (resultMessage && resultMessage.error && resultMessage.error.message) ||
                    "Customer inbound conversion failed."
                );
                err.status = status;
                err.phase = "conversion";
                sendCustomerError(req, res, err);
                return;
            }

            res.status(status).json(resultMessage);
        } catch (err) {
            sendCustomerError(req, res, err);
        }
    });

    /**
     * @swagger
     * /api/v1/customers/{customerId}/outbound/{template}:
     *   post:
     *     summary: Converts a FHIR R4 Bundle (e.g. Hospital Discharge Form) to HL7v2 for a customer and optionally sends it to the customer's HL7v2 REST Gateway
     *     description: Uses templates from customers/{customerId}/output/ (with fallback to built-in FhirToHl7v2/), injects customer MSH/identifier config, and verifies HL7v2 MSA ACK when deliver=true.
     *     consumes:
     *       - application/fhir+json
     *       - application/json
     *     produces:
     *       - application/json
     *       - application/hl7-v2
     *     parameters:
     *       - name: customerId
     *         in: path
     *         required: true
     *         type: string
     *       - name: template
     *         in: path
     *         required: true
     *         type: string
     *         description: Template name inside customers/{customerId}/output/ (e.g. MDM_T02, ADT_A03, ORU_R01)
     *       - name: deliver
     *         in: query
     *         required: false
     *         type: boolean
     *         description: When true, posts the rendered HL7v2 message to targets.hl7v2Gateway and validates MSA ACK
     *       - name: bundle
     *         in: body
     *         required: true
     *         description: Self-contained FHIR R4 Bundle (document or collection)
     *         schema:
     *           type: object
     *     responses:
     *       200:
     *         description: Rendered HL7v2 message and optional gateway ACK metadata
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Customer or template not found
     *       422:
     *         description: Missing hospital correlation ID (PID-3 / PV1-19) or HL7v2 gateway Application NACK (AE/AR)
     *       502:
     *         description: Downstream HL7v2 gateway transport error
     */
    app.post("/api/v1/customers/:customerId/outbound/:template(*)", async function (req, res) {
        const flags = parseConversionQueryFlags(req.query);
        const deliver = parseDeliverFlag(req.query);
        const srcData = extractOutboundFhirInput(req.body);

        try {
            const customer = await loadCustomer(req.params.customerId, customersRoot);
            await authorizeCustomerPipelineRequest(req, customer, secretResolver);

            const {status, resultMessage} = await runCustomerOutbound({
                customerId: customer.customerId,
                customer,
                customersRoot,
                templateName: req.params.template,
                srcData,
                timezone: req.headers.timezone,
                deliver,
                flags,
                workerPool,
                recorder,
                secretResolver,
                requestId: req.requestId,
                traceparent: req.traceparent
            });

            if (status >= 400) {
                const err = new Error(
                    (resultMessage && resultMessage.error && resultMessage.error.message) ||
                    "Customer outbound conversion failed."
                );
                err.status = status;
                err.phase = "conversion";
                sendCustomerError(req, res, err);
                return;
            }

            if (status === 200 && !resultMessage.delivery && prefersRawHl7v2(req) && typeof resultMessage.hl7v2Message === "string") {
                res.status(200).type("application/hl7-v2; charset=utf-8").send(resultMessage.hl7v2Message);
                return;
            }

            res.status(status).json(resultMessage);
        } catch (err) {
            sendCustomerError(req, res, err);
        }
    });
}
