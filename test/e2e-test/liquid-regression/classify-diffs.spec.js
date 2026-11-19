import assert from 'assert';
import { entryDelta } from './classify-diffs.mjs';

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
