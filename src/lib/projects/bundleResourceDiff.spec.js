import assert from "assert";
import {readFile} from "fs/promises";
import vm from "vm";
import {bundleResourceDiff} from "./bundleResourceDiff.js";

async function loadBrowserTwin() {
    const source = await readFile(new URL("../../static/js/debug-drawer.js", import.meta.url), "utf8");
    const match = source.match(/\/\/ BEGIN bundleResourceDiff[^\n]*\n([\s\S]*?)\n\s*\/\/ END bundleResourceDiff/);
    assert.ok(match, "debug-drawer.js must contain the bundleResourceDiff twin");
    return vm.runInNewContext(`(function () {\n${match[1]}\nreturn bundleResourceDiff;\n})()`);
}

const patient = (id, extra = {}) => ({fullUrl: `urn:uuid:${id}`, resource: {resourceType: "Patient", id, ...extra}});
const bundle = (...entry) => ({resourceType: "Bundle", entry});

describe("projects/bundleResourceDiff", function () {
    let browserTwin;

    before(async function () {
        browserTwin = await loadBrowserTwin();
    });

    const cases = [
        {
            name: "reports one added resource",
            actual: bundle(patient("a"), {resource: {resourceType: "Encounter", id: "e1"}}),
            expected: bundle(patient("a")),
            result: {added: [{key: "Encounter/e1", resourceType: "Encounter", id: "e1"}], removed: [], changed: []}
        },
        {
            name: "reports one removed resource",
            actual: bundle(patient("a")),
            expected: bundle(patient("a"), {resource: {resourceType: "Observation", id: "o1"}}),
            result: {added: [], removed: [{key: "Observation/o1", resourceType: "Observation", id: "o1"}], changed: []}
        },
        {
            name: "reports one changed resource regardless of property order",
            actual: bundle(patient("a", {active: true, gender: "male"}), patient("b", {gender: "male"})),
            expected: bundle(patient("b", {gender: "male"}), patient("a", {gender: "female", active: true})),
            result: {added: [], removed: [], changed: [{key: "Patient/a", resourceType: "Patient", id: "a"}]}
        },
        {
            name: "returns three empty lists for equal bundles",
            actual: bundle(patient("a", {name: [{family: "X"}]}), patient("b")),
            expected: bundle(patient("b"), patient("a", {name: [{family: "X"}]})),
            result: {added: [], removed: [], changed: []}
        },
        {
            name: "sorts by key and uses a urn:uuid fullUrl for a missing id",
            actual: bundle(
                {fullUrl: "urn:uuid:zzz", resource: {resourceType: "Patient"}},
                {fullUrl: "urn:uuid:aaa", resource: {resourceType: "Patient"}}
            ),
            expected: bundle(),
            result: {
                added: [
                    {key: "Patient/aaa", resourceType: "Patient", id: "aaa"},
                    {key: "Patient/zzz", resourceType: "Patient", id: "zzz"}
                ],
                removed: [],
                changed: []
            }
        },
        {
            name: "lists an entry with no usable id as unmatched with its index",
            actual: bundle(patient("a"), {resource: {resourceType: "Task"}}),
            expected: bundle({resource: {resourceType: "Task"}}, patient("a")),
            result: {
                added: [{key: "Task/1", resourceType: "Task", id: ""}],
                removed: [{key: "Task/0", resourceType: "Task", id: ""}],
                changed: []
            }
        }
    ];

    cases.forEach((c) => {
        it(c.name, function () {
            assert.deepStrictEqual(bundleResourceDiff(c.actual, c.expected), c.result);
        });
        it(`${c.name} (drawer twin)`, function () {
            assert.strictEqual(JSON.stringify(browserTwin(c.actual, c.expected)), JSON.stringify(c.result));
        });
    });
});
