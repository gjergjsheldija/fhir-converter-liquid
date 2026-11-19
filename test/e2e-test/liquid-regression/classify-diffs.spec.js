import assert from 'assert';
import { entryDelta, contentDelta } from './classify-diffs.mjs';

const bundle = (...types) => ({ entry: types.map((resourceType) => ({ resource: { resourceType } })) });

describe('classify-diffs entryDelta', () => {
    it('returns no differing types for equal Patient counts', () => {
        const result = entryDelta(bundle('Patient'), bundle('Patient'));
        assert.deepStrictEqual(result, { actualCount: 1, expectedCount: 1, byType: [] });
    });

    it('reports one extra Device', () => {
        const result = entryDelta(bundle('Patient', 'Device'), bundle('Patient'));
        assert.deepStrictEqual(result.byType, [{ resourceType: 'Device', actual: 1, expected: 0, delta: 1 }]);
    });

    it('reports a missing Account', () => {
        const result = entryDelta(bundle('Patient'), bundle('Patient', 'Account'));
        assert.deepStrictEqual(result.byType, [{ resourceType: 'Account', actual: 0, expected: 1, delta: -1 }]);
    });
});

describe('classify-diffs contentDelta', () => {
    const patient = (gender) => ({ resource: { resourceType: 'Patient', id: 'p1', gender } });

    it('reports a differing Patient field path', () => {
        const result = contentDelta({ entry: [patient('male')] }, { entry: [patient('female')] });
        assert.deepStrictEqual(result.fields, [{ key: 'Patient/p1', paths: ['gender'] }]);
    });

    const observation = (effectiveDateTime) => ({ resource: { resourceType: 'Observation', id: 'o1', effectiveDateTime } });
    const delta = (actual, expected) => contentDelta({ entry: [observation(actual)] }, { entry: [observation(expected)] }).fields;

    it('ignores dateTime values that are the same instant in different offsets', () => {
        assert.deepStrictEqual(delta('2020-05-01T13:30:15+02:15', '2020-05-01T16:45:15+05:30'), []);
    });

    it('reports dateTime values that are different instants', () => {
        assert.deepStrictEqual(delta('2020-05-01T13:30:15Z', '2020-05-01T13:30:16Z'), [
            { key: 'Observation/o1', paths: ['effectiveDateTime'] }
        ]);
    });

    it('reports a date-only value against a dateTime', () => {
        assert.deepStrictEqual(delta('2020-05-01', '2020-05-01T00:00:00Z'), [
            { key: 'Observation/o1', paths: ['effectiveDateTime'] }
        ]);
    });

    it('reports an extra Device with no id', () => {
        const result = contentDelta(
            { entry: [patient('male'), { resource: { resourceType: 'Device' } }] },
            { entry: [patient('male')] }
        );
        assert.deepStrictEqual(result.unmatched, [{ kind: 'extra', key: 'Device/(no id)' }]);
    });

    it('returns empty results for identical Patients', () => {
        const result = contentDelta({ entry: [patient('male')] }, { entry: [patient('male')] });
        assert.deepStrictEqual(result, { unmatched: [], fields: [] });
    });
});
