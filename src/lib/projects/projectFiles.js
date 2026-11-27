import {mkdir, readdir, readFile, realpath, stat, writeFile} from "fs/promises";
import path from "path";
import {isValidGitRef, listGithubTree, parseGithubRepo, readGithubFile} from "../browse/sources.js";
import {isSafeRelativePath, readManifest, validateManifest} from "./manifest.js";

const MAX_BYTES = 2000000;

function httpError(status, message) {
    const error = new Error(message);
    error.status = status;
    return error;
}

async function resolveVerifiedLocalProject(projectPathInput) {
    const input = typeof projectPathInput === "string" ? projectPathInput.trim() : "";
    if (!input || !path.isAbsolute(input)) {
        throw httpError(400, "Enter an absolute folder path.");
    }
    const info = await stat(input).catch(() => null);
    if (!info || !info.isDirectory()) {
        throw httpError(404, "Folder not found.");
    }
    const rootReal = await realpath(input);
    const readRes = await readManifest(rootReal);
    if (!readRes.ok) {
        throw httpError(400, readRes.error);
    }
    return {rootReal, manifest: readRes.manifest};
}

function validateGithubProjectPayload(body) {
    const parsedRepo = parseGithubRepo(body && body.repo);
    if (!parsedRepo) {
        throw httpError(400, "Enter a GitHub repo as owner/repo or a github.com URL.");
    }
    const rawRef = body && body.ref != null ? String(body.ref) : "";
    if (!isValidGitRef(rawRef)) {
        throw httpError(400, "Invalid ref.");
    }
    const validationErr = validateManifest(body && body.manifest);
    if (validationErr) {
        throw httpError(400, validationErr);
    }
    return {
        repo: `${parsedRepo.owner}/${parsedRepo.repo}`,
        ref: rawRef,
        token: typeof (body && body.token) === "string" ? body.token : "",
        manifest: body.manifest
    };
}

async function collectFilesUnderRelativeDir(projectRootReal, relRoot, filterFn) {
    const absStart = path.resolve(projectRootReal, relRoot);
    const info = await stat(absStart).catch(() => null);
    if (!info || !info.isDirectory()) {
        return [];
    }
    const startReal = await realpath(absStart);
    if (startReal !== projectRootReal && !startReal.startsWith(projectRootReal + path.sep)) {
        throw httpError(400, "Invalid path.");
    }

    const found = [];
    async function walk(currentAbs) {
        const entries = await readdir(currentAbs, {withFileTypes: true});
        for (const entry of entries) {
            if (entry.name === ".git" || entry.name === "node_modules") {
                continue;
            }
            const nextAbs = path.join(currentAbs, entry.name);
            if (entry.isSymbolicLink()) {
                const linkReal = await realpath(nextAbs).catch(() => null);
                if (!linkReal || !linkReal.startsWith(projectRootReal + path.sep)) {
                    continue;
                }
            }
            if (entry.isDirectory()) {
                await walk(nextAbs);
            } else if (entry.isFile()) {
                const rel = path.relative(projectRootReal, nextAbs).split(path.sep).join("/");
                if (filterFn(rel, entry.name)) {
                    found.push(rel);
                }
            }
        }
    }
    await walk(startReal);
    found.sort();
    return found;
}

const EXPECTED_BUNDLE_PATH = /^tests\/expected\/[A-Za-z0-9._-]+\.json$/;

function isAllowedRootPrefix(relPath, manifest) {
    if (EXPECTED_BUNDLE_PATH.test(relPath)) {
        return true;
    }
    for (const fam of manifest.families) {
        const root = manifest.roots[fam];
        if (relPath.startsWith(root.samples + "/") || relPath.startsWith(root.templates + "/")) {
            return true;
        }
    }
    return false;
}

export async function listProjectFiles(body = {}) {
    const kind = body && body.kind;
    if (kind !== "local" && kind !== "github") {
        throw httpError(400, "Invalid project kind.");
    }

    if (kind === "local") {
        const {rootReal, manifest} = await resolveVerifiedLocalProject(body.path);
        const activeFamily = body.family || manifest.startup.family;
        if (!manifest.families.includes(activeFamily)) {
            throw httpError(400, "Family is not in this project.");
        }
        const roots = manifest.roots[activeFamily];
        const samples = await collectFilesUnderRelativeDir(
            rootReal,
            roots.samples,
            (_rel, fileName) => fileName !== ".gitkeep"
        );
        const templates = await collectFilesUnderRelativeDir(
            rootReal,
            roots.templates,
            (_rel, fileName) => /\.(liquid|json)$/i.test(fileName)
        );
        return {manifest, family: activeFamily, samples, templates};
    }

    const gh = validateGithubProjectPayload(body);
    const activeFamily = body.family || gh.manifest.startup.family;
    if (!gh.manifest.families.includes(activeFamily)) {
        throw httpError(400, "Family is not in this project.");
    }
    const roots = gh.manifest.roots[activeFamily];
    const tree = await listGithubTree(gh.repo, gh.token, gh.ref);
    const samplesPrefix = roots.samples + "/";
    const templatesPrefix = roots.templates + "/";

    const samples = tree.paths
        .filter((p) => p.startsWith(samplesPrefix) && !p.endsWith("/.gitkeep"))
        .sort();
    const templates = tree.paths
        .filter((p) => p.startsWith(templatesPrefix) && /\.(liquid|json)$/i.test(p))
        .sort();

    return {
        manifest: gh.manifest,
        family: activeFamily,
        samples,
        templates
    };
}

export async function readProjectFile(body = {}) {
    const projectObj = body && body.project && typeof body.project === "object" ? body.project : body;
    const kind = projectObj && projectObj.kind;
    if (kind !== "local" && kind !== "github") {
        throw httpError(400, "Invalid project kind.");
    }

    if (kind === "local") {
        const localRoot = projectObj.projectPath
            || projectObj.rootPath
            || (typeof projectObj.path === "string" && path.isAbsolute(projectObj.path) ? projectObj.path : "");
        const requestedRel = typeof body.filePath === "string"
            ? body.filePath
            : (typeof body.path === "string" && !path.isAbsolute(body.path) ? body.path : "");
        const {rootReal, manifest} = await resolveVerifiedLocalProject(localRoot);
        if (!isSafeRelativePath(requestedRel) || !isAllowedRootPrefix(requestedRel, manifest)) {
            throw httpError(400, "Invalid path.");
        }
        const targetAbs = path.resolve(rootReal, requestedRel);
        const info = await stat(targetAbs).catch(() => null);
        if (!info || !info.isFile()) {
            throw httpError(404, "File not found.");
        }
        const targetReal = await realpath(targetAbs).catch(() => null);
        if (!targetReal || !targetReal.startsWith(rootReal + path.sep)) {
            throw httpError(400, "Invalid path.");
        }
        if (info.size > MAX_BYTES) {
            throw httpError(400, "File is too large.");
        }
        return readFile(targetReal, "utf8");
    }

    const requestedRel = typeof body.filePath === "string"
        ? body.filePath
        : (typeof body.path === "string" ? body.path : "");
    const gh = validateGithubProjectPayload(projectObj);
    if (!isSafeRelativePath(requestedRel) || !isAllowedRootPrefix(requestedRel, gh.manifest)) {
        throw httpError(400, "Invalid path.");
    }
    try {
        return await readGithubFile(gh.repo, requestedRel, gh.token, gh.ref);
    } catch (err) {
        if (err && err.status === 404) {
            throw httpError(404, "File not found.");
        }
        throw err;
    }
}

async function verifyWritePathInsideRoot(projectRootReal, targetAbs) {
    let probe = targetAbs;
    while (probe && probe !== path.dirname(probe)) {
        const existingReal = await realpath(probe).catch(() => null);
        if (existingReal) {
            if (existingReal !== projectRootReal && !existingReal.startsWith(projectRootReal + path.sep)) {
                throw httpError(400, "Invalid path.");
            }
            const remainder = path.relative(probe, targetAbs);
            const resolvedTarget = path.resolve(existingReal, remainder);
            if (!resolvedTarget.startsWith(projectRootReal + path.sep)) {
                throw httpError(400, "Invalid path.");
            }
            return resolvedTarget;
        }
        probe = path.dirname(probe);
    }
    throw httpError(400, "Invalid path.");
}

export async function writeProjectFile(options = {}) {
    const {rootReal, manifest} = await resolveVerifiedLocalProject(options.projectPath);
    const relPath = typeof options.relativeFilePath === "string" ? options.relativeFilePath.trim() : "";
    const targetKind = options.target === "sample" ? "sample" : "template";
    const content = typeof options.content === "string" ? options.content : "";

    if (!isSafeRelativePath(relPath)) {
        throw httpError(400, "Invalid path.");
    }
    if (Buffer.byteLength(content, "utf8") > MAX_BYTES) {
        throw httpError(400, "File is too large.");
    }

    if (targetKind === "template") {
        const matchesSamplesRoot = manifest.families.some((fam) => relPath.startsWith(manifest.roots[fam].samples + "/"));
        if (matchesSamplesRoot) {
            throw httpError(400, "Save writes templates. The sample stays unchanged.");
        }
        const matchesTemplatesRoot = manifest.families.some((fam) => relPath.startsWith(manifest.roots[fam].templates + "/"));
        if (!matchesTemplatesRoot || !/\.(liquid|json)$/i.test(relPath)) {
            throw httpError(400, "Invalid path.");
        }
    } else {
        const matchesSamplesRoot = manifest.families.some((fam) => relPath.startsWith(manifest.roots[fam].samples + "/"));
        if (!matchesSamplesRoot || !/\.(hl7|txt|msg|xml)$/i.test(relPath)) {
            throw httpError(400, "Invalid path.");
        }
    }

    const candidateAbs = path.resolve(rootReal, relPath);
    const verifiedAbs = await verifyWritePathInsideRoot(rootReal, candidateAbs);
    await mkdir(path.dirname(verifiedAbs), {recursive: true});
    await writeFile(verifiedAbs, content, "utf8");
    return {ok: true, path: relPath};
}
