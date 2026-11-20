// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {readFileSync} from "fs";
import {access, mkdir, readFile, readdir, stat, unlink, writeFile} from "fs/promises";
import {dirname, join, resolve} from "path";
import {fieldMapArchive, fieldMapFiles} from "../../scripts/hl7-fhir-map.mjs";
import {AVAILABLE_PARSERS, BASE_TEMPLATE_FILES_LOCATION} from "../lib/constants/constants.js";
import dataHandlerFactory from "../lib/dataHandler/dataHandlerFactory.js";
import {errorCodes, errorMessage} from "../lib/error/error.js";
import {guideImagesRoot, renderGuideHtml} from "../lib/guide/renderGuide.js";
import {external as libraryFilters} from "../lib/liquid-converter/liquid-helpers.js";
import {convertInlineHl7v2} from "../lib/workers/worker.js";

function readAiConfig() {
    try {
        const cfg = JSON.parse(readFileSync(new URL("../../config/default.json", import.meta.url), "utf8"));
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

export default function registerStudioRoutes(app, {studioState, requireApiKey}) {
    app.get("/guide", function (req, res) {
        renderGuideHtml(null)
            .then((html) => res.type("html").send(html))
            .catch(() => res.status(404).type("html").send("User guide not found."));
    });

    app.get("/guide/images/:file", function (req, res) {
        if (!/^[\w.-]+$/.test(req.params.file)) {
            res.status(404).end();
            return;
        }
        res.sendFile(join(guideImagesRoot(), req.params.file), (err) => {
            if (err && !res.headersSent) {
                res.status(404).end();
            }
        });
    });

    app.get("/guide/:page", function (req, res) {
        if (!/^[a-z0-9-]+$/.test(req.params.page)) {
            res.status(404).type("html").send("User guide page not found.");
            return;
        }
        renderGuideHtml(req.params.page)
            .then((html) => res.type("html").send(html))
            .catch(() => res.status(404).type("html").send("User guide page not found."));
    });

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
        studioState.messageCache
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
                    const userFiles = await readdir(join(studioState.userSampleDataLocation, "hl7v2"));
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
        access(join(studioState.userSampleDataLocation, key))
            .then(() => readFile(join(studioState.userSampleDataLocation, key)))
            .catch(() => studioState.messageCache.get(key))
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Sample data not found"));
            });
    });

    app.put("/api/v1/sample-data/hl7v2/:file", requireApiKey, function (req, res) {
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
        access(join(studioState.sampleDataLocation, "hl7v2", fileName))
            .then(() => {
                throw Object.assign(new Error("Built-in sample exists"), {isBuiltinConflict: true});
            })
            .catch((builtinError) => {
                if (builtinError && builtinError.isBuiltinConflict) {
                    res.status(409);
                    res.json(errorMessage(errorCodes.Conflict, "Cannot overwrite a built-in sample. Save under a new file name."));
                    return;
                }
                mkdir(join(studioState.userSampleDataLocation, "hl7v2"), {recursive: true})
                    .then(() => writeFile(join(studioState.userSampleDataLocation, "hl7v2", fileName), body, "utf8"))
                    .then(() =>
                        res.status(200).json({ok: true, messageName: "hl7v2/" + fileName, source: "user"})
                    )
                    .catch(() => {
                        res.status(500);
                        res.json(errorMessage(errorCodes.WriteError, "Unable to save sample message."));
                    });
            });
    });

    app.delete("/api/v1/sample-data/hl7v2/:file", requireApiKey, function (req, res) {
        const fileName = req.params.file;
        if (!fileName || !/^[A-Za-z0-9._-]+$/.test(fileName)) {
            res.status(400);
            res.json(errorMessage(errorCodes.BadRequest, "Invalid sample file name."));
            return;
        }
        unlink(join(studioState.userSampleDataLocation, "hl7v2", fileName))
            .then(() => res.status(200).json({ok: true, messageName: "hl7v2/" + fileName}))
            .catch((deleteError) => {
                if (!deleteError || deleteError.code !== "ENOENT") {
                    res.status(500);
                    res.json(errorMessage(errorCodes.WriteError, "Unable to delete sample message."));
                    return;
                }
                access(join(studioState.sampleDataLocation, "hl7v2", fileName))
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
        studioState.templateCache
            .keys()
            .then((files) =>
                res.json({
                    templates: files.map((f) => {
                        return {templateName: f};
                    })
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
     *   put:
     *     description: Writes a Liquid template
     *     consumes:
     *       - text/plain
     */
    app.put("/api/v1/templates/:file(*)", requireApiKey, function (req, res) {
        const key = req.params.file;
        if (!key || key.includes("..") || !key.endsWith(".liquid")) {
            res.status(400).json(errorMessage(errorCodes.BadRequest, "Invalid template name."));
            return;
        }
        const text = typeof req.body === "string" ? req.body : "";
        studioState.templateCache.set(key, text)
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
    app.get("/api/v1/templates/:file(*)", function (req, res) {
        studioState.templateCache
            .get(req.params.file)
            .then((content) => res.end(content.toString()))
            .catch(() => {
                res.status(404);
                res.json(errorMessage(errorCodes.NotFound, "Template not found"));
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
    app.post("/api/v1/templategenerate", requireApiKey, function (req, res) {
        const body = req.body || {};
        const ai = readAiConfig();
        const maxIters = Number(body.maxIters) || ai.defaultMaxIters || 4;
        const temperature = ai.defaultTemperature != null ? ai.defaultTemperature : 0;

        const finish = (status, payload) => {
            res.status(status).json(payload);
        };

        const resolveMessage = () => {
            if (body.messageName) {
                return studioState.messageCache.get(body.messageName).then((content) => content.toString());
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
                const apiFormat = knownProvider && knownProvider.apiFormat ? knownProvider.apiFormat : "openai";

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

                return import("../lib/ai/generateTemplate.js").then((aiModule) => {
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
    });

    app.post("/api/v1/field-map", requireApiKey, function (req, res) {
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
}
