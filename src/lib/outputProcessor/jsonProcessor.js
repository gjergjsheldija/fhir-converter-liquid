// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import pkg from 'antlr4';
import jsonLexer from './autogen/jsonLexer.js';
import jsonParser from './autogen/jsonParser.js';
import {jsonCustomListener} from './jsonCustomListener.js';

const {InputStream, CommonTokenStream, error, tree: _tree} = pkg;

export function Process(input) {
    try {
        var chars = new InputStream(input);
        var lexer = new jsonLexer(chars);
        var tokens = new CommonTokenStream(lexer);
        var parser = new jsonParser(tokens);
        lexer.removeErrorListeners();
        lexer.addErrorListener(new error.DiagnosticErrorListener(false));
        parser.removeErrorListeners();
        parser.addErrorListener(new error.DiagnosticErrorListener(false));
        parser.buildParseTrees = true;
        var tree = parser.json();
        var jsonListenerObj = new jsonCustomListener();
        _tree.ParseTreeWalker.DEFAULT.walk(jsonListenerObj, tree);
        return jsonListenerObj.getResult();
    } catch (err) {
        return input;
    }
}
