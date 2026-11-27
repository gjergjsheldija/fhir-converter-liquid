/* global globalThis */

import assert from "assert";
import { readFileSync } from "fs";
import "../src/static/js/editor-fold-toggle.js";

const {
    hasFoldedSections,
    foldAllEditorSections,
    unfoldAllEditorSections,
    toggleEditorFoldAll
} = globalThis;

function createMockCm(lines, rangesByLine) {
    const marks = [];
    return {
        marks,
        firstLine() {
            return 0;
        },
        lastLine() {
            return lines.length - 1;
        },
        getLine(i) {
            return lines[i] ?? "";
        },
        getAllMarks() {
            return marks;
        },
        operation(fn) {
            return fn();
        },
        foldOption(_options, name) {
            if (name === "rangeFinder") {
                return (_cm, pos) => rangesByLine[pos.line] || null;
            }
            return null;
        },
        foldCode(pos, _opts, force) {
            const range = rangesByLine[pos.line];
            if (!range || force !== "fold") {
                return;
            }
            const mark = {
                fromLine: range.from.line,
                toLine: range.to.line,
                __isFold: true,
                find() {
                    return { from: range.from, to: range.to };
                },
                clear() {
                    const idx = marks.indexOf(mark);
                    if (idx !== -1) {
                        marks.splice(idx, 1);
                    }
                }
            };
            marks.push(mark);
        }
    };
}

function createMockButton() {
    const attrs = {
        "aria-pressed": "false",
        "data-folded": "false",
        "aria-label": "Fold all sections",
        title: "Fold all sections"
    };
    const useAttrs = { href: "/icons.svg#icon-fold-all" };
    return {
        attrs,
        useAttrs,
        setAttribute(k, v) {
            attrs[k] = v;
        },
        getAttribute(k) {
            return attrs[k];
        },
        querySelector(sel) {
            if (sel === "use") {
                return {
                    setAttribute(k, v) {
                        useAttrs[k] = v;
                    }
                };
            }
            return null;
        }
    };
}

describe("editor-fold-toggle (Liquid & FHIR fold/unfold all button)", function () {
    beforeEach(function () {
        globalThis.CodeMirror = {
            Pos(line, ch) {
                return { line, ch };
            }
        };
    });

    afterEach(function () {
        delete globalThis.CodeMirror;
    });

    it("folds main sections AND subsections so opening the main section leaves subsections folded, and swaps button icons", function () {
        const lines = [
            "{",
            "  \"resourceType\": \"Bundle\",",
            "  \"entry\": [",
            "    {",
            "      \"resource\": {",
            "        \"resourceType\": \"Patient\"",
            "      }",
            "    },",
            "    {",
            "      \"resource\": {",
            "        \"resourceType\": \"Encounter\"",
            "      }",
            "    }",
            "  ]",
            "}"
        ];
        const ranges = {
            0: { from: { line: 0, ch: 1 }, to: { line: 14, ch: 0 } },
            2: { from: { line: 2, ch: 12 }, to: { line: 13, ch: 2 } },
            3: { from: { line: 3, ch: 5 }, to: { line: 7, ch: 4 } },
            4: { from: { line: 4, ch: 19 }, to: { line: 6, ch: 6 } },
            8: { from: { line: 8, ch: 5 }, to: { line: 12, ch: 4 } },
            9: { from: { line: 9, ch: 19 }, to: { line: 11, ch: 6 } }
        };
        const cm = createMockCm(lines, ranges);
        const btn = createMockButton();

        assert.strictEqual(hasFoldedSections(cm), false);
        assert.strictEqual(btn.useAttrs.href, "/icons.svg#icon-fold-all");

        // Toggle 1 -> Fold all sections and subsections
        const afterFold = toggleEditorFoldAll(cm, btn);
        assert.strictEqual(afterFold, true);
        assert.strictEqual(cm.marks.length, 6);
        assert.strictEqual(btn.attrs["aria-pressed"], "true");
        assert.strictEqual(btn.attrs["data-folded"], "true");
        assert.strictEqual(btn.attrs.title, "Unfold all sections");
        assert.strictEqual(btn.useAttrs.href, "/icons.svg#icon-unfold-all");

        // User opens the main section (line 0) -> all subsections remain folded!
        cm.marks[0].clear();
        assert.strictEqual(cm.marks.length, 5);
        assert.deepStrictEqual(
            cm.marks.map((m) => [m.fromLine, m.toLine]),
            [[2, 13], [3, 7], [4, 6], [8, 12], [9, 11]]
        );
        assert.strictEqual(hasFoldedSections(cm), true);

        // Toggle 2 -> Unfold all remaining subsections and restore icon
        const afterUnfold = toggleEditorFoldAll(cm, btn);
        assert.strictEqual(afterUnfold, false);
        assert.strictEqual(cm.marks.length, 0);
        assert.strictEqual(btn.attrs["aria-pressed"], "false");
        assert.strictEqual(btn.attrs["data-folded"], "false");
        assert.strictEqual(btn.attrs.title, "Fold all sections");
        assert.strictEqual(btn.useAttrs.href, "/icons.svg#icon-fold-all");
    });

    it("does not duplicate fold marks if a subsection was already folded before clicking Fold all", function () {
        const lines = [
            "{",
            "  \"entry\": [",
            "    {",
            "      \"id\": \"1\"",
            "    }",
            "  ]",
            "}"
        ];
        const ranges = {
            0: { from: { line: 0, ch: 1 }, to: { line: 6, ch: 0 } },
            1: { from: { line: 1, ch: 12 }, to: { line: 5, ch: 2 } },
            2: { from: { line: 2, ch: 5 }, to: { line: 4, ch: 4 } }
        };
        const cm = createMockCm(lines, ranges);
        cm.foldCode({ line: 2, ch: 0 }, null, "fold");
        assert.strictEqual(cm.marks.length, 1);

        assert.strictEqual(foldAllEditorSections(cm), 2);
        assert.strictEqual(cm.marks.length, 3);
        assert.strictEqual(unfoldAllEditorSections(cm), 3);
        assert.strictEqual(hasFoldedSections(cm), false);
    });

    it("wires #fold-template-button, #fold-result-button, both icons, and clean FHIR Converter navbar in static UI", function () {
        const html = readFileSync(new URL("../src/static/index.html", import.meta.url), "utf8");
        const iconsSvg = readFileSync(new URL("../src/static/icons.svg", import.meta.url), "utf8");
        const navMatch = html.match(/<nav[^>]*id="navbar"[\s\S]*?<\/nav>/);
        assert.ok(navMatch, "navbar should exist");
        const navbarHtml = navMatch[0];

        assert.ok(iconsSvg.includes("id=\"icon-fold-all\""));
        assert.ok(iconsSvg.includes("id=\"icon-unfold-all\""));
        assert.ok(html.includes("id=\"fold-template-button\""));
        assert.ok(html.includes("id=\"fold-result-button\""));
        assert.ok(navbarHtml.includes("<span class=\"brand-name\">FHIR Converter</span>"));
        assert.ok(!navbarHtml.includes("Starter pack"));
        assert.ok(!navbarHtml.includes("session-pitch"));
        assert.ok(!html.includes("id=\"session-pitch\""));
    });
});
