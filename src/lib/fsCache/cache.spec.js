// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import {equal, fail, ok} from "assert";
import fsCache from "./cache.js";
import fse from "fs-extra";
import path, {join} from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("fsCache", function () {
    let folderPath = join(__dirname, "test-fsCache");
    let fileName = "fsCacheTempFile.liquid";
    let filePath = join(folderPath, fileName);

    before(function () {
        fse.removeSync(folderPath);
        fse.ensureDirSync(folderPath);
        fse.outputFileSync(filePath, "hello");
    });

    it("should use Cache for get", function () {
        let cache = new fsCache(folderPath);

        cache
            .get(fileName)
            .then((data1) => {
                equal(data1, "hello");
                fse.removeSync(join(folderPath, fileName));
                cache
                    .get(fileName)
                    .then((data2) => {
                        equal(data2, "hello");
                    })
                    .catch(() => fail());
            })
            .catch(() => {
                fail();
            });
    });

    it("Cache should get expired on file update", function () {
        let cache = new fsCache(folderPath);

        cache
            .get(fileName)
            .then((data1) => {
                equal(data1, "hello");
                cache
                    .set(fileName, "world")
                    .then(() => {
                        fse.removeSync(join(folderPath, fileName));
                        cache
                            .get(fileName)
                            .then(() => {
                                fail();
                            })
                            .catch(() => ok());
                    })
                    .catch(() => fail());
            })
            .catch(() => {
                fail();
            });
    });

    it("Cache has() should return false for non-existent file", function () {
        let cache = new fsCache(folderPath);

        cache
            .has("nonExistentFile")
            .then((result) => {
                equal(result, false);
            })
            .catch(() => {
                fail();
            });
    });

    it("Cache has() should return true for existing file", function () {
        let cache = new fsCache(folderPath);

        cache
            .has(fileName)
            .then((result) => {
                equal(result, true);
            })
            .catch(() => {
                fail();
            });
    });
});
