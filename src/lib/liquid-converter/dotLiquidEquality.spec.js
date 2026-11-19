import { expect } from 'chai';
import { Liquid } from 'liquidjs';
import { applyDotLiquidEquality, dotLiquidEquals } from './dotLiquidEquality.js';

describe('DotLiquid number/string equality', function () {
    const engine = new Liquid({ strictVariables: false });
    applyDotLiquidEquality(engine);
    const render = (template, scope) => engine.parseAndRenderSync(template, scope);
    const eq = (expr, scope) => render(`{% if ${expr} %}T{% else %}F{% endif %}`, scope);

    it('matches a numeric value against a string literal in either order', function () {
        expect(eq('t == "15"', { t: 15 })).to.equal('T');
        expect(eq('"15" == t', { t: 15 })).to.equal('T');
        expect(eq('t != "15"', { t: 15 })).to.equal('F');
        expect(eq('t == "16"', { t: 15 })).to.equal('F');
        expect(eq('t != "16"', { t: 15 })).to.equal('T');
    });

    it('does not match unrelated numeric text', function () {
        expect(dotLiquidEquals(15, 'abc')).to.equal(false);
        expect(dotLiquidEquals(15, '')).to.equal(false);
        expect(dotLiquidEquals(15, '15.5')).to.equal(false);
        expect(dotLiquidEquals(15, '15.0')).to.equal(false);
        expect(dotLiquidEquals(1.5, '1.5')).to.equal(true);
        expect(dotLiquidEquals('', 0)).to.equal(false);
    });

    it('keeps same-type, nil and boolean comparisons unchanged', function () {
        expect(eq('a == "x"', { a: 'x' })).to.equal('T');
        expect(eq('a == 1', { a: 1 })).to.equal('T');
        expect(eq('a == "15"', {})).to.equal('F');
        expect(eq('a == null', {})).to.equal('T');
        expect(eq('a == 1', { a: true })).to.equal('F');
    });

    it('does not change the shared LiquidJS operators of an unpatched engine', function () {
        const plain = new Liquid({ strictVariables: false });
        expect(plain.parseAndRenderSync('{% if t == "15" %}T{% else %}F{% endif %}', { t: 15 })).to.equal('F');
    });
});
