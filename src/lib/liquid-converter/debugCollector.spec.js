import assert from "assert";
import {createNamespace, getNamespace} from "cls-hooked";
import {
    createDebugCollector,
    serializeHl7v2Debug,
    scanTemplateCaseMismatches,
    DEBUG_COLLECTOR_KEY
} from "./debugCollector.js";
import {instance as getLiquidEngine} from "./liquid-converter.js";
import {buildLineage, lookupLineage} from "./lineage.js";
import {CLS_NAMESPACE} from "../constants/constants.js";
import {trackAccess, buildUnusedSegmentsReport} from "../parsers/hl7v2/hl7v2AccessTracking.js";
import {parseHl7v2FieldModel} from "../parsers/hl7v2/hl7v2FieldModel.js";

// Plain (no "~" repeats) message: MSH.2 = "^~\&" so the subcomponent separator is "&".
const HL7_MESSAGE =
    'MSH|^~\\&|SendingFacility|Host123|ReceivingFacility|20050110045504||ADT^A01|MSGCTRL-0001|P|2.3\n' +
    'PID|1||MRN-7788||BROS^MARIO^J^II||19501002|M\n';

// Message with a "~" multi-repeat field (PID.3).
const REPEAT_MESSAGE =
    'MSH|^~\\&|F|H|R|20050110045504||ADT^A01|M|P|2.3\n' +
    'PID|1||A^B~C^D||E\n';

// Non-marking snapshot of every tracked component's _accessed flag (Components and _accessed
// are safe reads -- neither trips the tracking proxies).
function accessedSnapshot(model) {
    return model.data.map((seg) => (seg.Fields || []).map((field) => {
        if (!field) {
            return "";
        }
        return (field.Components || []).map((c) => (c && c._accessed ? 1 : 0)).join("");
    }));
}

function fakeCtx(values) {
    return {getAll() {
        return values;
    }};
}

describe('debugCollector.js', function () {
    describe('DEBUG_COLLECTOR_KEY', function () {
        it('is the CLS session key shared between worker and engine hooks', function () {
            assert.strictEqual(DEBUG_COLLECTOR_KEY, 'DEBUG_COLLECTOR');
        });
    });

    describe('serializeHl7v2Debug (no tracked model)', function () {
        it('serializes segments with line, name, raw and omits null field slots', function () {
            const out = serializeHl7v2Debug(HL7_MESSAGE, null);
            assert(Array.isArray(out.segments));
            assert.strictEqual(out.segments.length, 2);
            assert.strictEqual(out.segments[0].name, 'MSH');
            assert.strictEqual(out.segments[0].line, 0);
            assert.strictEqual(out.segments[1].name, 'PID');
            assert.strictEqual(out.segments[1].line, 1);
            assert.ok(out.segments[0].raw.startsWith('MSH|'));
            assert.ok(out.segments[1].raw.startsWith('PID|'));

            const mshFields = out.segments[0].fields.map((f) => f.index);
            // Empty slot (7) is omitted; slot 0 is never emitted.
            assert.deepStrictEqual(mshFields, [1, 2, 3, 4, 5, 6, 8, 9, 10, 11]);
            const msh9 = out.segments[0].fields.find((f) => f.index === 9);
            assert.strictEqual(msh9.value, 'MSGCTRL-0001');
            const msh10 = out.segments[0].fields.find((f) => f.index === 10);
            assert.strictEqual(msh10.value, 'P');
        });

        it('serializes atomic MSH.1 with a single unpadded repeat', function () {
            const out = serializeHl7v2Debug(HL7_MESSAGE, null);
            const msh1 = out.segments[0].fields.find((f) => f.index === 1);
            assert.strictEqual(msh1.value, '|');
            assert.strictEqual(msh1.repeats.length, 1);
            assert.deepStrictEqual(msh1.repeats[0].components.map((c) => [c.index, c.value]), [[1, '|']]);
        });

        it('serializes composite fields into repeats/components with subcomponents', function () {
            const out = serializeHl7v2Debug(HL7_MESSAGE, null);
            const pid5 = out.segments[1].fields.find((f) => f.index === 5);
            assert.strictEqual(pid5.value, 'BROS^MARIO^J^II');
            assert.strictEqual(pid5.repeats.length, 1);
            assert.deepStrictEqual(pid5.repeats[0].components.map((c) => [c.index, c.value]), [
                [1, 'BROS'], [2, 'MARIO'], [3, 'J'], [4, 'II']
            ]);
            // "&" is the subcomponent separator of this message -- none of these values contain it.
            assert.deepStrictEqual(pid5.repeats[0].components[0].subcomponents, ['BROS']);
        });

        it('splits subcomponents on the MSH.2 separator character', function () {
            const msg = 'MSH|^~\\&|F|H|R|20050110045504||ADT^A01|M|P|2.3\nNTE|1|O|A&B|1\n';
            const out = serializeHl7v2Debug(msg, null);
            const nte3 = out.segments[1].fields.find((f) => f.index === 3);
            assert.deepStrictEqual(nte3.repeats[0].components[0].subcomponents, ['A', 'B']);
        });

        it('reports all accessed=false when the tracked model is null', function () {
            const out = serializeHl7v2Debug(HL7_MESSAGE, null);
            out.segments.forEach((seg) => seg.fields.forEach((f) => {
                assert.strictEqual(f.accessed, false);
                f.repeats.forEach((rep) => rep.components.forEach((c) => {
                    assert.strictEqual(c.accessed, false);
                }));
            }));
        });

        it('serializes multi-repeat fields from the fresh re-parse', function () {
            const out = serializeHl7v2Debug(REPEAT_MESSAGE, null);
            const pid3 = out.segments[1].fields.find((f) => f.index === 3);
            assert.strictEqual(pid3.repeats.length, 2);
            assert.deepStrictEqual(pid3.repeats[0].components.map((c) => c.value), ['A', 'B']);
            assert.deepStrictEqual(pid3.repeats[1].components.map((c) => c.value), ['C', 'D']);
        });
    });

    describe('serializeHl7v2Debug (tracked model)', function () {
        it('merges accessed flags from the tracked model without mutating it', function () {
            const tracked = trackAccess(parseHl7v2FieldModel(HL7_MESSAGE));
            // Mark only PID.5 component 1 (non-marking reads: .Components and ._accessed).
            const pid5c1 = tracked.data[1].Fields[5].Components[1];
            assert.strictEqual(pid5c1._accessed, false);
            assert.strictEqual(pid5c1.Value, 'BROS'); // marking read
            assert.strictEqual(pid5c1._accessed, true);

            const before = accessedSnapshot(tracked);
            const reportBefore = buildUnusedSegmentsReport(tracked);
            const out = serializeHl7v2Debug(HL7_MESSAGE, tracked);
            // No mutation: serialization must not flip any access flag or change the report.
            assert.deepStrictEqual(accessedSnapshot(tracked), before);
            assert.deepStrictEqual(buildUnusedSegmentsReport(tracked), reportBefore);

            const pid5 = out.segments[1].fields.find((f) => f.index === 5);
            assert.strictEqual(pid5.accessed, true);
            const compAccessed = Object.fromEntries(pid5.repeats[0].components.map((c) => [c.index, c.accessed]));
            assert.deepStrictEqual(compAccessed, {1: true, 2: false, 3: false, 4: false});
            const pid3 = out.segments[1].fields.find((f) => f.index === 3);
            assert.strictEqual(pid3.accessed, false);
        });

        it('marks accessed on repeat > 0 components from their own tracked instances', function () {
            const fresh = parseHl7v2FieldModel(REPEAT_MESSAGE);
            const rawRep1 = fresh.data[1].Fields[3].Repeats[1]; // raw, pre-tracking reference
            const tracked = trackAccess(fresh);
            // Mark repeat-1 component 2 ("D") without touching the tracked field proxy.
            assert.strictEqual(rawRep1.Components[2].Value, 'D'); // marking read on the shared proxy
            const out = serializeHl7v2Debug(REPEAT_MESSAGE, tracked);
            const pid3 = out.segments[1].fields.find((f) => f.index === 3);
            const rep1 = pid3.repeats[1].components;
            assert.strictEqual(rep1.find((c) => c.index === 1).accessed, false);
            assert.strictEqual(rep1.find((c) => c.index === 2).accessed, true);
        });
    });

    describe('createDebugCollector', function () {
        it('round-trips the pending partial marker', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            assert.strictEqual(c.takePendingPartial(), null);
            c.markPartialLoaded('Resource/_MessageHeader.liquid');
            c.markPartialLoaded('ID/_Bundle.liquid');
            assert.strictEqual(c.takePendingPartial(), 'ID/_Bundle.liquid');
            assert.strictEqual(c.takePendingPartial(), null);
        });

        it('records a partial once on first render and bumps callCount on re-renders', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            const first = fakeCtx({MSH: 'seg1', local: 'a'});
            const second = fakeCtx({MSH: 'seg2', local: 'b'});
            c.recordPartialRender('Resource/_MessageHeader.liquid', first);
            c.recordPartialRender('Resource/_MessageHeader.liquid', second);
            const entry = c.partials['Resource/_MessageHeader.liquid'];
            assert.strictEqual(entry.callCount, 2);
            assert.deepStrictEqual(Object.keys(entry.firstScope), ['MSH', 'local']);
            assert.deepStrictEqual(entry.lastScope, {MSH: 'seg2', local: 'b'});
            assert.deepStrictEqual(c.partialOrder, ['Resource/_MessageHeader.liquid']);
            // A second distinct partial keeps its own order entry.
            c.recordPartialRender('ID/_Bundle.liquid', fakeCtx({bundleID: 'X'}));
            assert.deepStrictEqual(c.partialOrder, ['Resource/_MessageHeader.liquid', 'ID/_Bundle.liquid']);
        });

        it('ignores renders without a pending name and caps distinct partials at 100', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            c.recordPartialRender(null, fakeCtx({}));
            for (let i = 0; i < 101; i++) {
                c.recordPartialRender('P' + String(i).padStart(3, '0') + '.liquid', fakeCtx({i: i}));
            }
            assert.strictEqual(c.partialOrder.length, 100);
            assert.strictEqual(Object.keys(c.partials).length, 100);
            // The 101st distinct partial was dropped; re-rendering an existing one still updates.
            c.recordPartialRender('P000.liquid', fakeCtx({i: 999}));
            assert.strictEqual(c.partialOrder.length, 100);
            assert.strictEqual(c.partials['P000.liquid'].callCount, 2);
            assert.strictEqual(c.partials['P000.liquid'].lastScope.i, 999);
        });

        it('captures the root scope and prunes msg and hl7v2Data', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            c.setRootScope(fakeCtx({
                msg: {v2: {data: []}},
                hl7v2Data: {data: []},
                firstSegments: 'seg',
                bundleID: 'MSGCTRL-0001'
            }));
            const root = c.buildDebugInfo(42, null).scopes['__root__'];
            assert.deepStrictEqual(Object.keys(root).sort(), ['bundleID', 'firstSegments']);
            assert.strictEqual(root.bundleID, 'MSGCTRL-0001');
        });

        it('builds the debugInfo shape with scopes in render order', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            c.setRootScope(fakeCtx({bundleID: 'X'}));
            c.recordPartialRender('A.liquid', fakeCtx({a: 1}));
            c.recordPartialRender('B.liquid', fakeCtx({b: 2}));
            const info = c.buildDebugInfo(7, {segments: []});
            assert.strictEqual(info.durationMs, 7);
            assert.deepStrictEqual(info.parsedHl7v2, {segments: []});
            assert.deepStrictEqual(Object.keys(info.scopes), ['__root__', 'A.liquid', 'B.liquid']);
        });

        it('serializes HL7 segments, fields and components with __kind markers and the message subSep', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            const comp = (raw) => ({Subcomponents: [], _rawValue: raw, _accessed: false});
            const field = {Components: [null, comp('BROS'), comp('MARIO')]};
            const segment = {Value: 'PID|1||X||BROS^MARIO', Fields: [null, field]};
            const scope = c.boundScope(fakeCtx({seg: segment}));
            assert.strictEqual(scope.seg.__kind, 'hl7Segment');
            assert.strictEqual(scope.seg.value, 'PID|1||X||BROS^MARIO');
            const f1 = scope.seg.fields['1'];
            assert.strictEqual(f1.__kind, 'hl7Field');
            assert.strictEqual(f1.value, 'BROS^MARIO');
            assert.strictEqual(f1.components['1'].__kind, 'hl7Component');
            assert.strictEqual(f1.components['1'].value, 'BROS');
            assert.strictEqual(f1.components['1'].accessed, false);
            assert.deepStrictEqual(f1.components['2'].subcomponents, ['MARIO']);
        });

        it('splits serialized component subcomponents on "&" from the message MSH.2', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            const comp = {Subcomponents: [], _rawValue: 'A&B', _accessed: true};
            const scope = c.boundScope(fakeCtx({c: comp}));
            assert.deepStrictEqual(scope.c.subcomponents, ['A', 'B']);
            assert.strictEqual(scope.c.accessed, true);
        });

        it('caps scope snapshots at 32 keys', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            const values = {};
            for (let i = 0; i < 40; i++) {
                values['k' + String(i).padStart(2, '0')] = i;
            }
            const scope = c.boundScope(fakeCtx(values));
            assert.strictEqual(Object.keys(scope).length, 32);
        });

        it('caps arrays at 50 items with a "more" marker', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            const scope = c.boundScope(fakeCtx({arr: Array.from({length: 60}, (_, i) => i)}));
            assert.strictEqual(scope.arr.length, 51);
            assert.strictEqual(scope.arr[50], '... 10 more');
        });

        it('truncates values deeper than max depth', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            let node = {leaf: 'x'};
            for (let i = 0; i < 8; i++) {
                node = {child: node};
            }
            const scope = c.boundScope(fakeCtx({deep: node}));
            const s = JSON.stringify(scope.deep);
            assert.ok(s.includes('<truncated>'), 'expected truncation marker in ' + s);
        });
        it('serializes real array-backed tracked HL7 segments/fields/components without flipping _accessed', function () {
            const tracked = trackAccess(parseHl7v2FieldModel(HL7_MESSAGE));
            const before = buildUnusedSegmentsReport(tracked);
            const c = createDebugCollector(HL7_MESSAGE);
            const scope = c.boundScope(fakeCtx({PID: tracked.data[1], PID5: tracked.data[1].Fields[5]}));
            assert.deepStrictEqual(buildUnusedSegmentsReport(tracked), before);
            assert.strictEqual(scope.PID.__kind, 'hl7Segment');
            assert.strictEqual(scope.PID5.__kind, 'hl7Field');
            assert.strictEqual(scope.PID5.components['1'].value, 'BROS');
        });

        it('records, normalizes, deduplicates, and caps caseMismatches at 50', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            c.recordCaseMismatch({template: 'Resource/_Encounter.liquid', read: 'VisitId', actual: 'visitId'});
            c.recordCaseMismatch({template: 'Resource/_Encounter', read: 'VisitId', actual: 'visitId'});
            c.recordCaseMismatch({template: '__root__', read: 'patientId', actual: 'patientId'}); // exact match ignored
            c.recordCaseMismatch({template: '__root__', read: 'foo', actual: 'bar'}); // non-case mismatch ignored

            assert.deepStrictEqual(c.buildDebugInfo(5, null).caseMismatches, [
                {template: 'Resource/_Encounter', read: 'VisitId', actual: 'visitId'}
            ]);

            for (let i = 0; i < 60; i++) {
                c.recordCaseMismatch({
                    template: 'Resource/_Encounter',
                    read: 'Var' + i,
                    actual: 'var' + i
                });
            }
            assert.strictEqual(c.buildDebugInfo(5, null).caseMismatches.length, 50);
        });

        it('scans Liquid template expressions for case-mismatched variables without false positives on JSON or strings', function () {
            const c = createDebugCollector(HL7_MESSAGE);
            const tpl =
                '{% assign localStatus = "finished" %}' +
                '{"id": "{{ VisitId | default: \'visitid\' }}", "status": "{{ localstatus }}"}';
            scanTemplateCaseMismatches('Resource/_Encounter.liquid', tpl, ['visitId', 'PID'], c);
            assert.deepStrictEqual(c.buildDebugInfo(1, null).caseMismatches, [
                {template: 'Resource/_Encounter', read: 'VisitId', actual: 'visitId'},
                {template: 'Resource/_Encounter', read: 'localstatus', actual: 'localStatus'}
            ]);
        });

        it('tracks HL7 field lineage and case-mismatched variables end-to-end during debug Liquid rendering', async function () {
            const ns = getNamespace(CLS_NAMESPACE) || createNamespace(CLS_NAMESPACE);
            const collector = createDebugCollector(HL7_MESSAGE);
            const tracked = trackAccess(parseHl7v2FieldModel(HL7_MESSAGE));
            const overrides = {
                'DataType/_HumanName.liquid': '{"family":"{{ XPN.1.Value }}","given":["{{ XPN.2.Value }}"]}',
                'Resource/_Patient.liquid':
                    '{"resourceType":"Patient","id":"{{ AttendingDoc }}","birthDate":"{{ PID.7.Value }}","name":[{% include \'DataType/HumanName\' XPN: PID.5 %}]}',
                'Resource/_Encounter.liquid':
                    '{"resourceType":"Encounter","id":"{{ VisitId }}"}'
            };
            const engine = getLiquidEngine(true, {dataType: 'hl7v2'}, '.', overrides, {strictOverridesOnly: true});
            const rootTemplate =
                '{% assign attendingDoc = "doc-9" %}' +
                '{% assign visitId = "enc-1" %}' +
                '{"resourceType":"Bundle","entry":[' +
                '{"resource":{% include \'Resource/Patient\' PID: hl7v2Data.data[1] %}},' +
                '{"resource":{% include \'Resource/Encounter\' %}}' +
                ']}';

            const rendered = await ns.runAndReturn(async () => {
                ns.set(DEBUG_COLLECTOR_KEY, collector);
                return engine.parseAndRender(rootTemplate, {
                    hl7v2Data: tracked
                });
            });

            const bundle = JSON.parse(rendered);
            const lineage = buildLineage(collector.lineageRenders, rendered, bundle);
            const familyRow = lookupLineage(lineage, 'entry.0.resource.name.0.family');
            assert.deepStrictEqual(familyRow, {
                outputPath: 'entry.0.resource.name.0.family',
                template: 'DataType/_HumanName.liquid',
                sourcePath: 'PID.5'
            });
            const dobRow = lookupLineage(lineage, 'entry.0.resource.birthDate');
            assert.deepStrictEqual(dobRow, {
                outputPath: 'entry.0.resource.birthDate',
                template: 'Resource/_Patient.liquid',
                sourcePath: 'PID.7'
            });

            const info = collector.buildDebugInfo(10, null);
            assert.ok(
                info.caseMismatches.some(
                    (m) => m.template === 'Resource/_Encounter' && m.read === 'VisitId' && m.actual === 'visitId'
                ),
                'expected Encounter VisitId mismatch in ' + JSON.stringify(info.caseMismatches)
            );
            assert.ok(
                info.caseMismatches.some(
                    (m) => m.template === 'Resource/_Patient' && m.read === 'AttendingDoc' && m.actual === 'attendingDoc'
                ),
                'expected Patient AttendingDoc mismatch in ' + JSON.stringify(info.caseMismatches)
            );

            // Unused fields such as PID.3 and PID.8 must remain unaccessed!
            const unused = buildUnusedSegmentsReport(tracked);
            const pidUnused = unused.find((s) => s.type === 'PID');
            const unusedFieldIndices = pidUnused.field.map((f) => f.index);
            assert.ok(unusedFieldIndices.includes(3));
            assert.ok(unusedFieldIndices.includes(8));
        });
    });
});
