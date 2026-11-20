import assert from "assert";
import {
    lookupLineage,
    recordLineageRender,
    traceRender,
    buildLineage
} from "./lineage.js";

const FAMILY_ROW = {
    outputPath: "entry.0.resource.name.0.family",
    template: "Resource/_Patient",
    sourcePath: "PID.5.1"
};

describe("result lineage", function () {
    describe("lookupLineage", function () {
        it("returns the row recorded for the exact output path", function () {
            assert.strictEqual(lookupLineage([FAMILY_ROW], "entry.0.resource.name.0.family"), FAMILY_ROW);
        });

        it("returns no row for a path nothing recorded", function () {
            assert.strictEqual(lookupLineage([FAMILY_ROW], "entry.0.resource.id"), null);
        });

        it("prefers the longest prefix and respects path-segment boundaries", function () {
            const parent = {outputPath: "entry.0.resource.name", template: "Resource/_Patient", sourcePath: ""};
            const sibling = {outputPath: "entry.0.resource.name.1", template: "Other", sourcePath: ""};
            const rows = [parent, FAMILY_ROW, sibling];
            assert.strictEqual(lookupLineage(rows, "entry.0.resource.name.0.family.extra"), FAMILY_ROW);
            assert.strictEqual(lookupLineage(rows, "entry.0.resource.name.0.given.0"), parent);
            assert.strictEqual(lookupLineage(rows, "entry.0.resource.names"), null);
            assert.strictEqual(lookupLineage(rows, "entry.0.resource.name.10"), parent);
        });

        it("tolerates a missing lineage array", function () {
            assert.strictEqual(lookupLineage(undefined, "a"), null);
        });
    });

    describe("buildLineage", function () {
        function render(text, parts) {
            // parts: [{template, from, to}] where from/to bracket a substring of text.
            const emitter = {buffer: text};
            const collector = {};
            for (const p of parts) {
                recordLineageRender(collector, p.template, emitter, text.indexOf(p.from), text.indexOf(p.to) + p.to.length);
            }
            return {collector, rendered: text};
        }

        it("names the innermost include and leaves sourcePath empty", function () {
            const text = '{"entry":[{"resource":{"id":"abc","name":[{"family":"BROS"}]}}]}';
            const {collector, rendered} = render(text, [
                {template: "Resource/_Patient", from: '"resource"', to: '"BROS"}]'},
                {template: "DataType/_HumanName", from: '{"family"', to: '"BROS"}'}
            ]);
            const resource = JSON.parse(text);
            const rows = buildLineage(collector.lineageRenders, rendered, resource);
            const family = lookupLineage(rows, "entry.0.resource.name.0.family");
            assert.deepStrictEqual(family, {
                outputPath: "entry.0.resource.name.0.family",
                template: "DataType/_HumanName",
                sourcePath: ""
            });
            const id = lookupLineage(rows, "entry.0.resource.id");
            assert.strictEqual(id.template, "Resource/_Patient");
            assert.strictEqual(id.sourcePath, "");
        });

        it("records no row for a value no include wrote", function () {
            const text = '{"a":"root-literal","b":{"c":"from-include"}}';
            const {collector, rendered} = render(text, [
                {template: "Resource/_B", from: '{"c"', to: '"from-include"}'}
            ]);
            const rows = buildLineage(collector.lineageRenders, rendered, JSON.parse(text));
            assert.strictEqual(lookupLineage(rows, "a"), null);
            assert.strictEqual(lookupLineage(rows, "b.c").template, "Resource/_B");
        });

        it("ignores spans written to a different emitter than the root output", function () {
            const text = '{"b":"x"}';
            const collector = {};
            recordLineageRender(collector, "Resource/_Capture", {buffer: "other"}, 0, 5);
            assert.deepStrictEqual(buildLineage(collector.lineageRenders, text, JSON.parse(text)), []);
        });

        it("does not treat an object key as the value", function () {
            const text = '{"code":{"x":"code"},"y":1}';
            const {collector, rendered} = render(text, [{template: "T", from: '{"x"', to: '"code"}'}]);
            const rows = buildLineage(collector.lineageRenders, rendered, JSON.parse(text));
            assert.strictEqual(lookupLineage(rows, "code.x").template, "T");
            assert.strictEqual(lookupLineage(rows, "y"), null);
        });
    });

    describe("traceRender", function () {
        it("records the span an include wrote and returns the inner result unchanged", function () {
            const emitter = {buffer: "prefix-"};
            const collector = {};
            function* inner() {
                emitter.buffer += "written";
                yield "step";
                return emitter.buffer;
            }
            const it = traceRender(collector, "Resource/_X", emitter, inner());
            assert.deepStrictEqual(it.next(), {value: "step", done: false});
            assert.deepStrictEqual(it.next(), {value: "prefix-written", done: true});
            assert.strictEqual(collector.lineageRenders.length, 1);
            const span = collector.lineageRenders[0];
            assert.strictEqual(span.template, "Resource/_X");
            assert.strictEqual(emitter.buffer.slice(span.start, span.end), "written");
        });
    });
});
