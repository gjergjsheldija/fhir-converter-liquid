import {mkdir, writeFile} from "fs/promises";
import {dirname, resolve} from "path";
import swaggerJSDoc from "swagger-jsdoc";
import {fileURLToPath} from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../../..");

export const DEFAULT_R2_OPENAPI_OUTPUT = resolve(repoRoot, "docs/r2-contract/openapi.json");

/**
 * @openapi
 * /api/v1/customers/{customerId}/inbound/{template}:
 *   post:
 *     operationId: convertCustomerInbound
 *     summary: Convert an inbound HL7 v2 message to a FHIR Bundle for a customer
 *     description: "Converts an HL7 v2 message using customers/{customerId}/input/{template}.liquid (with fallback to built-in Hl7v2/ templates unless defaults.fallbackToBuiltin is false) and optionally delivers the resulting FHIR Bundle to targets.fhirServer when deliver=true or defaults.autoDeliverInbound is enabled. Today the service emits FHIR R4 (R4 vs R4B is tracked in R2-1967) and returns 400 for HL7 v2 parse errors and downstream FHIR target failures (422 and FHIR-target 502/504 are tracked as gaps in specs/r2-boundary/02-typed-openapi-for-customer-routes.md)."
 *     tags:
 *       - Customer Pipelines
 *     security:
 *       - CustomerApiKey: []
 *       - ConvertBearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CustomerIdParam'
 *       - name: template
 *         in: path
 *         required: true
 *         description: Inbound Liquid template name (e.g. ADT_A01, MDM_T02).
 *         schema:
 *           type: string
 *           example: ADT_A01
 *       - name: deliver
 *         in: query
 *         required: false
 *         description: When true or 1, delivers the converted FHIR Bundle to targets.fhirServer.
 *         schema:
 *           type: boolean
 *       - $ref: '#/components/parameters/RequestIdHeader'
 *       - $ref: '#/components/parameters/TraceparentHeader'
 *       - $ref: '#/components/parameters/TimezoneHeader'
 *     requestBody:
 *       required: true
 *       description: "Raw HL7 v2 ER7 message or JSON envelope { srcData: '<HL7v2>' }."
 *       content:
 *         application/hl7-v2:
 *           schema:
 *             type: string
 *         text/plain:
 *           schema:
 *             type: string
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - srcData
 *             properties:
 *               srcData:
 *                 type: string
 *                 description: HL7 v2 ER7 message text.
 *     responses:
 *       '200':
 *         description: Converted FHIR Bundle and optional FHIR delivery status.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/InboundResult'
 *       '400':
 *         description: Invalid customerId/template/input, HL7 v2 conversion error, missing targets.fhirServer.baseUrl, or downstream FHIR target non-2xx / transport / timeout failure (see spec 02 gaps).
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '401':
 *         description: Missing or invalid per-customer inbound credential or CONVERT_API_KEY Bearer token.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '403':
 *         description: Outbound delivery is disabled (ENABLE_OUTBOUND_DELIVERY=false).
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '404':
 *         description: Customer or inbound template not found.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '502':
 *         description: Downstream OAuth2 client_credentials token endpoint failed while authenticating outbound FHIR delivery.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 */

/**
 * @openapi
 * /api/v1/customers/{customerId}/outbound/{template}:
 *   post:
 *     operationId: convertCustomerOutbound
 *     summary: Convert an outbound FHIR Bundle to HL7 v2 for a customer
 *     description: "Converts a self-contained FHIR R4 Bundle using customers/{customerId}/output/{template}.liquid (with fallback to built-in FhirToHl7v2/ templates) and optionally posts the rendered HL7 v2 message to targets.hl7v2Gateway with MSA ACK verification when deliver=true."
 *     tags:
 *       - Customer Pipelines
 *     security:
 *       - CustomerApiKey: []
 *       - ConvertBearerAuth: []
 *     parameters:
 *       - $ref: '#/components/parameters/CustomerIdParam'
 *       - name: template
 *         in: path
 *         required: true
 *         description: Outbound Liquid template name (e.g. MDM_T02, ADT_A03, ORU_R01).
 *         schema:
 *           type: string
 *           example: MDM_T02
 *       - name: deliver
 *         in: query
 *         required: false
 *         description: When true or 1, posts the rendered HL7 v2 message to targets.hl7v2Gateway.
 *         schema:
 *           type: boolean
 *       - $ref: '#/components/parameters/RequestIdHeader'
 *       - $ref: '#/components/parameters/TraceparentHeader'
 *       - $ref: '#/components/parameters/TimezoneHeader'
 *     requestBody:
 *       required: true
 *       description: "Self-contained FHIR Bundle (document or collection) or JSON envelope { srcData: <Bundle> }."
 *       content:
 *         application/fhir+json:
 *           schema:
 *             $ref: '#/components/schemas/FhirBundle'
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/FhirBundle'
 *               - type: object
 *                 required:
 *                   - srcData
 *                 properties:
 *                   srcData:
 *                     $ref: '#/components/schemas/FhirBundle'
 *     responses:
 *       '200':
 *         description: "Rendered HL7 v2 message and optional gateway delivery/ACK metadata (or raw ER7 when Accept is application/hl7-v2 and deliver is false)."
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OutboundResult'
 *           application/hl7-v2:
 *             schema:
 *               type: string
 *       '400':
 *         description: Invalid customerId/template/input, outbound conversion error, or missing targets.hl7v2Gateway.baseUrl.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '401':
 *         description: Missing or invalid per-customer inbound credential or CONVERT_API_KEY Bearer token.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '403':
 *         description: Outbound delivery is disabled (ENABLE_OUTBOUND_DELIVERY=false).
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '404':
 *         description: Customer or outbound template not found.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '422':
 *         description: Missing required hospital correlation ID (PID-3 / PV1-19), empty HL7 v2 output, or HL7 v2 gateway Application NACK (AE/AR).
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 *       '502':
 *         description: Downstream HL7 v2 gateway transport error or OAuth2 token endpoint failure.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OperationOutcome'
 */

/**
 * @openapi
 * /healthz:
 *   get:
 *     operationId: getHealthz
 *     summary: Liveness probe
 *     description: Returns 200 OK when the HTTP server process is alive.
 *     tags:
 *       - Health
 *     parameters:
 *       - $ref: '#/components/parameters/RequestIdHeader'
 *       - $ref: '#/components/parameters/TraceparentHeader'
 *     responses:
 *       '200':
 *         description: Process is alive.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 */

/**
 * @openapi
 * /readyz:
 *   get:
 *     operationId: getReadyz
 *     summary: Readiness probe
 *     description: Returns 200 OK when the worker pool and template directory are ready, or 503 Service Unavailable otherwise.
 *     tags:
 *       - Health
 *     parameters:
 *       - $ref: '#/components/parameters/RequestIdHeader'
 *       - $ref: '#/components/parameters/TraceparentHeader'
 *     responses:
 *       '200':
 *         description: Service is ready to handle conversion requests.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 *       '503':
 *         description: Worker pool or templates are not ready.
 *         headers:
 *           X-Request-Id:
 *             $ref: '#/components/headers/X-Request-Id'
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ReadinessResponse'
 */

const R2_OPENAPI_DEFINITION = {
    openapi: "3.0.3",
    info: {
        title: "FHIR Converter Mapper — R2 Boundary API",
        version: "0.2.0",
        description:
            "Typed OpenAPI 3.0.3 contract for the stateless mapper customer pipeline routes and Kubernetes health probes."
    },
    components: {
        securitySchemes: {
            CustomerApiKey: {
                type: "apiKey",
                in: "header",
                name: "X-Customer-Key",
                description:
                    "Per-customer inbound API key configured in `customers/{customerId}/config.yaml` (`inboundAuth`). Header name is configurable per customer and defaults to `X-Customer-Key`."
            },
            ConvertBearerAuth: {
                type: "http",
                scheme: "bearer",
                description:
                    "Bearer token matching `CONVERT_API_KEY` (when customer `inboundAuth` is not configured) or a per-customer Bearer inbound credential."
            }
        },
        parameters: {
            CustomerIdParam: {
                name: "customerId",
                in: "path",
                required: true,
                description: "Customer identifier matching `^[a-z0-9][a-z0-9._-]{0,62}$`.",
                schema: {
                    type: "string",
                    pattern: "^[a-z0-9][a-z0-9._-]{0,62}$",
                    example: "example-hospital"
                }
            },
            RequestIdHeader: {
                name: "X-Request-Id",
                in: "header",
                required: false,
                description:
                    "Correlation ID propagated gateway -> mapper -> R2. Must match `^[A-Za-z0-9._:/-]+$` (max 128 chars); generated as UUIDv4 if absent or invalid.",
                schema: {
                    type: "string",
                    maxLength: 128,
                    pattern: "^[A-Za-z0-9._:/-]+$"
                }
            },
            TraceparentHeader: {
                name: "traceparent",
                in: "header",
                required: false,
                description: "W3C Trace Context header propagated gateway -> mapper -> R2 (max 128 chars).",
                schema: {
                    type: "string",
                    maxLength: 128
                }
            },
            TimezoneHeader: {
                name: "timezone",
                in: "header",
                required: false,
                description:
                    "Optional timezone offset override (e.g. `+0100`, `UTC`) for HL7 v2 date/time formatting; defaults to customer `hl7v2.timezone`.",
                schema: {
                    type: "string",
                    example: "+0100"
                }
            }
        },
        headers: {
            "X-Request-Id": {
                description: "Echoed or mapper-generated correlation ID.",
                schema: {
                    type: "string"
                }
            }
        },
        schemas: {
            FhirBundle: {
                type: "object",
                required: ["resourceType"],
                properties: {
                    resourceType: {
                        type: "string",
                        enum: ["Bundle"]
                    },
                    id: {
                        type: "string"
                    },
                    type: {
                        type: "string",
                        enum: ["batch", "transaction", "collection", "document", "transaction-response"]
                    },
                    timestamp: {
                        type: "string",
                        format: "date-time"
                    },
                    identifier: {
                        type: "object",
                        properties: {
                            system: {type: "string"},
                            value: {type: "string"}
                        }
                    },
                    entry: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                fullUrl: {type: "string"},
                                resource: {
                                    type: "object",
                                    properties: {
                                        resourceType: {type: "string"},
                                        id: {type: "string"}
                                    },
                                    additionalProperties: true
                                },
                                request: {
                                    type: "object",
                                    properties: {
                                        method: {type: "string"},
                                        url: {type: "string"},
                                        ifNoneExist: {type: "string"}
                                    }
                                }
                            },
                            additionalProperties: true
                        }
                    }
                },
                additionalProperties: true
            },
            FhirDeliveryResult: {
                type: "object",
                required: ["ok", "status"],
                properties: {
                    ok: {type: "boolean"},
                    status: {type: "integer", example: 200},
                    location: {type: "string"},
                    body: {
                        description: "Parsed JSON response body (e.g. FHIR transaction-response Bundle) or truncated text.",
                        oneOf: [
                            {type: "object", additionalProperties: true},
                            {type: "string"}
                        ]
                    }
                }
            },
            InboundResult: {
                type: "object",
                required: ["fhirResource"],
                properties: {
                    fhirResource: {
                        $ref: "#/components/schemas/FhirBundle"
                    },
                    delivery: {
                        $ref: "#/components/schemas/FhirDeliveryResult"
                    },
                    unmapped: {
                        type: "array",
                        description: "Unmapped Codings not rewritten by the customer site pack, when present.",
                        items: {
                            type: "object",
                            additionalProperties: true
                        }
                    }
                },
                additionalProperties: true
            },
            Hl7v2Ack: {
                type: "object",
                properties: {
                    ackCode: {type: "string", nullable: true, example: "AA"},
                    controlId: {type: "string"},
                    accepted: {type: "boolean", nullable: true},
                    textMessage: {type: "string"}
                },
                additionalProperties: true
            },
            Hl7v2DeliveryResult: {
                type: "object",
                required: ["ok", "status", "format"],
                properties: {
                    ok: {type: "boolean"},
                    status: {type: "integer", example: 200},
                    format: {type: "string", enum: ["json_envelope", "raw_er7"]},
                    messageControlId: {type: "string"},
                    ack: {
                        $ref: "#/components/schemas/Hl7v2Ack"
                    }
                }
            },
            OutboundResult: {
                type: "object",
                required: ["hl7v2Message"],
                properties: {
                    hl7v2Message: {
                        type: "string",
                        description: "Rendered HL7 v2 ER7 message."
                    },
                    messageType: {type: "string", example: "MDM^T02^MDM_T02"},
                    messageControlId: {type: "string"},
                    segmentCount: {type: "integer"},
                    delivery: {
                        $ref: "#/components/schemas/Hl7v2DeliveryResult"
                    }
                },
                additionalProperties: true
            },
            OperationOutcomeIssue: {
                type: "object",
                required: ["severity", "code", "diagnostics"],
                properties: {
                    severity: {
                        type: "string",
                        enum: ["fatal", "error", "warning", "information"]
                    },
                    code: {
                        type: "string",
                        enum: ["invalid", "login", "forbidden", "not-found", "conflict", "processing", "transient", "timeout", "exception"]
                    },
                    diagnostics: {
                        type: "string"
                    }
                }
            },
            OperationOutcome: {
                type: "object",
                required: ["resourceType", "issue"],
                properties: {
                    resourceType: {
                        type: "string",
                        enum: ["OperationOutcome"]
                    },
                    id: {
                        type: "string",
                        description: "Matches X-Request-Id when present."
                    },
                    issue: {
                        type: "array",
                        minItems: 1,
                        items: {
                            $ref: "#/components/schemas/OperationOutcomeIssue"
                        }
                    },
                    requestId: {
                        type: "string"
                    },
                    phase: {
                        type: "string",
                        enum: ["conversion", "delivery"]
                    },
                    detail: {
                        description: "Optional downstream error payload or gateway ACK metadata.",
                        oneOf: [
                            {type: "object", additionalProperties: true},
                            {type: "string"}
                        ]
                    }
                }
            },
            HealthResponse: {
                type: "object",
                required: ["status"],
                properties: {
                    status: {
                        type: "string",
                        enum: ["OK"]
                    }
                }
            },
            ReadinessResponse: {
                type: "object",
                required: ["status"],
                properties: {
                    status: {
                        type: "string",
                        enum: ["READY", "NOT_READY"]
                    },
                    workers: {
                        type: "object",
                        additionalProperties: true
                    }
                }
            }
        }
    }
};

export function buildR2OpenApiSpec() {
    return swaggerJSDoc({
        failOnErrors: true,
        definition: R2_OPENAPI_DEFINITION,
        apis: [fileURLToPath(import.meta.url).replace(/\\/g, "/")]
    });
}

export async function exportR2OpenApiSpec(outputPath = DEFAULT_R2_OPENAPI_OUTPUT) {
    const spec = buildR2OpenApiSpec();
    await mkdir(dirname(outputPath), {recursive: true});
    await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");
    return spec;
}
