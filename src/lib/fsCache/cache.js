// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { readdir, readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { join, dirname, relative, sep } from 'node:path';
import { errorCodes, errorMessage } from '../error/error.js';

async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        if (entry.name.startsWith('.')) {
            continue;
        }
        const fullPath = join(dir, entry.name);
        if (entry.isDirectory()) {
            files.push(...(await walk(fullPath)));
        } else {
            files.push(fullPath);
        }
    }
    return files;
}

export default class fsCache {
    constructor(path) {
        this._cache = new Map();
        this._versions = {};
        this._path = path;
        this._empty = true;
        this._initPromise = null;
    }

    async keys() {
        await this.init();
        return Array.from(this._cache.keys());
    }

    async has(key) {
        await this.init();
        return this._cache.has(key);
    }

    async get(key) {
        await this.init();
        if (!this._cache.has(key)) {
            throw errorMessage(errorCodes.NotFound, `${key} not found`);
        }
        if (this._versions[key].cached !== this._versions[key].actual) {
            const version = this._versions[key].actual;
            try {
                const content = await readFile(join(this._path, key));
                this._cache.set(key, content);
                this._versions[key].cached = version;
                return content;
            } catch {
                throw errorMessage(errorCodes.NotFound, `${key} not found`);
            }
        }
        return this._cache.get(key);
    }

    async set(key, value) {
        await this.init();
        const fullFileName = join(this._path, key);
        try {
            await mkdir(dirname(fullFileName), { recursive: true });
        } catch (err) {
            if (err.code !== 'EEXIST') {
                throw errorMessage(errorCodes.WriteError, err.message);
            }
        }
        try {
            await writeFile(fullFileName, value);
        } catch {
            throw errorMessage(errorCodes.WriteError, `Unable to write ${key}`);
        }
        if (!this._cache.has(key)) {
            this._versions[key] = { cached: 0, actual: 1 };
            this._cache.set(key, undefined);
        }
        this._versions[key].actual++;
    }

    async remove(key) {
        await this.init();
        try {
            await unlink(join(this._path, key));
        } catch {
            throw errorMessage(errorCodes.NotFound, `Unable to find ${key}`);
        }
        this._cache.delete(key);
        if (this._versions[key]) {
            this._versions[key].actual++;
        }
    }

    clear() {
        this._cache.clear();
        this._versions = {};
        this._empty = true;
        this._initPromise = null;
    }

    async init() {
        if (!this._empty) {
            return;
        }
        if (!this._initPromise) {
            this._initPromise = (async () => {
                let files;
                try {
                    files = await walk(this._path);
                } catch {
                    this._initPromise = null;
                    throw errorMessage(errorCodes.NotFound, `Unable to access location ${this._path}`);
                }
                for (const file of files) {
                    const key = relative(this._path, file).split(sep).join('/');
                    if (key && !this._cache.has(key)) {
                        this._versions[key] = { cached: 0, actual: 1 };
                        this._cache.set(key, undefined);
                    }
                }
                this._empty = false;
                this._initPromise = null;
            })();
        }
        return this._initPromise;
    }
}
