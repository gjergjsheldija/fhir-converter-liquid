import {
    FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION,
    HL7V2_LIQUID_TEMPLATE_LOCATION
} from "../constants/constants.js";
import {
    fileExists,
    readProjectTemplateSource,
    runConversion
} from "../conversions/runConversion.js";
import {sendResource} from "../fhir/sendResource.js";
import {sendHl7v2ToGateway} from "../hl7v2/sendHl7v2.js";
import {defaultSecretResolver} from "../vault/secretResolver.js";
import {loadCustomer} from "./customerConfig.js";
import {findMissingInboundCorrelationIds} from "./inboundCorrelation.js";

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

function isOutboundDeliveryDisabled() {
    return process.env.ENABLE_OUTBOUND_DELIVERY === "false" || process.env.ENABLE_OUTBOUND_DELIVERY === "0";
}

export function buildCustomerContext(customer) {
    const identifiers = (customer && customer.identifiers) || {};
    const hl7v2 = (customer && customer.hl7v2) || {};
    return {
        ...identifiers,
        ...hl7v2,
        identifiers: {...identifiers},
        hl7v2: {...hl7v2},
        msh: {...hl7v2},
        customerId: customer ? customer.customerId : "",
        customerName: customer ? customer.name : ""
    };
}

function mapFhirDeliveryMode(mode) {
    if (mode === "conditional_create") {
        return {conditional: true};
    }
    if (mode === "conditional_update") {
        return {update: true};
    }
    return {};
}

function extractOutboundHl7v2Message(resultMessage) {
    if (typeof resultMessage === "string") {
        return resultMessage;
    }
    if (!resultMessage || typeof resultMessage !== "object") {
        return "";
    }
    for (const key of ["hl7v2Message", "hl7v2", "message", "er7", "output", "fhirResource"]) {
        if (typeof resultMessage[key] === "string" && resultMessage[key].trim().length > 0) {
            return resultMessage[key];
        }
    }
    return "";
}

export async function runCustomerInbound({
    customerId,
    customer: preloadedCustomer,
    customersRoot,
    templateName,
    srcData,
    timezone,
    deliver,
    flags = {},
    workerPool,
    recorder = null,
    secretResolver = defaultSecretResolver,
    fetchImpl,
    requestId,
    traceparent
}) {
    if (!workerPool || typeof workerPool.exec !== "function") {
        throw httpError(500, "workerPool is required for customer inbound conversion.");
    }
    const customer = preloadedCustomer || await loadCustomer(customerId, customersRoot);

    if (typeof templateName !== "string" || !templateName.trim()) {
        throw httpError(400, "Invalid template name.");
    }
    if (typeof srcData !== "string" || !srcData.trim()) {
        throw httpError(400, "No srcData provided.");
    }

    const requireCorrelationIds = !(customer.hl7v2 && customer.hl7v2.requireCorrelationIds === false);
    if (requireCorrelationIds) {
        const missing = findMissingInboundCorrelationIds(srcData);
        if (missing.length > 0) {
            const err = httpError(
                422,
                `Missing hospital correlation ID(s): ${missing.join(", ")}. ` +
                "R2 conditionally updates on these identifiers, so the message is rejected."
            );
            err.phase = "validation";
            throw err;
        }
    }

    const fallbackToBuiltin = !(customer.defaults && customer.defaults.fallbackToBuiltin === false);
    const prep = {
        templateDirectory: customer.inputDir,
        fallbackTemplateDirectory: fallbackToBuiltin ? HL7V2_LIQUID_TEMPLATE_LOCATION : null
    };

    const templateSource = await readProjectTemplateSource(prep, templateName);
    if (templateSource === null) {
        throw httpError(404, `Template '${templateName}' not found for customer '${customer.customerId}'.`);
    }

    const hasInputDir = await fileExists(customer.inputDir);
    const effectiveTemplateDir = hasInputDir ? customer.inputDir : HL7V2_LIQUID_TEMPLATE_LOCATION;
    const effectiveFallbackDir = hasInputDir && fallbackToBuiltin ? HL7V2_LIQUID_TEMPLATE_LOCATION : undefined;
    const effectiveTimezone = timezone !== undefined ? timezone : (customer.hl7v2 && customer.hl7v2.timezone);
    const customerContext = buildCustomerContext(customer);

    const {status, resultMessage} = await runConversion({
        workerPool,
        workerTask: {
            type: "/api/convert/:srcDataType",
            srcDataType: "hl7v2",
            srcData,
            template: templateSource,
            templatesOverride: {},
            templateDirectory: effectiveTemplateDir,
            strictOverridesOnly: !fallbackToBuiltin,
            fallbackTemplateDirectory: effectiveFallbackDir,
            customerContext,
            timezone: effectiveTimezone,
            debug: Boolean(flags && flags.retDebug)
        },
        flags,
        projectRoot: customer.customerDir,
        auditContext: {
            srcData,
            template: templateName
        },
        recorder,
        recordFailure: true,
        requestId,
        customerId: customer.customerId
    });

    const shouldDeliver =
        deliver === true ||
        (deliver === undefined && Boolean(customer.defaults && customer.defaults.autoDeliverInbound === true));

    if (shouldDeliver && status === 200) {
        if (isOutboundDeliveryDisabled()) {
            const err = httpError(403, "Outbound delivery is disabled (ENABLE_OUTBOUND_DELIVERY=false).");
            err.phase = "delivery";
            throw err;
        }
        const fhirServer = customer.targets && customer.targets.fhirServer;
        if (!fhirServer || typeof fhirServer.baseUrl !== "string" || !fhirServer.baseUrl.trim()) {
            const err = httpError(
                400,
                `Customer '${customer.customerId}' has no targets.fhirServer.baseUrl configured for inbound delivery.`
            );
            err.phase = "delivery";
            throw err;
        }
        const modeOptions = mapFhirDeliveryMode(fhirServer.mode || "standard");
        try {
            const deliveryResult = await sendResource(
                fhirServer.baseUrl,
                resultMessage && resultMessage.fhirResource,
                fhirServer.auth,
                {
                    ...modeOptions,
                    timeoutMs: fhirServer.timeoutMs,
                    secretResolver,
                    fetchImpl,
                    requestId,
                    traceparent
                }
            );
            resultMessage.delivery = deliveryResult;
        } catch (err) {
            if (err && typeof err === "object") {
                err.phase = "delivery";
            }
            throw err;
        }
    }

    return {
        status,
        resultMessage,
        customerId: customer.customerId
    };
}

export async function runCustomerOutbound({
    customerId,
    customer: preloadedCustomer,
    customersRoot,
    templateName,
    srcData,
    timezone,
    deliver,
    flags = {},
    workerPool,
    recorder = null,
    secretResolver = defaultSecretResolver,
    fetchImpl,
    requestId,
    traceparent
}) {
    if (!workerPool || typeof workerPool.exec !== "function") {
        throw httpError(500, "workerPool is required for customer outbound conversion.");
    }
    const customer = preloadedCustomer || await loadCustomer(customerId, customersRoot);

    if (typeof templateName !== "string" || !templateName.trim()) {
        throw httpError(400, "Invalid template name.");
    }

    let serializedSrcData = "";
    if (typeof srcData === "string") {
        serializedSrcData = srcData;
    } else if (srcData && typeof srcData === "object" && !Array.isArray(srcData)) {
        serializedSrcData = JSON.stringify(srcData);
    }
    if (!serializedSrcData || !serializedSrcData.trim()) {
        throw httpError(400, "No srcData provided.");
    }

    const fallbackToBuiltin = !(customer.defaults && customer.defaults.fallbackToBuiltin === false);
    const prep = {
        templateDirectory: customer.outputDir,
        fallbackTemplateDirectory: fallbackToBuiltin ? FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION : null
    };

    const templateSource = await readProjectTemplateSource(prep, templateName);
    if (templateSource === null) {
        throw httpError(404, `Template '${templateName}' not found for customer '${customer.customerId}'.`);
    }

    const hasOutputDir = await fileExists(customer.outputDir);
    const effectiveTemplateDir = hasOutputDir ? customer.outputDir : FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION;
    const effectiveFallbackDir = hasOutputDir && fallbackToBuiltin ? FHIR_TO_HL7V2_LIQUID_TEMPLATE_LOCATION : undefined;
    const effectiveTimezone = timezone !== undefined ? timezone : (customer.hl7v2 && customer.hl7v2.timezone);
    const customerContext = buildCustomerContext(customer);
    const requireCorrelationIds = !(customer.hl7v2 && customer.hl7v2.requireCorrelationIds === false);

    const {status, resultMessage} = await runConversion({
        workerPool,
        workerTask: {
            type: "/api/convert/:srcDataType",
            srcDataType: "fhir",
            srcData: serializedSrcData,
            template: templateSource,
            templatesOverride: {},
            templateDirectory: effectiveTemplateDir,
            strictOverridesOnly: !fallbackToBuiltin,
            fallbackTemplateDirectory: effectiveFallbackDir,
            customerContext,
            requireCorrelationIds,
            timezone: effectiveTimezone,
            debug: Boolean(flags && flags.retDebug)
        },
        flags,
        auditContext: {
            srcData: serializedSrcData,
            template: templateName
        },
        recorder,
        recordFailure: true,
        requestId,
        customerId: customer.customerId
    });

    const shouldDeliver =
        deliver === true ||
        (deliver === undefined && Boolean(customer.defaults && customer.defaults.autoDeliverOutbound === true));

    if (shouldDeliver && status === 200) {
        if (isOutboundDeliveryDisabled()) {
            const err = httpError(403, "Outbound delivery is disabled (ENABLE_OUTBOUND_DELIVERY=false).");
            err.phase = "delivery";
            throw err;
        }
        const gwCfg = customer.targets && customer.targets.hl7v2Gateway;
        if (!gwCfg || typeof gwCfg.baseUrl !== "string" || !gwCfg.baseUrl.trim()) {
            const err = httpError(
                400,
                `Customer '${customer.customerId}' has no targets.hl7v2Gateway.baseUrl configured for outbound delivery.`
            );
            err.phase = "delivery";
            throw err;
        }
        const hl7v2Message = extractOutboundHl7v2Message(resultMessage);
        if (!hl7v2Message) {
            throw httpError(422, "Outbound conversion produced an empty HL7v2 message.");
        }
        try {
            const gwDeliveryResult = await sendHl7v2ToGateway(
                gwCfg.baseUrl,
                hl7v2Message,
                gwCfg.auth,
                {
                    format: gwCfg.format || "json_envelope",
                    requireApplicationAck: gwCfg.requireApplicationAck !== false,
                    encoding: gwCfg.encoding,
                    customerId: customer.customerId,
                    timeoutMs: gwCfg.timeoutMs,
                    secretResolver,
                    fetchImpl,
                    requestId,
                    traceparent
                }
            );
            resultMessage.delivery = gwDeliveryResult;
        } catch (err) {
            if (err && typeof err === "object") {
                err.phase = "delivery";
            }
            throw err;
        }
    }

    return {
        status,
        resultMessage,
        customerId: customer.customerId
    };
}
