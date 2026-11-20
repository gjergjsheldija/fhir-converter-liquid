// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import * as constants from "./lib/constants/constants.js";
import {
    AVAILABLE_PARSERS,
    BASE_TEMPLATE_FILES_LOCATION,
    CODE_MIRROR_LOCATION,
    SAMPLE_DATA_LOCATION,
    STATIC_LOCATION,
    TEMPLATE_FILES_LOCATION,
    USER_SAMPLE_DATA_LOCATION
} from "./lib/constants/constants.js";
import dataHandlerFactory from "./lib/dataHandler/dataHandlerFactory.js";
import cookieParser from "cookie-parser";
import {errorCodes, errorMessage} from "./lib/error/error.js";
import bodyparser from "body-parser";
import swaggeruiexpress from "swagger-ui-express";
import swaggerJSDoc from "swagger-jsdoc";
import WorkerPool from "./lib/workers/workerPool.js";
import fileSystemCache from "./lib/fsCache/cache.js";
import customLogging from "./lib/logging/custom.js";
import promMid from "express-prom-bundle";
import express from "express";
import os from "os";
import {fileURLToPath} from "url";
import {readFileSync} from "fs";
import {access, mkdir, readFile, readdir, stat, unlink, writeFile} from "fs/promises";
import {dirname, join, resolve} from "path";
import {external as libraryFilters} from "./lib/liquid-converter/liquid-helpers.js";
import {convertInlineHl7v2} from "./lib/workers/worker.js";
import {chooseLocalFolder, listFolder, listGithub, readFolderFile, readGithubFile} from "./lib/browse/sources.js";
import {fieldMapArchive, fieldMapFiles} from "../scripts/hl7-fhir-map.mjs";
import {sendResource, validateResource} from "./lib/fhir/sendResource.js";
import {createProject} from "./lib/projects/createProject.js";
import {openLocalProject} from "./lib/projects/openProject.js";
import {openGithubProject} from "./lib/projects/openGithubProject.js";
import {listProjectFiles, readProjectFile, writeProjectFile} from "./lib/projects/projectFiles.js";
import {prepareProjectConversion} from "./lib/projects/convertProject.js";
import {applySitePack, collectUnmapped, loadSitePack} from "./lib/projects/sitePack.js";
import {copyOfficialHl7v2Samples} from "./lib/projects/officialSamples.js";
import {appendFailure, controlIdOf, listFailures} from "./lib/conversions/failureLog.js";
import {appendAudit, authorizeConvert} from "./lib/conversions/convertAudit.js";

const {json, text} = bodyparser;

const {serve, setup} = swaggeruiexpress;

const metricsMiddleware = promMid({includeMethod: true});

const __filename = fileURLToPath(import.meta.url);

export default function (app) {
    const workerPool = new WorkerPool(
        "./src/lib/workers/worker.js",
        Math.max(1, os.cpus().length)
    );
    let templateCache = new fileSystemCache(TEMPLATE_FILES_LOCATION);
    templateCache.init();
    let sampleDataLocation = SAMPLE_DATA_LOCATION;
    let userSampleDataLocation = USER_SAMPLE_DATA_LOCATION;
    let messageCache = new fileSystemCache(sampleDataLocation);
    messageCache.init();

    app.use(metricsMiddleware);
    app.use(customLogging());
    app.use(json({limit: "50mb", extended: true}));
    app.use(text({limit: "50mb", extended: true}));
    app.use(express.static(STATIC_LOCATION));
    app.use("/codemirror", express.static(CODE_MIRROR_LOCATION));

    // access function for constants (test instrumentation)
    app.getConstants = function () {
        return constants;
    };

    // access function for constants  (test instrumentation)
    app.setConstants = function (c) {
        templateCache = new fileSystemCache(c.TEMPLATE_FILES_LOCATION);
        sampleDataLocation = c.SAMPLE_DATA_LOCATION;
        userSampleDataLocation = c.USER_SAMPLE_DATA_LOCATION;
        messageCache = new fileSystemCache(sampleDataLocation);
        workerPool.broadcast({type: "constantsUpdated", data: JSON.stringify(c)});
    };

    const swaggerSpec = swaggerJSDoc({
        swaggerDefinition: {
            info: {
                title: "FHIR Converter API",
                // If changing the version update the checks in convert/hl7 and convert/hl7/:template
                version: "1.0",
            },
        },
        apis: [__filename],
    });

    app.use("/api-docs", serve, setup(swaggerSpec));

    app.get("/api-docs.json", (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.send(swaggerSpec);
    });

    app.use(cookieParser());

    /**
     * @swagger
     * /api/v1/helpers:
     *   get:
     *     description: Lists the filters registered by this server
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: Array of {name, description} objects for the filters registered by this server
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/helpers", function (req, res) {
        res.status(200).json({
            helpers: libraryFilters.map(function (filter) {
                return {
                    name: filter.name,
                    description: filter.description || ""
                };
            })
        });
    });

    /**
     * @swagger
     * /api/v1/parsers:
     *   get:
     *     description: Lists available parsers
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: List of available parsers
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/parsers", function (req, res) {
        if (dataHandlerFactory.listParsers(AVAILABLE_PARSERS).length == 0) {
            res.status(404);
            res.json(
                errorMessage(errorCodes.NotFound, "Unable to access parsers location")
            );
        } else {
            res.json(dataHandlerFactory.listParsers(AVAILABLE_PARSERS));
        }
    });

    /**
     * @swagger
     * /api/v1/sample-data:
     *   get:
     *     description: Lists available sample data
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: List of available sample data
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/sample-data", function (req, res) {
        messageCache
            .keys()
            .then(async (files) => {
                const entries = files.map((f) => {
                    return {messageName: f, source: "builtin"};
                });
                const byName = {};
                entries.forEach((entry) => {
                    byName[entry.messageName] = entry;
                });
                try {
                    const userFiles = await readdir(join(userSampleDataLocation, "hl7v2"));
                    userFiles
                        .filter((f) => !f.startsWith("."))
                        .forEach((f) => {
                            const name = "hl7v2/" + f;
                            if (byName[name]) {
                                byName[name].source = "user";
                            } else {
                                const entry = {messageName: name, source: "user"};
                                entries.push(entry);
                                byName[name] = entry;
                            }
                        });
                } catch (userDirError) {
                    // user sample directory does not exist yet; bundled samples only
                }
                res.json({messages: entries});
            })
            .catch(() => {
                res.status(404);
                res.json(
                    errorMessage(
                        errorCodes.NotFound,
                        "Unable to access sample data location"
                    )
                );
            });
    });

    /**
     * @swagger
     * /api/v1/sample-data/{file}:
     *   get:
     *     description: Returns a specific sample data
     *     produces:
     *       - text/plain
     *     parameters:
     *       - name: file
     *         description: Name of a specific file
     *         in: path
     *         required: true
     *         type: string
     *     responses:
     *       200:
     *         description: A specific sample data
     *       401:
     *         description: Unauthorized
     */
    app.get("/api/v1/sample-data/:type/:file", function (req, res) {
        const type = req.params.type;
        const file = req.params.file;
        if (type !== "hl7v2" || !/^[A-Za-z0-9._-]+$/.test(file)) {
            res.status(404);
            res.json(errorMessage(errorCodes.NotFound, "Sample data not found"));
            return;
        }
        const key = type + "/" + file;
        access(join(userSampleDataLocation, key))
            .then(() => readFile(join(userSampleDataLocation, key)))
            .catch(() => messageCache.get(key))
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Sample data not found"));
            });
    });

    app.put("/api/v1/sample-data/hl7v2/:file", function (req, res) {
        let fileName = req.params.file;
        if (!fileName || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
            res.status(400);
            res.json(errorMessage(errorCodes.BadRequest, "Invalid sample file name."));
            return;
        }
        if (!/\.(hl7|txt|msg)$/.test(fileName)) {
            if (/\.[A-Za-z0-9]+$/.test(fileName)) {
                res.status(400);
                res.json(errorMessage(errorCodes.BadRequest, "Sample file must end in .hl7, .txt, or .msg."));
                return;
            }
            fileName += ".hl7";
        }
        const body = typeof req.body === "string" ? req.body : "";
        if (!body.trim()) {
            res.status(400);
            res.json(errorMessage(errorCodes.BadRequest, "Sample message cannot be empty."));
            return;
        }
        if (Buffer.byteLength(body, "utf8") > 2000000) {
            res.status(400);
            res.json(errorMessage(errorCodes.BadRequest, "Sample message is too large."));
            return;
        }
        access(join(sampleDataLocation, "hl7v2", fileName))
            .then(() => {
                throw Object.assign(new Error("Built-in sample exists"), {isBuiltinConflict: true});
            })
            .catch((builtinError) => {
                if (builtinError && builtinError.isBuiltinConflict) {
                    res.status(409);
                    res.json(errorMessage(errorCodes.Conflict, "Cannot overwrite a built-in sample. Save under a new file name."));
                    return;
                }
                mkdir(join(userSampleDataLocation, "hl7v2"), {recursive: true})
                    .then(() => writeFile(join(userSampleDataLocation, "hl7v2", fileName), body, "utf8"))
                    .then(() =>
                        res.status(200).json({ok: true, messageName: "hl7v2/" + fileName, source: "user"})
                    )
                    .catch(() => {
                        res.status(500);
                        res.json(errorMessage(errorCodes.WriteError, "Unable to save sample message."));
                    });
            });
    });

    app.delete("/api/v1/sample-data/hl7v2/:file", function (req, res) {
        const fileName = req.params.file;
        if (!fileName || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
            res.status(400);
            res.json(errorMessage(errorCodes.BadRequest, "Invalid sample file name."));
            return;
        }
        unlink(join(userSampleDataLocation, "hl7v2", fileName))
            .then(() => res.status(200).json({ok: true, messageName: "hl7v2/" + fileName}))
            .catch((deleteError) => {
                if (!deleteError || deleteError.code !== "ENOENT") {
                    res.status(500);
                    res.json(errorMessage(errorCodes.WriteError, "Unable to delete sample message."));
                    return;
                }
                access(join(sampleDataLocation, "hl7v2", fileName))
                    .then(() => {
                        res.status(403);
                        res.json(errorMessage(errorCodes.Unauthorized, "Built-in samples cannot be deleted."));
                    })
                    .catch(() => {
                        res.status(404);
                        res.json(errorMessage(errorCodes.NotFound, "Sample data not found"));
                    });
            });
    });

    /**
     * @swagger
     * /api/v1/templates:
     *   get:
     *     description: Lists available templates
     *     produces:
     *       - application/json
     *     responses:
     *       200:
     *         description: List of available templates
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Templates not found
     */
    app.get("/api/v1/templates", function (req, res) {
        templateCache
            .keys()
            .then((files) =>
                res.json({
                    templates: files.map((f) => {
                        return {templateName: f};
                    }),
                })
            )
            .catch(() => {
                res.status(404);
                res.json(
                    errorMessage(
                        errorCodes.NotFound,
                        "Unable to access templates location"
                    )
                );
            });
    });

    /**
     * @swagger
     * /api/v1/templates/{file}:
     *   get:
     *     description: Returns a specific template
     *     produces:
     *       - text/plain
     *     parameters:
     *       - name: file
     *         description: Name of a specific file
     *         in: path
     *         required: true
     *         type: string
     *     responses:
     *       200:
     *         description: A specific template
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Not found
     */
    function readAiConfig() {
        try {
            const cfg = JSON.parse(readFileSync(new URL("../config/default.json", import.meta.url), "utf8"));
            return cfg.ai || {};
        } catch (err) {
            return {};
        }
    }

    function configuredProviderNames(ai) {
        const providers = (ai && ai.providers) || {};
        return Object.keys(providers).filter((name) => {
            const provider = providers[name];
            return provider && provider.baseUrl && provider.apiKeyEnv && process.env[provider.apiKeyEnv] && Array.isArray(provider.models);
        });
    }

    /**
     * @swagger
     * /api/v1/templates/{file}:
     *   put:
     *     description: Writes a Liquid template
     *     consumes:
     *       - text/plain
     */
    app.put("/api/v1/templates/:file(*)", function (req, res) {
        const key = req.params.file;
        if (!key || key.includes("..") || !key.endsWith(".liquid")) {
            res.status(400).json(errorMessage(errorCodes.BadRequest, "Invalid template name."));
            return;
        }
        const text = typeof req.body === "string" ? req.body : "";
        templateCache.set(key, text)
            .then(() => {
                const dest = join(BASE_TEMPLATE_FILES_LOCATION, key);
                return mkdir(dirname(dest), {recursive: true}).then(() => writeFile(dest, text));
            })
            .then(() => {
                res.status(200).json({ok: true});
            })
            .catch(() => {
                res.status(400).json(errorMessage(errorCodes.WriteError, "Unable to write template"));
            });
    });

    /**
     * @swagger
     * /api/v1/ai/providers:
     *   get:
     *     description: Lists AI providers that have a base URL, models, and an environment API key
     */
    app.get("/api/v1/ai/providers", function (req, res) {
        const ai = readAiConfig();
        const configured = configuredProviderNames(ai);
        const providers = ai.providers || {};
        res.json({
            providers: configured,
            available: Object.keys(providers).map((name) => ({
                name,
                label: providers[name].label || name,
                apiFormat: providers[name].apiFormat || "openai",
                requiresApiKey: providers[name].requiresApiKey !== false,
                baseUrl: providers[name].baseUrl || "",
                models: Array.isArray(providers[name].models) ? providers[name].models : [],
                configured: configured.includes(name)
            }))
        });
    });

    /**
     * @swagger
     * /api/v1/ai/models:
     *   get:
     *     description: Lists models configured for a provider
     *     parameters:
     *       - name: provider
     *         in: query
     *         type: string
     */
    app.get("/api/v1/ai/models", function (req, res) {
        const ai = readAiConfig();
        const provider = ai.providers && ai.providers[req.query.provider];
        if (!provider) {
            res.status(400).json(errorMessage(errorCodes.BadRequest, `AI provider '${req.query.provider}' is not configured.`));
            return;
        }
        res.json({models: Array.isArray(provider.models) ? provider.models : []});
    });

    /**
     * @swagger
     * /api/v1/templategenerate:
     *   post:
     *     description: Asks a configured AI provider for a Liquid template and renders it with this converter
     *     consumes:
     *       - application/json
     */
    app.post("/api/v1/templategenerate", function (req, res) {
        const body = req.body || {};
        const ai = readAiConfig();
        const maxIters = Number(body.maxIters) || ai.defaultMaxIters || 4;
        const temperature = ai.defaultTemperature != null ? ai.defaultTemperature : 0;

        const finish = (status, payload) => {
            res.status(status).json(payload);
        };

        const resolveMessage = () => {
            if (body.messageName) {
                return messageCache.get(body.messageName).then((content) => content.toString());
            }
            if (typeof body.sampleDataInline === "string" && body.sampleDataInline.length > 0) {
                return Promise.resolve(body.sampleDataInline);
            }
            const error = new Error("No message provided (neither messageName nor sampleDataInline).");
            error.status = 400;
            return Promise.reject(error);
        };

        resolveMessage()
            .then((message) => {
                if (body.confirmedExternalSend !== true) {
                    const error = new Error("External send was not confirmed.");
                    error.status = 400;
                    throw error;
                }
                const providerName = body.provider || (body.baseUrl ? "custom" : ai.defaultProvider);
                const providers = ai.providers || {};
                const knownProvider = providers[providerName] || null;
                const configured = configuredProviderNames(ai).includes(providerName);
                const inlineKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
                const inlineBaseUrl = typeof body.baseUrl === "string" ? body.baseUrl.trim() : "";

                let apiKey = "";
                let baseUrl = "";
                let apiFormat = knownProvider && knownProvider.apiFormat ? knownProvider.apiFormat : "openai";

                if (inlineBaseUrl && inlineKey) {
                    apiKey = inlineKey;
                    baseUrl = inlineBaseUrl;
                } else if (knownProvider && inlineKey) {
                    apiKey = inlineKey;
                    baseUrl = inlineBaseUrl || knownProvider.baseUrl || "";
                } else if (knownProvider && knownProvider.requiresApiKey === false && (inlineBaseUrl || knownProvider.baseUrl)) {
                    apiKey = inlineKey || (knownProvider.apiKeyEnv ? (process.env[knownProvider.apiKeyEnv] || "") : "");
                    baseUrl = inlineBaseUrl || knownProvider.baseUrl;
                } else if (configured && knownProvider) {
                    apiKey = process.env[knownProvider.apiKeyEnv];
                    baseUrl = inlineBaseUrl || knownProvider.baseUrl;
                } else {
                    const error = new Error(`AI provider '${providerName}' is not configured.`);
                    error.status = 400;
                    throw error;
                }

                const defaultModel = knownProvider && Array.isArray(knownProvider.models) && knownProvider.models.length > 0
                    ? knownProvider.models[0]
                    : "";
                const resolvedModel = (typeof body.model === "string" && body.model.trim()) ? body.model.trim() : defaultModel;

                return import("./lib/ai/generateTemplate.js").then((aiModule) => {
                    return runGenerateLoop(aiModule, {
                        message,
                        providerName,
                        apiFormat,
                        apiKey,
                        baseUrl,
                        model: resolvedModel,
                        prompt: body.prompt,
                        timezone: body.timezone,
                        maxIters,
                        temperature
                    });
                });
            })
            .then((payload) => finish(200, payload))
            .catch((err) => {
                if (err && err.error && err.error.code === errorCodes.NotFound) {
                    finish(404, errorMessage(errorCodes.NotFound, "Sample data not found."));
                    return;
                }
                const message = err && err.message ? err.message : "Conversion failed.";
                const payload = errorMessage(errorCodes.BadRequest, message);
                if (err && err.iterations) {
                    payload.iterations = err.iterations;
                }
                finish(400, payload);
            });

        function runGenerateLoop(aiModule, options) {
            let currentTemplate = "";
            let lastError = "";
            const step = (i) => {
                const prompt = i === 1
                    ? aiModule.buildInitialPrompt(options.message, options.prompt)
                    : aiModule.buildFixPrompt(currentTemplate, lastError, "");
                return aiModule.callExternalAI({
                    provider: options.providerName,
                    apiFormat: options.apiFormat,
                    model: options.model,
                    apiKey: options.apiKey,
                    baseUrl: options.baseUrl,
                    temperature: options.temperature,
                    prompt: prompt
                }).then((template) => {
                    currentTemplate = template;
                    return convertInlineHl7v2({
                        srcDataType: "hl7v2",
                        srcData: options.message,
                        template: template,
                        templatesOverride: {},
                        timezone: options.timezone
                    }).then((result) => {
                        const bodyResult = result.resultMsg || {};
                        return {
                            generated: template,
                            fhirResource: bodyResult.fhirResource,
                            unusedSegments: Array.isArray(bodyResult.unusedSegments) ? bodyResult.unusedSegments : [],
                            iterations: i,
                            provider: options.providerName,
                            model: options.model,
                            temperature: options.temperature
                        };
                    });
                }).catch((err) => {
                    if (err && err.resultMsg && err.resultMsg.error) {
                        lastError = err.resultMsg.error.message;
                    } else if (err instanceof Error) {
                        lastError = err.message.startsWith("AI provider request failed")
                            ? err.message
                            : `AI provider request failed: ${err.message}`;
                    } else {
                        lastError = "Conversion failed.";
                    }
                    if (i >= options.maxIters) {
                        const done = new Error(lastError);
                        done.status = 400;
                        done.iterations = options.maxIters;
                        throw done;
                    }
                    return step(i + 1);
                });
            };
            return step(1);
        }
    });

    function browseError(res, err) {
        const status = err && err.status ? err.status : 400;
        const payload = errorMessage(status === 404 ? errorCodes.NotFound : errorCodes.BadRequest, err && err.message ? err.message : "Browse failed.");
        if (err && err.detail) {
            payload.detail = err.detail;
        }
        res.status(status).json(payload);
    }

    app.post("/api/v1/browse/github", function (req, res) {
        const body = req.body || {};
        const action = body.file ? readGithubFile(body.repo, body.path, body.token) : listGithub(body.repo, body.path, body.token);
        action.then((result) => {
            if (typeof result === "string") {
                res.type("text/plain").send(result);
                return;
            }
            res.json(result);
        }).catch((err) => browseError(res, err));
    });

    app.post("/api/v1/browse/choose-folder", function (req, res) {
        chooseLocalFolder()
            .then((result) => res.json(result))
            .catch((err) => browseError(res, err));
    });

    app.post("/api/v1/field-map", function (req, res) {
        const requested = req.body && typeof req.body.path === "string" ? req.body.path.trim() : "";
        const dir = requested || join(BASE_TEMPLATE_FILES_LOCATION, "Hl7v2");
        stat(dir)
            .then((info) => {
                if (!info.isDirectory()) {
                    res.status(400).json(errorMessage(errorCodes.BadRequest, "Choose a folder of HL7v2 templates."));
                    return;
                }
                if (req.body && req.body.write) {
                    const files = fieldMapFiles(dir);
                    if (!files) {
                        res.status(400).json(errorMessage(errorCodes.BadRequest, "This folder has no HL7v2 message templates."));
                        return;
                    }
                    const outDir = requested
                        ? join(dir, "mappings")
                        : resolve(dirname(BASE_TEMPLATE_FILES_LOCATION), "../docs/mappings");
                    const written = [
                        ["hl7v2-field-map.md", files.markdown],
                        ["hl7v2-field-map.html", files.html],
                        ["hl7v2-field-map.conceptmap.json", files.conceptMap]
                    ];
                    mkdir(outDir, {recursive: true})
                        .then(() => Promise.all(written.map(([name, contents]) => writeFile(join(outDir, name), contents))))
                        .then(() => res.json({dir: outDir, files: written.map(([name]) => name), conceptMap: JSON.parse(files.conceptMap)}))
                        .catch(() => {
                            res.status(400).json(errorMessage(errorCodes.BadRequest, "Could not write the field maps."));
                        });
                    return;
                }
                const archive = fieldMapArchive(dir);
                if (!archive) {
                    res.status(400).json(errorMessage(errorCodes.BadRequest, "This folder has no HL7v2 message templates."));
                    return;
                }
                res.setHeader("Content-Type", "application/zip");
                res.setHeader("Content-Disposition", "attachment; filename=\"hl7v2-field-map.zip\"");
                res.send(archive);
            })
            .catch(() => {
                res.status(404).json(errorMessage(errorCodes.NotFound, "Folder not found."));
            });
    });

    app.post("/api/v1/browse/folder", function (req, res) {
        const body = req.body || {};
        const action = body.file ? readFolderFile(body.path) : listFolder(body.path);
        action.then((result) => {
            if (typeof result === "string") {
                res.type("text/plain").send(result);
                return;
            }
            res.json(result);
        }).catch((err) => browseError(res, err));
    });

    app.post("/api/v1/fhir/send", function (req, res) {
        const body = req.body || {};
        sendResource(body.baseUrl, body.resource, body, {conditional: body.conditional === true})
            .then((result) => res.json(result))
            .catch((err) => browseError(res, err));
    });

    app.post("/api/v1/fhir/validate", function (req, res) {
        const body = req.body || {};
        validateResource(body.baseUrl, body.resource, body, {profile: body.profile})
            .then((result) => {
                if (result.ok) {
                    res.json(result);
                    return;
                }
                const error = new Error(`FHIR server returned ${result.status}.`);
                error.status = 400;
                error.detail = result;
                throw error;
            })
            .catch((err) => browseError(res, err));
    });

    app.get("/api/v1/templates/:file(*)", function (req, res) {
        templateCache
            .get(req.params.file)
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Template not found"));
            });
    });

    // Failure log for POST /api/v1/convert/:srcDataType and POST /api/v1/projects/convert only.
    const conversionCounts = {failed: 0, succeeded: 0};

    // One audit line per convert attempt: status, template, MSH-10. Never the body or the key.
    function auditConvert(status, template, srcData) {
        try {
            appendAudit({
                status,
                template: typeof template === "string" ? template : "",
                controlId: controlIdOf(srcData)
            });
        } catch (err) {
            // an audit write problem must not change the convert response
        }
    }

    // CONVERT_API_KEY is read on each request. Empty or unset leaves the three convert routes open.
    function requireConvertKey(templateOf) {
        return function (req, res, next) {
            if (authorizeConvert(process.env.CONVERT_API_KEY, req.headers.authorization)) {
                next();
                return;
            }
            // 401: the request body is not read, so MSH-10 stays empty.
            const template = templateOf ? templateOf(req) : "";
            try {
                appendAudit({status: 401, template});
            } catch (err) {
                // an audit write problem must not change the response
            }
            res.status(401).json(errorMessage(errorCodes.Unauthorized, "Convert API key is required."));
        };
    }

    function recordConversion(status, resultMessage, srcData, template) {
        auditConvert(status, template, srcData);
        if (status === 200) {
            conversionCounts.succeeded++;
            return;
        }
        conversionCounts.failed++;
        const detail = resultMessage && resultMessage.error && resultMessage.error.message;
        try {
            appendFailure({template, message: detail || "Conversion failed.", raw: srcData});
        } catch (err) {
            // a log write problem must not change the convert response
        }
    }

    app.get("/api/v1/conversions/failures", function (req, res) {
        res.status(200).json({
            failures: listFailures(50),
            failed: conversionCounts.failed,
            succeeded: conversionCounts.succeeded
        });
    });

    /**
     * @swagger
     * /api/v1/convert/{srcDataType}:
     *   post:
     *     description: Converts given data to FHIR using template
     *     produces:
     *       - application/json
     *     consumes:
     *       - text/plain
     *     parameters:
     *       - name: srcDataType
     *         description: Data type of the source (e.g. 'hl7v2')
     *         in: path
     *         required: true
     *         type: string
     *       - name: conversion
     *         description: Conversion task
     *         in: body
     *         required: true
     *         schema:
     *           type: object
     *           properties:
     *             srcData:
     *               type: string
     *             template:
     *               type: string
     *             templatesOverride:
     *               type: object
     *           required:
     *             - srcData
     *       - name: api-version
     *         in: query
     *         description: API version to use.
     *         required: false
     *         type: string
     *       - name: unusedSegments
     *         in: query
     *         description: 'Flag about whether to return the "unusedSegments", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: invalidAccess
     *         in: query
     *         description: 'Flag about whether to return the "invalidAccess", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: debug
     *         in: query
     *         description: 'Flag about whether to return the "debugInfo" (runtime debug metadata), only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: timezone
     *         in: header
     *         description: The timezone of the incoming message in numeric form, ex. +0400
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: Converted message
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     */
    app.post("/api/v1/convert/:srcDataType", requireConvertKey(), function (req, res) {
        const retUnusedSegments = req.query.unusedSegments == "true";
        const retInvalidAcces = req.query.invalidAccess == "true";
        const retDebug = req.query.debug == "true";
        workerPool
            .exec({
                type: "/api/convert/:srcDataType",
                srcDataType: req.params.srcDataType,
                srcData: req.body.srcData,
                template: req.body.template,
                templatesOverride: req.body.templatesOverride,
                timezone: req.headers.timezone,
                debug: retDebug,
            })
            .then((result) => {
                const resultMessage = result.resultMsg;
                if (!retUnusedSegments) {
                    delete resultMessage["unusedSegments"];
                }
                if (!retInvalidAcces) {
                    delete resultMessage["invalidAccess"];
                }
                if (!retDebug) {
                    delete resultMessage["debugInfo"];
                }
                recordConversion(result.status, resultMessage, req.body.srcData, req.body.template);
                res.status(result.status);
                res.json(resultMessage);
            });
    });

    /**
     * @swagger
     * /api/v1/convert/{srcDataType}/{template}:
     *   post:
     *     description: Converts given data to FHIR using template
     *     produces:
     *       - application/json
     *     consumes:
     *       - text/plain
     *     parameters:
     *       - name: srcDataType
     *         description: Data type of the source (e.g. 'hl7v2')
     *         in: path
     *         required: true
     *         type: string
     *       - name: template
     *         description: Name of a specific template
     *         in: path
     *         required: true
     *         type: string
     *       - name: srcData
     *         description: the source data to convert
     *         in: body
     *         required: true
     *         schema:
     *           type: string
     *       - name: api-version
     *         in: query
     *         description: API version to use. The current version is 1.0. Previous versions, including passing no version, are deprecated.
     *         required: false
     *         type: string
     *       - name: unusedSegments
     *         in: query
     *         description: 'Flag about whether to return the "unusedSegments", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: invalidAccess
     *         in: query
     *         description: 'Flag about whether to return the "invalidAccess", only used in web portal'
     *         required: false
     *         type: boolean
     *       - name: timezone
     *         in: header
     *         description: The timezone of the incoming message in numeric form, ex. +0400
     *         required: false
     *         type: string
     *     responses:
     *       200:
     *         description: Converted message
     *       400:
     *         description: Bad request
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: Template not found
     */
    app.post("/api/v1/convert/:srcDataType/:template(*)", requireConvertKey((req) => req.params.template), function (req, res) {
        const retUnusedSegments = req.query.unusedSegments == "true";
        const retInvalidAcces = req.query.invalidAccess == "true";
        const srcData = req.body.toString();
        workerPool
            .exec({
                type: "/api/convert/:srcDataType/:template",
                srcData,
                srcDataType: req.params.srcDataType,
                templateName: req.params.template,
                timezone: req.headers.timezone,
            })
            .then((result) => {
                const resultMessage = result.resultMsg;
                if (!retUnusedSegments) {
                    delete resultMessage["unusedSegments"];
                }
                if (!retInvalidAcces) {
                    delete resultMessage["invalidAccess"];
                }
                auditConvert(result.status, req.params.template, srcData);
                res.status(result.status);
                res.json(resultMessage);
            });
    });

    function sendProjectRouteError(res, err) {
        const status = err && Number.isInteger(err.status) ? err.status : 400;
        const code = status === 404 ? errorCodes.NotFound : errorCodes.BadRequest;
        res.status(status).json(errorMessage(code, err && err.message ? err.message : "Project request failed."));
    }

    app.post("/api/v1/projects", function (req, res) {
        createProject(req.body || {})
            .then((created) => res.status(201).json(created))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/open", function (req, res) {
        openLocalProject(req.body || {})
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/open-github", function (req, res) {
        openGithubProject(req.body || {})
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/files", function (req, res) {
        listProjectFiles(req.body || {})
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/file", function (req, res) {
        readProjectFile(req.body || {})
            .then((textContent) => {
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.status(200).send(textContent);
            })
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.put("/api/v1/projects/file", function (req, res) {
        const bodyText = typeof req.body === "string"
            ? req.body
            : (Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "");
        writeProjectFile({
            projectPath: req.headers["x-project-path"],
            relativeFilePath: req.headers["x-project-file"],
            target: req.headers["x-project-target"],
            content: bodyText
        })
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/convert", requireConvertKey(), function (req, res) {
        const retUnusedSegments = req.query.unusedSegments == "true";
        const retInvalidAccess = req.query.invalidAccess == "true";
        const retDebug = req.query.debug == "true";
        const body = req.body || {};

        prepareProjectConversion(body)
            .then((prep) =>
                workerPool.exec({
                    type: "/api/convert/:srcDataType",
                    srcDataType: prep.srcDataType,
                    srcData: body.srcData,
                    template: body.template,
                    templatesOverride: prep.templatesOverride,
                    templateDirectory: prep.templateDirectory,
                    strictOverridesOnly: prep.strictOverridesOnly,
                    fallbackTemplateDirectory: prep.fallbackTemplateDirectory,
                    declaredSegments: prep.declaredSegments,
                    timezone: req.headers.timezone,
                    debug: retDebug
                }).then(async (result) => {
                    if (prep.projectRoot && result.status === 200 && result.resultMsg && result.resultMsg.fhirResource) {
                        const pack = await loadSitePack(prep.projectRoot);
                        result.resultMsg.unmapped = collectUnmapped(result.resultMsg.fhirResource, pack);
                        result.resultMsg.fhirResource = applySitePack(result.resultMsg.fhirResource, pack);
                    }
                    return result;
                })
            )
            .then((result) => {
                const resultMessage = result.resultMsg;
                if (!retUnusedSegments) {
                    delete resultMessage["unusedSegments"];
                }
                if (!retInvalidAccess) {
                    delete resultMessage["invalidAccess"];
                }
                if (!retDebug) {
                    delete resultMessage["debugInfo"];
                }
                recordConversion(result.status, resultMessage, body.srcData, body.template);
                res.status(result.status).json(resultMessage);
            })
            .catch((err) => {
                const status = err && Number.isInteger(err.status) ? err.status : 400;
                recordConversion(status, {error: {message: err && err.message}}, body.srcData, body.template);
                sendProjectRouteError(res, err);
            });
    });

    app.post("/api/v1/projects/official-samples", function (req, res) {
        copyOfficialHl7v2Samples(req.body && req.body.path)
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    /**
     * @swagger
     * /health:
     *   get:
     *     description: Returns OK if the application is started and working
     *     produces:
     *       - json
     *     responses:
     *       200:
     *         description: A specific template
     *       404:
     *         description: Not found
     */
    app.get("/health", (req, res) => {
        const data = {
            status: "OK",
        };

        res.status(200).send(data);
    });

    /**
     * @swagger
     * /version:
     *   get:
     *     description: Returns build version of the service
     *     produces:
     *       - json
     *     responses:
     *       200:
     *         description: Build version returned
     *       404:
     *         description: Not found
     */
    app.get("/version", function (req, res) {
        let response = {};
        response.version = "12";
        res.status(200).json(response);
    });

    return app;
}
