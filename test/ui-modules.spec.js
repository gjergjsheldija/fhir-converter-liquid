import assert from 'assert';
import express from 'express';
import { readdirSync, readFileSync } from 'fs';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import supertest from 'supertest';
import { fileURLToPath } from 'url';
import vm from 'vm';
import fileSystemCache from '../src/lib/fsCache/cache.js';
import registerStudioRoutes from '../src/routes/studio.routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const staticDir = path.join(__dirname, '../src/static');
const jsDir = path.join(staticDir, 'js');

function loadClassicScripts(fileNames, extraGlobals = {}) {
    const context = vm.createContext(Object.assign({
        console,
        setTimeout,
        clearTimeout,
        Object,
        Array,
        String,
        Number,
        Boolean,
        JSON,
        Math,
        RegExp
    }, extraGlobals));
    context.window = context.window || context;
    context.globalThis = context;

    fileNames.forEach((fileName) => {
        const fullPath = path.join(jsDir, fileName);
        const source = readFileSync(fullPath, 'utf8');
        const script = new vm.Script(source, { filename: fileName });
        script.runInContext(context);
    });

    return context;
}

function createStorageMock(initial = {}) {
    const store = Object.assign({}, initial);
    return {
        store,
        getItem(key) {
            return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
        },
        setItem(key, value) {
            store[key] = String(value);
        },
        removeItem(key) {
            delete store[key];
        }
    };
}

describe('Web UI classic script modules decomposition', function () {
    it('keeps every file in src/static/js/*.js valid classic script syntax with zero import/export statements', function () {
        const jsFiles = readdirSync(jsDir).filter((name) => name.endsWith('.js')).sort();
        assert.ok(jsFiles.length >= 19, 'expected decomposed static JS modules');

        jsFiles.forEach((fileName) => {
            const source = readFileSync(path.join(jsDir, fileName), 'utf8');
            assert.strictEqual(
                /^\s*(?:import|export)\b/m.test(source),
                false,
                `${fileName} must not contain ES module import/export statements`
            );
            // vm.Script parses strictly as a classic script (throws SyntaxError on any ES module export/import token).
            assert.doesNotThrow(
                () => new vm.Script(source, { filename: fileName }),
                `${fileName} must parse as a classic <script>`
            );
        });
    });

    it('loads the 5 extracted modules right before template-editor.js in src/static/index.html', function () {
        const html = readFileSync(path.join(staticDir, 'index.html'), 'utf8');
        const expectedOrder = [
            '/js/settings-modal.js',
            '/js/includes-panel.js',
            '/js/sample-manager.js',
            '/js/ai-panel.js',
            '/js/fhir-actions.js',
            '/js/template-editor.js'
        ];
        let prevIdx = -1;
        expectedOrder.forEach((src) => {
            const tag = `<script type="text/javascript" src="${src}"></script>`;
            const idx = html.indexOf(tag);
            assert.ok(idx !== -1, `missing classic script tag for ${src}`);
            assert.ok(idx > prevIdx, `${src} must appear in order before template-editor.js`);
            prevIdx = idx;
        });
        assert.strictEqual(/<script[^>]+type=["']module["']/i.test(html), false);
    });

    describe('settings-modal.js', function () {
        it('hydrates and persists settings, resolves theme/palette, and injects Bearer convertApiKey via ajaxPrefilter', function () {
            const localStorage = createStorageMock({
                fhirConverterSettings: JSON.stringify({
                    darkMode: true,
                    palette: 'grove',
                    convertApiKey: 'secret-token-123',
                    aiProvider: 'anthropic',
                    aiApiKey: 'sk-ant-legacy'
                })
            });
            const dataset = {};
            let registeredPrefilter = null;
            let validateCalls = 0;

            const ctx = loadClassicScripts(['settings-modal.js'], {
                localStorage,
                document: { documentElement: { dataset } },
                window: {
                    matchMedia() {
                        return { matches: true, addEventListener() {} };
                    }
                },
                $: {
                    ajaxPrefilter(fn) {
                        registeredPrefilter = fn;
                    }
                },
                updateValidateButton() {
                    validateCalls += 1;
                }
            });

            assert.strictEqual(ctx.SETTINGS_STORAGE_KEY, 'fhirConverterSettings');
            assert.strictEqual(ctx.DEFAULT_EDITOR_SETTINGS.palette, 'paper');
            assert.strictEqual(ctx.getSettings().aiApiKeys.anthropic, 'sk-ant-legacy');
            assert.strictEqual(ctx.resolveStoredTheme(), 'dark');
            assert.strictEqual(ctx.resolveStoredPalette(), 'grove');

            ctx.applyTheme('system');
            assert.strictEqual(dataset.theme, 'dark');
            ctx.applyPalette('slate');
            assert.strictEqual(dataset.palette, 'slate');
            ctx.applyPalette('unknown');
            assert.strictEqual(dataset.palette, 'paper');

            assert.strictEqual(typeof registeredPrefilter, 'function');
            const apiOpts = { url: '/api/v1/convert/hl7v2', headers: {} };
            registeredPrefilter(apiOpts);
            assert.strictEqual(apiOpts.headers.Authorization, 'Bearer secret-token-123');

            const nonApiOpts = { url: '/icons.svg', headers: {} };
            registeredPrefilter(nonApiOpts);
            assert.strictEqual(nonApiOpts.headers.Authorization, undefined);

            const customAuthOpts = { url: '/api/v1/convert/hl7v2', headers: { Authorization: 'Bearer override' } };
            registeredPrefilter(customAuthOpts);
            assert.strictEqual(customAuthOpts.headers.Authorization, 'Bearer override');

            const updated = Object.assign({}, ctx.getSettings(), { theme: 'light', palette: 'slate' });
            ctx.setSettings(updated);
            assert.strictEqual(validateCalls, 1);
            assert.strictEqual(JSON.parse(localStorage.getItem('fhirConverterSettings')).palette, 'slate');
        });
    });

    describe('includes-panel.js', function () {
        it('parses include/render/evaluate references, resolves target file names, and locates partials on lines', function () {
            const ctx = loadClassicScripts(['includes-panel.js'], {
                templateNames: [
                    'Resource/_Patient.liquid',
                    'ID/_Patient.liquid',
                    'CodeSystem/CodeSystem.json',
                    'Header.liquid'
                ],
                openTemplates: [
                    { name: 'DataType/_HumanName.liquid', data: '' }
                ]
            });

            const templateSource = [
                "{%- evaluate patientId using 'ID/Patient' PID: firstSegments.PID -%}",
                "{% include 'Resource/Patient' PID: firstSegments.PID, ID: patientId %}",
                "{% render 'DataType/HumanName' %}",
                "{% include 'Resource/Patient' PID: firstSegments.PID %}",
                "{% include 'Custom/MissingPartial' %}"
            ].join('\n');

            const refs = ctx.findIncludeRefs(templateSource);
            assert.deepStrictEqual(
                refs.map((r) => r.quoted),
                ['ID/Patient', 'Resource/Patient', 'DataType/HumanName', 'Custom/MissingPartial']
            );

            assert.strictEqual(ctx.targetIncludeFileName('Resource/Patient'), 'Resource/_Patient.liquid');
            assert.strictEqual(ctx.targetIncludeFileName('Resource/_Patient.liquid'), 'Resource/_Patient.liquid');
            assert.strictEqual(ctx.targetIncludeFileName('CodeSystem/CodeSystem'), 'CodeSystem/CodeSystem.json');
            assert.strictEqual(ctx.targetIncludeFileName('ValueSet/ValueSet'), 'ValueSet/ValueSet.json');
            assert.strictEqual(ctx.targetIncludeFileName('Header'), 'Header.liquid');
            assert.strictEqual(ctx.targetIncludeFileName('../outside'), null);
            assert.strictEqual(ctx.targetIncludeFileName('bad\\slash'), null);
            assert.strictEqual(ctx.targetIncludeFileName(''), null);

            assert.strictEqual(ctx.resolveIncludeName('Resource/Patient'), 'Resource/_Patient.liquid');
            assert.strictEqual(ctx.resolveIncludeName('CodeSystem/CodeSystem'), 'CodeSystem/CodeSystem.json');
            assert.strictEqual(ctx.resolveIncludeName('Header'), 'Header.liquid');
            assert.strictEqual(ctx.resolveIncludeName('DataType/HumanName'), 'DataType/_HumanName.liquid');
            assert.strictEqual(ctx.resolveIncludeName('Custom/MissingPartial'), null);

            assert.strictEqual(ctx.includeGroupKey('Resource/Patient'), 'Resource');
            assert.strictEqual(ctx.includeGroupKey('Header'), 'Root');
            assert.strictEqual(ctx.includeRowLabel('Resource/Patient'), 'Patient');

            const lineMatches = ctx.findPartialNamesOnLine("  {% include 'Resource/Patient' %} {% include 'Custom/NewOne' %}");
            assert.strictEqual(lineMatches.length, 2);
            assert.strictEqual(lineMatches[0].quoted, 'Resource/Patient');
            assert.strictEqual(lineMatches[0].exists, true);
            assert.strictEqual(lineMatches[1].quoted, 'Custom/NewOne');
            assert.strictEqual(lineMatches[1].exists, false);
        });
    });

    describe('sample-manager.js', function () {
        it('sanitizes sample filenames, derives HL7 event types, and builds synthetic HL7v2 messages', function () {
            const ctx = loadClassicScripts(['sample-manager.js']);

            assert.strictEqual(ctx.isSupportedSampleFile('ADT01.hl7'), true);
            assert.strictEqual(ctx.isSupportedSampleFile('ADT01.MSG'), true);
            assert.strictEqual(ctx.isSupportedSampleFile('notes.txt'), true);
            assert.strictEqual(ctx.isSupportedSampleFile('bundle.json'), false);

            assert.strictEqual(ctx.sanitizeSampleFileName('my sample (1).hl7'), 'my_sample__1_.hl7');
            assert.strictEqual(ctx.sanitizeSampleFileName('raw-data.json'), 'raw-data.hl7');
            assert.strictEqual(ctx.sanitizeSampleFileName('.hidden.hl7'), 'hidden.hl7');
            assert.strictEqual(ctx.sanitizeSampleFileName('.hidden'), 'sample.hl7');
            assert.strictEqual(ctx.sanitizeSampleFileName(''), 'sample.hl7');
            assert.strictEqual(ctx.nextSampleFileName('ADT04-23.hl7'), 'ADT04-23-2.hl7');

            assert.strictEqual(ctx.sampleEventTypeFromTemplate('ORU_R01.liquid'), 'ORU^R01');
            assert.strictEqual(ctx.sampleEventTypeFromTemplate('VXU_V04.liquid'), 'VXU^V04');
            assert.strictEqual(ctx.sampleEventTypeFromTemplate('untitled'), 'ADT^A04');

            const oruMsg = ctx.buildSyntheticSampleMessage('ORU^R01');
            assert.ok(oruMsg.includes('MSH|^~\\&|'));
            assert.ok(oruMsg.includes('|ORU^R01|MSG00001|'));
            assert.ok(oruMsg.includes('\nOBX|1|ST|'));
            assert.strictEqual(ctx.defaultSampleFileName(oruMsg), 'ORU_R01-MSG00001.hl7');

            const vxuMsg = ctx.buildSyntheticSampleMessage('VXU^V04');
            assert.ok(vxuMsg.includes('\nRXA|0|1|'));
        });
    });

    describe('ai-panel.js', function () {
        it('selects HL7v2 vs C-CDA vs custom AI prompts and computes collision-free generated template names', function () {
            let family = 'hl7v2';
            const ctx = loadClassicScripts(['ai-panel.js'], {
                getActiveProjectFamily() {
                    return family;
                },
                templateNames: ['generated.liquid'],
                openTemplates: [{ name: 'generated-2.liquid' }]
            });

            assert.ok(ctx.DEFAULT_AI_PROMPT.includes('hl7v2Data'));
            assert.strictEqual(ctx.effectiveAiPrompt(''), ctx.DEFAULT_AI_PROMPT);
            assert.strictEqual(ctx.effectiveAiPrompt(ctx.DEFAULT_AI_PROMPT), ctx.DEFAULT_AI_PROMPT);

            family = 'ccda';
            assert.strictEqual(ctx.effectiveAiPrompt(''), ctx.CCDA_AI_PROMPT);
            assert.strictEqual(ctx.effectiveAiPrompt(ctx.DEFAULT_AI_PROMPT), ctx.CCDA_AI_PROMPT);
            assert.strictEqual(ctx.effectiveAiPrompt('Custom mapping guidance'), 'Custom mapping guidance');

            assert.strictEqual(ctx.providerNeedsCustomUrl('local'), true);
            assert.strictEqual(ctx.providerNeedsCustomUrl('custom'), true);
            assert.strictEqual(ctx.providerNeedsCustomUrl('openai'), false);
            assert.strictEqual(ctx.nextGeneratedName(), 'generated-3.liquid');
        });
    });

    describe('fhir-actions.js & full workbench integration', function () {
        it('parses FHIR result JSON and loads all 6 workbench scripts cleanly in browser order', function () {
            let resultValue = '';
            const elements = {
                '#validate-fhir-button': {
                    length: 1,
                    props: {},
                    attrs: {},
                    prop(k, v) {
                        this.props[k] = v;
                        return this;
                    },
                    attr(k, v) {
                        this.attrs[k] = v;
                        return this;
                    }
                },
                '#send-fhir-button': {
                    length: 1,
                    props: {},
                    prop(k, v) {
                        this.props[k] = v;
                        return this;
                    }
                }
            };
            const $mock = function (selector) {
                return elements[selector] || {
                    length: 0,
                    on() {
                        return this;
                    },
                    prop() {
                        return this;
                    },
                    attr() {
                        return this;
                    }
                };
            };
            $mock.ajaxPrefilter = function () {};

            const ctx = loadClassicScripts(
                [
                    'settings-modal.js',
                    'includes-panel.js',
                    'sample-manager.js',
                    'ai-panel.js',
                    'fhir-actions.js',
                    'template-editor.js'
                ],
                {
                    localStorage: createStorageMock(),
                    $: $mock
                }
            );

            ctx.outputCode = {
                getValue() {
                    return resultValue;
                }
            };

            assert.strictEqual(ctx.parseResultResource(), null);
            resultValue = 'not json';
            assert.strictEqual(ctx.parseResultResource(), null);
            resultValue = JSON.stringify({ foo: 'bar' });
            assert.strictEqual(ctx.parseResultResource(), null);
            resultValue = JSON.stringify({ resourceType: 'Bundle', type: 'batch', entry: [{ resource: { resourceType: 'Patient' } }] });
            assert.strictEqual(ctx.parseResultResource().resourceType, 'Bundle');

            ctx.updateValidateButton();
            assert.strictEqual(elements['#validate-fhir-button'].props.hidden, true);
            assert.strictEqual(elements['#validate-fhir-button'].props.disabled, true);
            assert.strictEqual(elements['#send-fhir-button'].props.hidden, true);

            ctx.setSettings(Object.assign({}, ctx.getSettings(), { fhirBaseUrl: 'https://hapi.fhir.org/baseR4' }));
            assert.strictEqual(elements['#validate-fhir-button'].props.hidden, false);
            assert.strictEqual(elements['#validate-fhir-button'].props.disabled, false);
            assert.strictEqual(elements['#send-fhir-button'].props.hidden, false);

            assert.strictEqual(ctx.conversionStatusLabel(ctx.parseResultResource()), 'Converted · Bundle · 1 resource');
            assert.strictEqual(ctx.getUrl('templates', 'ADT_A04.liquid'), '/api/v1/templates/ADT_A04.liquid');
            assert.strictEqual(ctx.indexOfX('PID|1||10001|', '|', 2), 6);
            assert.strictEqual(ctx.unchangedFromReference('untitled', ''), true);
        });
    });

    describe('Bidirectional FHIR -> HL7v2 Studio support', function () {
        it('exposes HL7v2 gateway defaults in DEFAULT_EDITOR_SETTINGS', function () {
            const ctx = loadClassicScripts(['settings-modal.js'], {
                localStorage: createStorageMock()
            });
            assert.strictEqual(ctx.DEFAULT_EDITOR_SETTINGS.hl7GwUrl, '');
            assert.strictEqual(ctx.DEFAULT_EDITOR_SETTINGS.hl7GwFormat, 'json_envelope');
            assert.strictEqual(ctx.DEFAULT_EDITOR_SETTINGS.hl7GwAuth, 'none');
            assert.strictEqual(ctx.DEFAULT_EDITOR_SETTINGS.hl7GwToken, '');
            assert.strictEqual(ctx.DEFAULT_EDITOR_SETTINGS.hl7GwUsername, '');
            assert.strictEqual(ctx.DEFAULT_EDITOR_SETTINGS.hl7GwPassword, '');
        });

        it('formats conversionStatusLabel on HL7v2 conversion metadata', function () {
            const ctx = loadClassicScripts(['template-editor.js']);
            assert.strictEqual(
                ctx.conversionStatusLabel({
                    hl7v2Message: 'MSH|^~\\&|A|B\rPID|1||10001',
                    messageType: 'MDM^T02',
                    segmentCount: 16
                }),
                'Converted · MDM^T02 · 16 segments'
            );
            assert.strictEqual(
                ctx.conversionStatusLabel({
                    messageType: 'ADT^A03',
                    segmentCount: 1
                }),
                'Converted · ADT^A03 · 1 segment'
            );
            assert.strictEqual(
                ctx.conversionStatusLabel({
                    hl7v2Message: 'MSH|^~\\&|A|B\rPID|1||10001\rPV1|1|I'
                }),
                'Converted · HL7v2 · 3 segments'
            );
        });

        it('selects FHIR_TO_HL7V2_AI_PROMPT in effectiveAiPrompt when currentDataType is fhir', function () {
            const ctx = loadClassicScripts(['ai-panel.js'], {
                currentDataType: 'fhir',
                getActiveProjectFamily() {
                    return 'hl7v2';
                }
            });

            assert.ok(ctx.FHIR_TO_HL7V2_AI_PROMPT.includes('MSH|^~\\&|'));
            assert.strictEqual(ctx.effectiveAiPrompt(''), ctx.FHIR_TO_HL7V2_AI_PROMPT);
            assert.strictEqual(ctx.effectiveAiPrompt(ctx.DEFAULT_AI_PROMPT), ctx.FHIR_TO_HL7V2_AI_PROMPT);
            assert.strictEqual(ctx.effectiveAiPrompt('My custom reverse prompt'), 'My custom reverse prompt');

            ctx.currentDataType = 'hl7v2';
            assert.strictEqual(ctx.effectiveAiPrompt(ctx.FHIR_TO_HL7V2_AI_PROMPT), ctx.DEFAULT_AI_PROMPT);
        });

        it('supports .json FHIR Bundle samples in sample-manager.js when currentDataType is fhir', function () {
            let putRequest = null;
            const ctx = loadClassicScripts(['sample-manager.js', 'template-editor.js'], {
                $: {
                    ajax(opts) {
                        putRequest = opts;
                        return {
                            done(cb) {
                                cb({ ok: true, messageName: 'fhir/Discharge_Bundle.json' });
                                return this;
                            },
                            fail() {
                                return this;
                            }
                        };
                    }
                }
            });

            ctx.currentDataType = 'fhir';
            assert.strictEqual(ctx.isSupportedSampleFile('Discharge_Composition_Bundle.json'), true);
            assert.strictEqual(ctx.isSupportedSampleFile('ADT01.hl7'), false);
            assert.strictEqual(ctx.sanitizeSampleFileName('Discharge Bundle'), 'Discharge_Bundle.json');
            assert.strictEqual(ctx.validateFhirBundleSampleText('{"resourceType":"Patient"}').ok, false);
            assert.strictEqual(ctx.validateFhirBundleSampleText('{"resourceType":"Bundle","id":"b1"}').ok, true);
            assert.strictEqual(ctx.defaultSampleFileName('{"resourceType":"Bundle","id":"disch-1"}'), 'disch-1.json');

            let savedName = null;
            ctx.putSampleFile('Discharge_Bundle.json', '{"resourceType":"Bundle","type":"document"}', (err, name) => {
                assert.strictEqual(err, null);
                savedName = name;
            });
            assert.strictEqual(putRequest.url, '/api/v1/sample-data/fhir/Discharge_Bundle.json');
            assert.strictEqual(savedName, 'fhir/Discharge_Bundle.json');
        });

        it('constructs sendToHl7Gateway payload, toggles gateway/FHIR action buttons, and switches Studio modes cleanly', function () {
            let resultText = 'MSH|^~\\&|HIS|HOSP|EHR|DEST|20260101120000||MDM^T02|MSG1|P|2.5.1\nPID|1||10001';
            const ajaxCalls = [];
            const elements = {};
            function getEl(sel) {
                if (!elements[sel]) {
                    elements[sel] = {
                        length: 1,
                        props: {},
                        attrs: {},
                        classes: new Set(),
                        textVal: '',
                        prop(k, v) {
                            if (v === undefined) {
                                return this.props[k];
                            }
                            this.props[k] = v;
                            return this;
                        },
                        attr(k, v) {
                            if (v === undefined) {
                                return this.attrs[k];
                            }
                            this.attrs[k] = v;
                            return this;
                        },
                        removeAttr(k) {
                            delete this.attrs[k];
                            return this;
                        },
                        toggleClass(cls, force) {
                            if (force) {
                                this.classes.add(cls);
                            } else {
                                this.classes.delete(cls);
                            }
                            return this;
                        },
                        text(v) {
                            if (v === undefined) {
                                return this.textVal;
                            }
                            this.textVal = String(v);
                            return this;
                        },
                        on() {
                            return this;
                        }
                    };
                }
                return elements[sel];
            }
            const $mock = function (sel) {
                return getEl(sel);
            };
            $mock.ajaxPrefilter = function () {};
            $mock.ajax = function (urlOrOpts, maybeOpts) {
                const url = typeof urlOrOpts === 'string' ? urlOrOpts : urlOrOpts.url;
                const opts = typeof urlOrOpts === 'string' ? (maybeOpts || {}) : urlOrOpts;
                ajaxCalls.push({ url, opts });
                if (url === '/api/v1/hl7v2/send' && typeof opts.success === 'function') {
                    opts.success({ ok: true, ackCode: 'AA' });
                } else if (url === '/api/v1/sample-data?dataType=fhir' && typeof opts.success === 'function') {
                    opts.success({
                        messages: [{ messageName: 'fhir/Discharge_Composition_Bundle.json', source: 'builtin' }]
                    });
                } else if (url === '/api/v1/templates?dataType=fhir' && typeof opts.success === 'function') {
                    opts.success({
                        templates: [
                            { templateName: 'FhirToHl7v2/MDM_T02.liquid' },
                            { templateName: 'FhirToHl7v2/Segment/_MSH.liquid' }
                        ]
                    });
                }
            };

            const ctx = loadClassicScripts(
                [
                    'settings-modal.js',
                    'includes-panel.js',
                    'sample-manager.js',
                    'ai-panel.js',
                    'fhir-actions.js',
                    'template-editor.js'
                ],
                {
                    localStorage: createStorageMock(),
                    $: $mock
                }
            );

            const dataOpts = {};
            const outputOpts = {};
            ctx.dataEditor = {
                setValue() {},
                setOption(k, v) { dataOpts[k] = v; },
                refresh() {}
            };
            ctx.outputCode = {
                getValue() { return resultText; },
                setValue(v) { resultText = v; },
                setOption(k, v) { outputOpts[k] = v; },
                refresh() {}
            };

            ctx.setSettings(Object.assign({}, ctx.getSettings(), {
                fhirBaseUrl: 'https://hapi.fhir.org/baseR4',
                hl7GwUrl: 'https://gw.example.org/hl7',
                hl7GwFormat: 'raw_er7',
                hl7GwAuth: 'bearer',
                hl7GwToken: 'gw-secret-token',
                hl7GwUsername: 'u',
                hl7GwPassword: 'p'
            }));

            ctx.switchStudioDataType('fhir');
            assert.strictEqual(ctx.currentDataType, 'fhir');
            assert.strictEqual(ctx.templateKeyPrefix, 'FhirToHl7v2/');
            assert.deepStrictEqual(Array.from(ctx.templateNames), ['MDM_T02.liquid', 'Segment/_MSH.liquid']);
            assert.strictEqual(ctx.resolveIncludeName('Segment/MSH'), 'Segment/_MSH.liquid');
            assert.strictEqual(getEl('#input-pane-label').textVal, 'FHIR Bundle (JSON)');
            assert.strictEqual(getEl('#output-pane-label').textVal, 'HL7v2 Result');
            assert.deepStrictEqual(JSON.parse(JSON.stringify(dataOpts.mode)), { name: 'javascript', json: true });
            assert.strictEqual(dataOpts.foldGutter, true);
            assert.strictEqual(outputOpts.mode, 'hl7v2');
            assert.strictEqual(getEl('#validate-fhir-button').props.hidden, true);
            assert.strictEqual(getEl('#send-fhir-button').props.hidden, true);
            assert.strictEqual(getEl('#send-hl7v2-button').props.hidden, false);

            resultText = 'MSH|^~\\&|HIS|HOSP|EHR|DEST|20260101120000||MDM^T02|MSG1|P|2.5.1\nPID|1||10001';
            ctx.sendToHl7Gateway();
            const sendCall = ajaxCalls.find((c) => c.url === '/api/v1/hl7v2/send');
            assert.ok(sendCall, 'expected POST to /api/v1/hl7v2/send');
            const parsedPayload = JSON.parse(sendCall.opts.data);
            assert.deepStrictEqual(parsedPayload, {
                gatewayUrl: 'https://gw.example.org/hl7',
                hl7v2Message: 'MSH|^~\\&|HIS|HOSP|EHR|DEST|20260101120000||MDM^T02|MSG1|P|2.5.1\rPID|1||10001',
                format: 'raw_er7',
                auth: 'bearer',
                token: 'gw-secret-token',
                username: 'u',
                password: 'p'
            });
            assert.strictEqual(getEl('#conversion-status').textVal, 'Sent · ACK AA');
        });
    });

    describe('studio.routes.js reverse FHIR sample & template endpoints', function () {
        let tmpRoot;
        let testApp;

        beforeEach(async function () {
            tmpRoot = await mkdtemp(path.join(tmpdir(), 'fhir-studio-reverse-'));
            const hl7Samples = path.join(tmpRoot, 'sample-data');
            const userHl7Samples = path.join(tmpRoot, 'user-samples');
            const revSamples = path.join(tmpRoot, 'reverse-samples');
            const userRevSamples = path.join(tmpRoot, 'user-reverse-samples');
            const hl7Templates = path.join(tmpRoot, 'service-templates');
            const revTemplates = path.join(tmpRoot, 'service-reverse-templates');
            const revBaseTemplates = path.join(tmpRoot, 'reverse-templates');

            await mkdir(path.join(hl7Samples, 'hl7v2'), { recursive: true });
            await mkdir(path.join(revSamples, 'fhir'), { recursive: true });
            await mkdir(path.join(hl7Templates, 'Hl7v2'), { recursive: true });
            await mkdir(path.join(revTemplates, 'FhirToHl7v2', 'Segment'), { recursive: true });
            await mkdir(revBaseTemplates, { recursive: true });

            await writeFile(path.join(hl7Samples, 'hl7v2', 'ADT01.hl7'), 'MSH|^~\\&|A|B\n');
            await writeFile(
                path.join(revSamples, 'fhir', 'Discharge_Composition_Bundle.json'),
                JSON.stringify({ resourceType: 'Bundle', type: 'document', entry: [] }, null, 2)
            );
            await writeFile(path.join(hl7Templates, 'Hl7v2', 'ADT_A01.liquid'), '{}');
            await writeFile(path.join(revTemplates, 'FhirToHl7v2', 'MDM_T02.liquid'), 'MSH|^~\\&|');
            await writeFile(path.join(revTemplates, 'FhirToHl7v2', 'Segment', '_MSH.liquid'), 'MSH|');

            const studioState = {
                templateCache: new fileSystemCache(hl7Templates),
                sampleDataLocation: hl7Samples,
                userSampleDataLocation: userHl7Samples,
                messageCache: new fileSystemCache(hl7Samples),
                reverseTemplateCache: new fileSystemCache(revTemplates),
                reverseTemplateFilesLocation: revTemplates,
                reverseBaseTemplateFilesLocation: revBaseTemplates,
                reverseSampleDataLocation: revSamples,
                userReverseSampleDataLocation: userRevSamples,
                reverseMessageCache: new fileSystemCache(revSamples)
            };

            testApp = express();
            testApp.use(express.json({ limit: '5mb' }));
            testApp.use(express.text({ limit: '5mb' }));
            registerStudioRoutes(testApp, {
                studioState,
                requireApiKey: (req, res, next) => next()
            });
        });

        afterEach(async function () {
            if (tmpRoot) {
                await rm(tmpRoot, { recursive: true, force: true });
            }
        });

        it('keeps default hl7v2 responses unchanged and serves reverse fhir samples and templates', async function () {
            const defaultSamples = await supertest(testApp).get('/api/v1/sample-data').expect(200);
            assert.deepStrictEqual(defaultSamples.body.messages, [
                { messageName: 'hl7v2/ADT01.hl7', source: 'builtin' }
            ]);

            const fhirSamples = await supertest(testApp).get('/api/v1/sample-data?dataType=fhir').expect(200);
            assert.deepStrictEqual(fhirSamples.body.messages, [
                { messageName: 'fhir/Discharge_Composition_Bundle.json', source: 'builtin' }
            ]);

            const sampleBody = await supertest(testApp)
                .get('/api/v1/sample-data/fhir/Discharge_Composition_Bundle.json')
                .expect(200);
            assert.strictEqual(JSON.parse(sampleBody.text).resourceType, 'Bundle');

            await supertest(testApp)
                .put('/api/v1/sample-data/fhir/Discharge_Composition_Bundle.json')
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify({ resourceType: 'Bundle', type: 'collection' }))
                .expect(409);

            await supertest(testApp)
                .delete('/api/v1/sample-data/fhir/Discharge_Composition_Bundle.json')
                .expect(403);

            await supertest(testApp)
                .put('/api/v1/sample-data/fhir/NotABundle.json')
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify({ resourceType: 'Patient' }))
                .expect(400);

            const putUser = await supertest(testApp)
                .put('/api/v1/sample-data/fhir/Custom_Discharge')
                .set('Content-Type', 'text/plain')
                .send(JSON.stringify({ resourceType: 'Bundle', type: 'document' }))
                .expect(200);
            assert.strictEqual(putUser.body.messageName, 'fhir/Custom_Discharge.json');

            const fhirSamplesAfter = await supertest(testApp).get('/api/v1/sample-data?type=fhir').expect(200);
            assert.strictEqual(fhirSamplesAfter.body.messages.length, 2);
            assert.ok(fhirSamplesAfter.body.messages.some((m) => m.messageName === 'fhir/Custom_Discharge.json' && m.source === 'user'));

            await supertest(testApp)
                .delete('/api/v1/sample-data/fhir/Custom_Discharge.json')
                .expect(200);

            const defaultTemplates = await supertest(testApp).get('/api/v1/templates').expect(200);
            assert.deepStrictEqual(defaultTemplates.body.templates, [{ templateName: 'Hl7v2/ADT_A01.liquid' }]);

            const reverseTemplates = await supertest(testApp).get('/api/v1/templates?dataType=fhir').expect(200);
            assert.strictEqual(reverseTemplates.body.templates.length, 2);
            assert.ok(reverseTemplates.body.templates.some((t) => t.templateName === 'FhirToHl7v2/MDM_T02.liquid'));

            const getRevTpl = await supertest(testApp).get('/api/v1/templates/FhirToHl7v2/MDM_T02.liquid').expect(200);
            assert.strictEqual(getRevTpl.text, 'MSH|^~\\&|');

            await supertest(testApp)
                .put('/api/v1/templates/FhirToHl7v2/ADT_A03.liquid')
                .set('Content-Type', 'text/plain')
                .send('MSH|^~\\&|UPDATED|')
                .expect(200);

            const getUpdatedTpl = await supertest(testApp).get('/api/v1/templates/FhirToHl7v2/ADT_A03.liquid').expect(200);
            assert.strictEqual(getUpdatedTpl.text, 'MSH|^~\\&|UPDATED|');
        });
    });
});
