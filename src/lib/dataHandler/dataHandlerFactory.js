// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------
import {lstatSync, readdirSync} from "fs";
import {resolve} from "path";
//import {fileURLToPath} from "url";
import hl7v2 from "../parsers/hl7v2/hl7v2Liquid.js";
import dummy from "../parsers/dummy/dummy.js";

//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);

//const directory = join(__dirname, "../parsers/");


const map = {hl7v2, dummy};

export default class dataHandlerFactory {
    static createDataHandler(dataType) {
        //let parsersList = this.listParsers(directory);

        return new map[dataType]();
    }

    static listParsers(location) {
        let parsers = [];
        readdirSync(location).forEach((file) => {
            if (lstatSync(resolve(location, file)).isDirectory()) {
                parsers.push(file);
            }
        });

        return parsers;
    }
}
