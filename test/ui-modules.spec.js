// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import assert from 'assert';
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

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
});
