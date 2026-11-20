// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {chooseLocalFolder, listFolder, listGithub, readFolderFile, readGithubFile} from "../lib/browse/sources.js";
import {errorCodes, errorMessage} from "../lib/error/error.js";
import {createProject} from "../lib/projects/createProject.js";
import {copyOfficialHl7v2Samples} from "../lib/projects/officialSamples.js";
import {openGithubProject} from "../lib/projects/openGithubProject.js";
import {openLocalProject} from "../lib/projects/openProject.js";
import {listProjectFiles, readProjectFile, writeProjectFile} from "../lib/projects/projectFiles.js";

function browseError(res, err) {
    const status = err && err.status ? err.status : 400;
    const payload = errorMessage(
        status === 404 ? errorCodes.NotFound : errorCodes.BadRequest,
        err && err.message ? err.message : "Browse failed."
    );
    if (err && err.detail) {
        payload.detail = err.detail;
    }
    res.status(status).json(payload);
}

function sendProjectRouteError(res, err) {
    const status = err && Number.isInteger(err.status) ? err.status : 400;
    const code = status === 404 ? errorCodes.NotFound : errorCodes.BadRequest;
    res.status(status).json(errorMessage(code, err && err.message ? err.message : "Project request failed."));
}

export default function registerProjectsRoutes(app, {requireApiKey}) {
    app.use("/api/v1/browse", requireApiKey);

    app.post("/api/v1/browse/github", function (req, res) {
        const body = req.body || {};
        const action = body.file
            ? readGithubFile(body.repo, body.path, body.token)
            : listGithub(body.repo, body.path, body.token);
        action
            .then((result) => {
                if (typeof result === "string") {
                    res.type("text/plain").send(result);
                    return;
                }
                res.json(result);
            })
            .catch((err) => browseError(res, err));
    });

    app.post("/api/v1/browse/choose-folder", function (req, res) {
        chooseLocalFolder()
            .then((result) => res.json(result))
            .catch((err) => browseError(res, err));
    });

    app.post("/api/v1/browse/folder", function (req, res) {
        const body = req.body || {};
        const action = body.file ? readFolderFile(body.path) : listFolder(body.path);
        action
            .then((result) => {
                if (typeof result === "string") {
                    res.type("text/plain").send(result);
                    return;
                }
                res.json(result);
            })
            .catch((err) => browseError(res, err));
    });

    app.post("/api/v1/projects", requireApiKey, function (req, res) {
        createProject(req.body || {})
            .then((created) => res.status(201).json(created))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/open", requireApiKey, function (req, res) {
        openLocalProject(req.body || {})
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/open-github", requireApiKey, function (req, res) {
        openGithubProject(req.body || {})
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/files", requireApiKey, function (req, res) {
        listProjectFiles(req.body || {})
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.post("/api/v1/projects/file", requireApiKey, function (req, res) {
        readProjectFile(req.body || {})
            .then((textContent) => {
                res.setHeader("Content-Type", "text/plain; charset=utf-8");
                res.status(200).send(textContent);
            })
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.put("/api/v1/projects/file", requireApiKey, function (req, res) {
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

    app.post("/api/v1/projects/official-samples", requireApiKey, function (req, res) {
        copyOfficialHl7v2Samples(req.body && req.body.path)
            .then((result) => res.status(200).json(result))
            .catch((err) => sendProjectRouteError(res, err));
    });

    app.all("/api/v1/projects*", requireApiKey);
}
