import {buildOutboundHeaders, invalidateAuthSecrets, isRefreshableAuth} from "../auth/outboundAuth.js";

const DEFAULT_GATEWAY_TIMEOUT_MS = 15000;
const ACCEPTED_ACK_CODES = new Set(["AA", "CA"]);
const REJECTED_ACK_CODES = new Set(["AE", "AR", "CE", "CR"]);

function httpError(status, message, detail) {
    const error = new Error(message);
    error.status = status;
    if (detail !== undefined) {
        error.detail = detail;
    }
    return error;
}

function stripBom(str) {
    if (typeof str === "string" && str.charCodeAt(0) === 0xFEFF) {
        return str.slice(1);
    }
    return str;
}

export function extractMshMetadata(hl7v2Text) {
    const empty = {
        sendingApplication: "",
        sendingFacility: "",
        receivingApplication: "",
        receivingFacility: "",
        messageType: "",
        messageControlId: "",
        versionId: "",
        charset: ""
    };
    if (typeof hl7v2Text !== "string") {
        return empty;
    }
    const clean = stripBom(hl7v2Text).trim();
    const lines = clean.split(/\r\n|\r|\n/).filter((line) => line.length > 0);
    const mshLine = lines.find((line) => line.startsWith("MSH") && line.length >= 4);
    if (!mshLine) {
        return empty;
    }

    const fieldSep = mshLine[3] || "|";
    const fields = mshLine.split(fieldSep);

    return {
        sendingApplication: fields[2] || "",
        sendingFacility: fields[3] || "",
        receivingApplication: fields[4] || "",
        receivingFacility: fields[5] || "",
        messageType: fields[8] || "",
        messageControlId: fields[9] || "",
        versionId: fields[11] || "",
        charset: fields[17] || ""
    };
}

function parseEr7AckString(er7Text) {
    const clean = stripBom(er7Text).trim();
    if (!clean) {
        return {
            ackCode: null,
            controlId: "",
            textMessage: "",
            errorSegment: null,
            accepted: null
        };
    }

    const lines = clean.split(/\r\n|\r|\n/).map((line) => line.trim()).filter((line) => line.length > 0);
    const mshLine = lines.find((line) => line.startsWith("MSH") && line.length >= 4);
    const firstSegWithSep = mshLine || lines.find((line) => /^[A-Z0-9]{3}[^A-Za-z0-9]/.test(line));
    const fieldSep = firstSegWithSep ? firstSegWithSep[3] : "|";

    const msaLine = lines.find((line) => line.startsWith("MSA" + fieldSep) || line === "MSA");
    const errLines = lines.filter((line) => line.startsWith("ERR" + fieldSep));

    let ackCode = null;
    let controlId = "";
    const messageParts = [];

    if (msaLine) {
        const msaFields = msaLine.split(fieldSep);
        const rawCode = (msaFields[1] || "").trim().toUpperCase();
        ackCode = rawCode || null;
        controlId = (msaFields[2] || "").trim();
        const msaText = (msaFields[3] || "").trim();
        if (msaText) {
            messageParts.push(msaText);
        }
    }

    for (const errLine of errLines) {
        const errFields = errLine.split(fieldSep);
        for (const idx of [3, 7, 8]) {
            const val = (errFields[idx] || "").trim();
            if (val && !messageParts.includes(val)) {
                messageParts.push(val);
            }
        }
        if (messageParts.length === 0 && errFields[1]) {
            const v23Eld = errFields[1].trim();
            if (v23Eld) {
                messageParts.push(v23Eld);
            }
        }
    }

    let accepted = null;
    if (ackCode && ACCEPTED_ACK_CODES.has(ackCode)) {
        accepted = true;
    } else if (ackCode && REJECTED_ACK_CODES.has(ackCode)) {
        accepted = false;
    }

    return {
        ackCode,
        controlId,
        textMessage: messageParts.join("; "),
        errorSegment: errLines.length > 0 ? errLines.join("\r") : null,
        accepted
    };
}

export function parseHl7v2Ack(payload) {
    if (payload === null || payload === undefined || payload === "") {
        return {
            ackCode: null,
            controlId: "",
            textMessage: "",
            errorSegment: null,
            accepted: null
        };
    }

    if (typeof payload === "string") {
        const trimmed = stripBom(payload).trim();
        if (trimmed.startsWith("{")) {
            try {
                const parsedJson = JSON.parse(trimmed);
                if (parsedJson && typeof parsedJson === "object") {
                    return parseHl7v2Ack(parsedJson);
                }
            } catch (err) {
                // Fall through to ER7 parsing
            }
        }
        return parseEr7AckString(trimmed);
    }

    if (typeof payload === "object" && !Array.isArray(payload)) {
        const rawAckText = typeof payload.ack === "string"
            ? payload.ack
            : (typeof payload.hl7Ack === "string" ? payload.hl7Ack : (typeof payload.rawAck === "string" ? payload.rawAck : ""));

        const base = rawAckText ? parseEr7AckString(rawAckText) : {
            ackCode: null,
            controlId: "",
            textMessage: "",
            errorSegment: null,
            accepted: null
        };

        if (typeof payload.ackCode === "string" && payload.ackCode.trim()) {
            base.ackCode = payload.ackCode.trim().toUpperCase();
        }
        if (!base.controlId && typeof (payload.controlId || payload.messageControlId) === "string") {
            base.controlId = (payload.controlId || payload.messageControlId).trim();
        }

        const extraMsg = typeof payload.message === "string"
            ? payload.message.trim()
            : (typeof payload.textMessage === "string" ? payload.textMessage.trim() : (typeof payload.error === "string" ? payload.error.trim() : ""));
        if (extraMsg) {
            if (!base.textMessage) {
                base.textMessage = extraMsg;
            } else if (!base.textMessage.includes(extraMsg)) {
                base.textMessage = `${base.textMessage}; ${extraMsg}`;
            }
        }

        if (!base.errorSegment && typeof payload.errorSegment === "string" && payload.errorSegment.trim()) {
            base.errorSegment = payload.errorSegment.trim();
        }

        if (base.ackCode && ACCEPTED_ACK_CODES.has(base.ackCode)) {
            base.accepted = true;
        } else if (base.ackCode && REJECTED_ACK_CODES.has(base.ackCode)) {
            base.accepted = false;
        } else if (typeof payload.accepted === "boolean") {
            base.accepted = payload.accepted;
        } else if (typeof payload.status === "string") {
            const st = payload.status.trim().toLowerCase();
            if (st === "accepted" || st === "ok" || st === "sent" || st === "queued") {
                base.accepted = true;
            } else if (st === "rejected" || st === "error" || st === "nack" || st === "failed") {
                base.accepted = false;
            }
        }

        return base;
    }

    return {
        ackCode: null,
        controlId: "",
        textMessage: "",
        errorSegment: null,
        accepted: null
    };
}

function validateGatewayUrl(gatewayUrl) {
    if (typeof gatewayUrl !== "string" || !gatewayUrl.trim()) {
        throw httpError(400, "HL7v2 gateway URL is required.");
    }
    let parsed;
    try {
        parsed = new URL(gatewayUrl.trim());
    } catch (err) {
        throw httpError(400, "HL7v2 gateway URL must be a valid URL.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw httpError(400, "HL7v2 gateway URL must start with http:// or https://.");
    }
    return parsed.toString();
}

function buildTimeoutSignal(options) {
    const timeoutMs = options && options.timeoutMs !== undefined ? Number(options.timeoutMs) : DEFAULT_GATEWAY_TIMEOUT_MS;
    if (Number.isFinite(timeoutMs) && timeoutMs > 0 && global.AbortSignal && typeof global.AbortSignal.timeout === "function") {
        return global.AbortSignal.timeout(timeoutMs);
    }
    return undefined;
}

export async function sendHl7v2ToGateway(gatewayUrl, hl7v2Message, auth = {}, options = {}) {
    const targetUrl = validateGatewayUrl(gatewayUrl);

    if (typeof hl7v2Message !== "string") {
        throw httpError(400, "HL7v2 message must be a non-empty string starting with MSH.");
    }
    const stripped = stripBom(hl7v2Message).trim();
    if (!stripped || !stripped.startsWith("MSH") || stripped.length < 4) {
        throw httpError(400, "HL7v2 message must be a non-empty string starting with MSH.");
    }

    const format = (options && options.format) || "json_envelope";
    if (format !== "json_envelope" && format !== "raw_er7") {
        throw httpError(400, `Unsupported HL7v2 gateway wire format '${format}'.`);
    }

    const msh = extractMshMetadata(hl7v2Message);
    const baseHeaders = {};
    let serializedBody;

    if (format === "raw_er7") {
        baseHeaders["Content-Type"] = "application/hl7-v2; charset=utf-8";
        baseHeaders.Accept = "application/hl7-v2, application/json, text/plain";
        serializedBody = stripBom(hl7v2Message).replace(/\r\n|\n/g, "\r");
    } else {
        baseHeaders["Content-Type"] = "application/json";
        baseHeaders.Accept = "application/json, application/hl7-v2, text/plain";
        const metadata = {
            messageType: msh.messageType,
            messageControlId: msh.messageControlId,
            correlationId: (options && options.correlationId) || msh.messageControlId
        };
        if (options && options.customerId) {
            metadata.customerId = options.customerId;
        }
        serializedBody = JSON.stringify({
            message: hl7v2Message,
            encoding: (options && options.encoding) || msh.charset || "UTF-8",
            metadata
        });
    }

    if (msh.messageControlId) {
        baseHeaders["Idempotency-Key"] = msh.messageControlId;
    }
    if (options && typeof options.requestId === "string" && options.requestId.trim()) {
        baseHeaders["X-Request-Id"] = options.requestId.trim();
    }
    if (options && typeof options.traceparent === "string" && options.traceparent.trim()) {
        baseHeaders.traceparent = options.traceparent.trim();
    }

    const doFetch = (options && options.fetchImpl) || global.fetch;
    const secretResolver = options && options.secretResolver;
    let headers = await buildOutboundHeaders(auth, {
        secretResolver,
        fetchImpl: doFetch,
        baseHeaders
    });

    const performFetch = async (reqHeaders) => {
        const signal = buildTimeoutSignal(options);
        const init = {
            method: "POST",
            headers: reqHeaders,
            body: serializedBody
        };
        if (signal) {
            init.signal = signal;
        }
        return doFetch(targetUrl, init);
    };

    let response;
    try {
        response = await performFetch(headers);
    } catch (err) {
        throw httpError(502, `HL7v2 gateway request failed: ${err.message}`);
    }

    if (response && response.status === 401 && isRefreshableAuth(auth)) {
        invalidateAuthSecrets(auth, secretResolver);
        headers = await buildOutboundHeaders(auth, {
            secretResolver,
            fetchImpl: doFetch,
            baseHeaders
        });
        try {
            response = await performFetch(headers);
        } catch (err) {
            throw httpError(502, `HL7v2 gateway request failed: ${err.message}`);
        }
    }

    const rawText = await response.text();
    let parsedBody;
    try {
        parsedBody = rawText ? JSON.parse(rawText) : undefined;
    } catch (err) {
        parsedBody = undefined;
    }

    if (!response.ok) {
        const detail = parsedBody !== undefined ? parsedBody : rawText.slice(0, 500);
        throw httpError(502, `HL7v2 gateway returned HTTP ${response.status}.`, detail);
    }

    const ack = parseHl7v2Ack(parsedBody !== undefined ? parsedBody : rawText);
    const requireApplicationAck = !(options && options.requireApplicationAck === false);

    if (requireApplicationAck && ack && ack.accepted === false) {
        const codeLabel = ack.ackCode || "NACK";
        const reason = ack.textMessage || "Application rejected message";
        throw httpError(422, `HL7v2 gateway returned application NACK (${codeLabel}): ${reason}`, ack);
    }

    return {
        ok: true,
        status: response.status,
        format,
        messageControlId: msh.messageControlId,
        ack
    };
}
