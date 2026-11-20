import assert from 'node:assert/strict';
import { Liquid } from 'liquidjs';
import { applyDotLiquidEquality, dotLiquidEquals } from './dotLiquidEquality.js';

describe('DotLiquid number/string equality', function () {
    const engine = new Liquid({ strictVariables: false });
    applyDotLiquidEquality(engine);
    const render = (template, scope) => engine.parseAndRenderSync(template, scope);
    const eq = (expr, scope) => render(`{% if ${expr} %}T{% else %}F{% endif %}`, scope);

    it('matches a numeric value against a string literal in either order', function () {
        assert.strictEqual(eq('t == "15"', { t: 15 }), 'T');
        assert.strictEqual(eq('"15" == t', { t: 15 }), 'T');
        assert.strictEqual(eq('t != "15"', { t: 15 }), 'F');
        assert.strictEqual(eq('t == "16"', { t: 15 }), 'F');
        assert.strictEqual(eq('t != "16"', { t: 15 }), 'T');
    });

    it('does not match unrelated numeric text', function () {
        assert.strictEqual(dotLiquidEquals(15, 'abc'), false);
        assert.strictEqual(dotLiquidEquals(15, ''), false);
        assert.strictEqual(dotLiquidEquals(15, '15.5'), false);
        assert.strictEqual(dotLiquidEquals(15, '15.0'), false);
        assert.strictEqual(dotLiquidEquals(1.5, '1.5'), true);
        assert.strictEqual(dotLiquidEquals('', 0), false);
    });

    it('keeps same-type, nil and boolean comparisons unchanged', function () {
        assert.strictEqual(eq('a == "x"', { a: 'x' }), 'T');
        assert.strictEqual(eq('a == 1', { a: 1 }), 'T');
        assert.strictEqual(eq('a == "15"', {}), 'F');
        assert.strictEqual(eq('a == null', {}), 'T');
        assert.strictEqual(eq('a == 1', { a: true }), 'F');
    });

    it('does not change the shared LiquidJS operators of an unpatched engine', function () {
        const plain = new Liquid({ strictVariables: false });
        assert.strictEqual(plain.parseAndRenderSync('{% if t == "15" %}T{% else %}F{% endif %}', { t: 15 }), 'F');
    });
});
