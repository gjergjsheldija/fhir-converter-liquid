import assert from 'assert';
import { rewriteProvenanceNarratives } from './provenanceNarrative.js';
import { ExtraDynamicFieldInterceptor } from '../../../test/e2e-test/util/interceptors.js';
import * as compareModule from '../../../test/e2e-test/util/compare.js';

const compareContent = compareModule.compareContent || compareModule.default?.compareContent;

describe('provenanceNarrative', function () {
    const upstreamDivWithPeriod = '<div xmlns="http://www.w3.org/1999/xhtml"><p><span>Resource bundle generated on 2026-11-20T15:29:26.758Z using Microsoft FHIR Converter.</span><span>Template Version: TEMPLATE_VERSION_PLACEHOLDER.</span><span>Template URL: https://github.com/microsoft/FHIR-Converter/releases/download/vTEMPLATE_VERSION_PLACEHOLDER/Hl7v2DefaultTemplates.tar.gz.</span><span>Root template: ORM_O01.</span></p></div>';
    const upstreamDivWithoutPeriod = '<div xmlns="http://www.w3.org/1999/xhtml"><p><span>Resource bundle generated on 2026-11-20T15:29:26.758Z using Microsoft FHIR Converter.</span><span>Template Version: TEMPLATE_VERSION_PLACEHOLDER</span><span>Template URL: https://github.com/microsoft/FHIR-Converter/releases/download/vTEMPLATE_VERSION_PLACEHOLDER/Hl7v2DefaultTemplates.tar.gz.</span><span>Root template: VXU_V04.</span></p></div>';

    it('rewrites _Provenance.liquid narrative (with period) in a Bundle and removes Microsoft references', function () {
        const bundle = {
            resourceType: 'Bundle',
            type: 'transaction',
            entry: [
                {
                    resource: {
                        resourceType: 'Patient',
                        id: 'pat-1',
                    },
                },
                {
                    resource: {
                        resourceType: 'Provenance',
                        id: 'prov-1',
                        text: {
                            status: 'generated',
                            div: upstreamDivWithPeriod,
                        },
                    },
                },
            ],
        };

        const result = rewriteProvenanceNarratives(bundle, '0.1.3');
        const serialized = JSON.stringify(result);

        assert.strictEqual(
            result.entry[1].resource.text.div,
            '<div xmlns="http://www.w3.org/1999/xhtml"><p><span>Resource bundle generated on 2026-11-20T15:29:26.758Z using FHIR Converter Liquid.</span><span>Converter version: 0.1.3.</span><span>Root template: ORM_O01.</span></p></div>'
        );
        assert.strictEqual(serialized.includes('Microsoft'), false);
        assert.strictEqual(serialized.includes('github.com/microsoft'), false);
        assert.strictEqual(serialized.includes('TEMPLATE_VERSION_PLACEHOLDER'), false);
    });

    it('rewrites _Provenance_transformation.liquid narrative (without period) on a direct Provenance resource using package version by default', function () {
        const provenance = {
            resourceType: 'Provenance',
            id: 'prov-2',
            text: {
                status: 'generated',
                div: upstreamDivWithoutPeriod,
            },
        };

        const result = rewriteProvenanceNarratives(provenance);
        const serialized = JSON.stringify(result);

        assert.match(
            result.text.div,
            /^<div xmlns="http:\/\/www\.w3\.org\/1999\/xhtml"><p><span>Resource bundle generated on 2026-11-20T15:29:26\.758Z using FHIR Converter Liquid\.<\/span><span>Converter version: [^<]+\.<\/span><span>Root template: VXU_V04\.<\/span><\/p><\/div>$/
        );
        assert.strictEqual(serialized.includes('Microsoft'), false);
        assert.strictEqual(serialized.includes('github.com/microsoft'), false);
        assert.strictEqual(serialized.includes('TEMPLATE_VERSION_PLACEHOLDER'), false);
    });

    it('leaves custom user-authored Provenance narratives untouched', function () {
        const customDiv = '<div xmlns="http://www.w3.org/1999/xhtml"><p>Custom hospital integration provenance record.</p></div>';
        const bundle = {
            resourceType: 'Bundle',
            type: 'collection',
            entry: [
                {
                    resource: {
                        resourceType: 'Provenance',
                        text: {
                            status: 'additional',
                            div: customDiv,
                        },
                    },
                },
            ],
        };

        const result = rewriteProvenanceNarratives(bundle, '0.1.3');
        assert.strictEqual(result.entry[0].resource.text.div, customDiv);
    });

    it('compares rewritten Bundle equal to pinned upstream Bundle via compareContent when Root template matches and unequal when Root template differs', function () {
        assert.strictEqual(typeof compareContent, 'function');

        const expectedUpstreamBundle = {
            resourceType: 'Bundle',
            type: 'transaction',
            entry: [
                {
                    resource: {
                        resourceType: 'Provenance',
                        id: 'prov-expected',
                        text: {
                            status: 'generated',
                            div: '<div xmlns="http://www.w3.org/1999/xhtml"><p><span>Resource bundle generated on 2021-02-03T04:05:06.789Z using Microsoft FHIR Converter.</span><span>Template Version: TEMPLATE_VERSION_PLACEHOLDER.</span><span>Template URL: https://github.com/microsoft/FHIR-Converter/releases/download/vTEMPLATE_VERSION_PLACEHOLDER/Hl7v2DefaultTemplates.tar.gz.</span><span>Root template: ORM_O01.</span></p></div>',
                        },
                    },
                },
            ],
        };

        const actualMatchingBundle = rewriteProvenanceNarratives({
            resourceType: 'Bundle',
            type: 'transaction',
            entry: [
                {
                    resource: {
                        resourceType: 'Provenance',
                        id: 'prov-expected',
                        text: {
                            status: 'generated',
                            div: upstreamDivWithPeriod,
                        },
                    },
                },
            ],
        }, '0.1.3');

        const interceptor = new ExtraDynamicFieldInterceptor();
        assert.strictEqual(
            compareContent(
                JSON.stringify(expectedUpstreamBundle),
                JSON.stringify(actualMatchingBundle),
                interceptor
            ),
            true
        );

        const actualDifferentRootBundle = rewriteProvenanceNarratives({
            resourceType: 'Bundle',
            type: 'transaction',
            entry: [
                {
                    resource: {
                        resourceType: 'Provenance',
                        id: 'prov-expected',
                        text: {
                            status: 'generated',
                            div: '<div xmlns="http://www.w3.org/1999/xhtml"><p><span>Resource bundle generated on 2026-11-20T15:29:26.758Z using Microsoft FHIR Converter.</span><span>Template Version: TEMPLATE_VERSION_PLACEHOLDER.</span><span>Template URL: https://github.com/microsoft/FHIR-Converter/releases/download/vTEMPLATE_VERSION_PLACEHOLDER/Hl7v2DefaultTemplates.tar.gz.</span><span>Root template: ADT_A01.</span></p></div>',
                        },
                    },
                },
            ],
        }, '0.1.3');

        assert.throws(() => {
            const equal = compareContent(
                JSON.stringify(expectedUpstreamBundle),
                JSON.stringify(actualDifferentRootBundle),
                new ExtraDynamicFieldInterceptor()
            );
            assert.strictEqual(equal, true);
        });
    });
});
