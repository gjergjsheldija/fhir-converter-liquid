// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

/* eslint-env es2020 */

import { deepStrictEqual, strictEqual } from 'assert';

// src/static/js/liquid-fold.js is a classic browser script (no export statement)
// that attaches the pure helper to globalThis as a side effect of the import.
await import('../src/static/js/liquid-fold.js');

const findLiquidBlockEnd = globalThis.findLiquidBlockEnd;

function makeLines(lines) {
    return {
        getLine: (lineNo) => lines[lineNo],
        lineCount: lines.length
    };
}

describe('findLiquidBlockEnd', function () {
    it('folds a multi-line {% comment %} block even when the prose contains {% if %} without {% endif %}', function () {
        const lines = [
            '{% comment -%}',
            '  Some prose that mentions {% if %} without any {% endif %}',
            '{% endcomment -%}'
        ];
        const range = findLiquidBlockEnd(makeLines(lines).getLine, lines.length, 0);
        deepStrictEqual(range, {
            fromLine: 0,
            fromCh: 14, // right after the opening {% comment -%}
            toLine: 1,
            toCh: lines[1].length // fold ends before the visible {% endcomment -%} line
        });
    });

    it('folds a {% raw %} block ignoring all nested tags until {% endraw %}', function () {
        const lines = [
            '{% raw %}',
            '  {% if %} and {% for x in y %} ... {% endfor %}',
            '{% endraw %}'
        ];
        const range = findLiquidBlockEnd(makeLines(lines).getLine, lines.length, 0);
        deepStrictEqual(range, {
            fromLine: 0,
            fromCh: 9, // right after the opening {% raw %}
            toLine: 1,
            toCh: lines[1].length
        });
    });

    it('folds nested {% if %} blocks to the outer {% endif %}, not the inner one', function () {
        const lines = [
            '{% if a %}',
            '  {% if b %}',
            '    nested',
            '  {% endif %}',
            '{% endif %}'
        ];
        const range = findLiquidBlockEnd(makeLines(lines).getLine, lines.length, 0);
        deepStrictEqual(range, {
            fromLine: 0,
            fromCh: 10, // right after the opening {% if a %}
            toLine: 3, // fold ends at the end of the inner {% endif %} line...
            toCh: lines[3].length // ...so the outer {% endif %} line (4) stays visible
        });
    });

    it('returns undefined on a single-line {% if x %}1{% endif %} so brace folding can take over', function () {
        const lines = ['{% if x %}1{% endif %}'];
        strictEqual(findLiquidBlockEnd(makeLines(lines).getLine, lines.length, 0), undefined);
    });

    it('returns undefined on {% assign x = 1 %} so brace folding can still handle { on other lines', function () {
        const lines = [
            '{% assign x = 1 %}',
            '{ "resourceType": "Patient" }'
        ];
        strictEqual(findLiquidBlockEnd(makeLines(lines).getLine, lines.length, 0), undefined);
    });
});
