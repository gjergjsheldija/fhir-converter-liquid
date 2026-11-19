// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {readdir, readFile, stat} from "fs/promises";
import {resolve} from "path";

const MAX_BYTES = 2000000;

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

export function isValidGitRef(ref) {
    if (ref === undefined || ref === null || ref === "") {
        return true;
    }
    if (typeof ref !== "string") {
        return false;
    }
    if (/[\s\r\n]/.test(ref) || ref.includes("..")) {
        return false;
    }
    return true;
}

export function parseGithubRepo(input) {
    const text = String(input || "").trim().replace(/\.git$/, "").replace(/\/+$/, "");
    const urlMatch = text.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i);
    const shortMatch = text.match(/^([^/\s]+)\/([^/\s]+)$/);
    const match = urlMatch || shortMatch;
    if (!match) {
        return null;
    }
    const owner = match[1];
    const repo = match[2];
    if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) {
        return null;
    }
    return {owner, repo};
}

export function githubContentsUrl(owner, repo, path, ref) {
    if (!isValidGitRef(ref)) {
        return null;
    }
    const clean = String(path || "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (clean.split("/").includes("..")) {
        return null;
    }
    const suffix = clean
        ? "/" + clean.split("/").filter(Boolean).map(encodeURIComponent).join("/")
        : "";
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${suffix}${query}`;
}

function githubHeaders(token) {
    const headers = {
        Accept: "application/vnd.github+json",
        "User-Agent": "fhir-converter-liquid"
    };
    if (token) {
        headers.Authorization = "Bearer " + token;
    }
    return headers;
}

export async function listGithub(repoInput, path, token, ref) {
    const repo = parseGithubRepo(repoInput);
    if (!repo) {
        throw httpError(400, "Enter a GitHub repo as owner/repo or a github.com URL.");
    }
    if (!isValidGitRef(ref)) {
        throw httpError(400, "Invalid ref.");
    }
    const url = githubContentsUrl(repo.owner, repo.repo, path, ref);
    if (!url) {
        throw httpError(400, "Invalid path.");
    }
    const response = await fetch(url, {headers: githubHeaders(token)});
    if (response.status === 404) {
        throw httpError(404, "Repository or path not found.");
    }
    if (!response.ok) {
        throw httpError(400, `GitHub request failed with status ${response.status}.`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) {
        throw httpError(400, "Path is not a folder.");
    }
    const entries = data.map((item) => ({
        name: item.name,
        path: item.path,
        type: item.type === "dir" ? "dir" : "file"
    }));
    entries.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
    return {
        repo: `${repo.owner}/${repo.repo}`,
        path: String(path || "").replace(/^\/+/, ""),
        entries
    };
}

export async function readGithubFile(repoInput, path, token, ref) {
    const repo = parseGithubRepo(repoInput);
    if (!repo) {
        throw httpError(400, "Enter a GitHub repo as owner/repo or a github.com URL.");
    }
    if (!isValidGitRef(ref)) {
        throw httpError(400, "Invalid ref.");
    }
    const url = githubContentsUrl(repo.owner, repo.repo, path, ref);
    if (!url || !String(path || "").trim()) {
        throw httpError(400, "Invalid path.");
    }
    const response = await fetch(url, {headers: githubHeaders(token)});
    if (response.status === 404) {
        throw httpError(404, "Repository or path not found.");
    }
    if (!response.ok) {
        throw httpError(400, `GitHub request failed with status ${response.status}.`);
    }
    const data = await response.json();
    if (!data || data.type === "dir" || !data.content) {
        throw httpError(400, "Path is not a file.");
    }
    const text = Buffer.from(String(data.content).replace(/\n/g, ""), "base64").toString("utf8");
    if (text.length > MAX_BYTES) {
        throw httpError(400, "File is too large.");
    }
    return text;
}

export async function listGithubTree(repoInput, token, ref) {
    const repo = parseGithubRepo(repoInput);
    if (!repo) {
        throw httpError(400, "Enter a GitHub repo as owner/repo or a github.com URL.");
    }
    if (!isValidGitRef(ref)) {
        throw httpError(400, "Invalid ref.");
    }
    let effectiveRef = typeof ref === "string" ? ref.trim() : "";
    if (!effectiveRef) {
        const metaUrl = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`;
        const metaResp = await fetch(metaUrl, {headers: githubHeaders(token)});
        if (metaResp.status === 404) {
            throw httpError(404, "Repository or ref not found.");
        }
        if (!metaResp.ok) {
            throw httpError(400, `GitHub request failed with status ${metaResp.status}.`);
        }
        const meta = await metaResp.json();
        effectiveRef = meta && typeof meta.default_branch === "string" && meta.default_branch
            ? meta.default_branch
            : "main";
    }
    const treeUrl = `https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}/git/trees/${encodeURIComponent(effectiveRef)}?recursive=1`;
    const treeResp = await fetch(treeUrl, {headers: githubHeaders(token)});
    if (treeResp.status === 404) {
        throw httpError(404, "Repository or ref not found.");
    }
    if (!treeResp.ok) {
        throw httpError(400, `GitHub request failed with status ${treeResp.status}.`);
    }
    const treeData = await treeResp.json();
    const blobs = Array.isArray(treeData && treeData.tree)
        ? treeData.tree
            .filter((item) => item && item.type === "blob" && typeof item.path === "string")
            .map((item) => item.path)
        : [];
    return {
        repo: `${repo.owner}/${repo.repo}`,
        ref: effectiveRef,
        paths: blobs
    };
}

export async function listFolder(input) {
    const requested = String(input || "").trim();
    if (!requested) {
        throw httpError(400, "Enter a folder path.");
    }
    const root = resolve(requested);
    const info = await stat(root).catch(() => null);
    if (!info || !info.isDirectory()) {
        throw httpError(404, "Folder not found.");
    }
    const items = await readdir(root, {withFileTypes: true});
    const entries = items
        .filter((item) => item.name !== ".git")
        .map((item) => ({
            name: item.name,
            path: resolve(root, item.name),
            type: item.isDirectory() ? "dir" : "file"
        }));
    entries.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === "dir" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
    return {path: root, entries};
}

export async function readFolderFile(input) {
    const requested = String(input || "").trim();
    if (!requested) {
        throw httpError(400, "Enter a file path.");
    }
    const filePath = resolve(requested);
    const info = await stat(filePath).catch(() => null);
    if (!info || !info.isFile()) {
        throw httpError(404, "File not found.");
    }
    if (info.size > MAX_BYTES) {
        throw httpError(400, "File is too large.");
    }
    const bytes = await readFile(filePath);
    if (bytes.includes(0)) {
        throw httpError(400, "File is not text.");
    }
    return bytes.toString("utf8");
}
