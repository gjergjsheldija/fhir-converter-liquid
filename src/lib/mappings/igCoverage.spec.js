import assert from 'assert';
import {coverageScore, groupsOf} from './igCoverage.js';

function conceptMap(elements) {
    return {
        resourceType: 'ConceptMap',
        group: [{
            source: 'urn:hl7v2-field',
            target: 'http://hl7.org/fhir/R4',
            element: elements.map(([code, target]) => ({code, target: [{code: target}]}))
        }]
    };
}

describe('IG coverage score', function () {
    const generated = conceptMap([['PID-5', 'Patient.name'], ['PID-7', 'Patient.birthDate']]);
    const guide = conceptMap([['PID-5', 'Patient.name'], ['PID-8', 'Patient.gender']]);

    it('counts shared, template-only and guide-only mappings', function () {
        assert.deepStrictEqual(coverageScore(generated, guide), {shared: 1, onlyGenerated: 1, onlyGuide: 1});
    });

    it('scores a Bundle of ConceptMaps like the ConceptMap alone', function () {
        const bundle = {resourceType: 'Bundle', type: 'collection', entry: [{resource: generated}, {resource: {resourceType: 'Patient'}}]};
        assert.deepStrictEqual(coverageScore(bundle, guide), coverageScore(generated, guide));
    });

    it('does not throw on missing groups or other values', function () {
        assert.deepStrictEqual(groupsOf({resourceType: 'ConceptMap'}), []);
        assert.deepStrictEqual(groupsOf(null), []);
        assert.deepStrictEqual(groupsOf({resourceType: 'Patient'}), []);
        assert.deepStrictEqual(coverageScore({resourceType: 'ConceptMap'}, undefined), {shared: 0, onlyGenerated: 0, onlyGuide: 0});
    });
});
