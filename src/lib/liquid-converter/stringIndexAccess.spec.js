import { expect } from 'chai';
import { Liquid } from 'liquidjs';
import { suppressStringIndexAccess } from './stringIndexAccess.js';

describe('DotLiquid string index access', function () {
    const engine = new Liquid({ strictVariables: false });
    const originalRenderTemplates = engine.renderer.renderTemplates.bind(engine.renderer);
    engine.renderer.renderTemplates = function (templates, ctx, emitter) {
        return originalRenderTemplates(templates, suppressStringIndexAccess(ctx), emitter);
    };
    const render = (template, scope) => engine.parseAndRenderSync(template, scope);

    it('reads a numeric key on a string as nil', function () {
        expect(render('[{{ s.3 }}][{{ s[3] }}][{{ s.3.Value }}]', { s: 'dfab6985' })).to.equal('[][][]');
        expect(render('{% if s.3 %}T{% else %}F{% endif %}', { s: 'dfab6985' })).to.equal('F');
        expect(render('[{{ s.-1 }}]', { s: 'dfab6985' })).to.equal('[]');
    });

    it('keeps string size', function () {
        expect(render('{{ s.size }}', { s: 'abcd' })).to.equal('4');
    });

    it('keeps numeric access on arrays and objects', function () {
        expect(render('{{ a.1 }}{{ a[0] }}{{ o.1 }}', { a: ['x', 'y'], o: { 1: 'z' } })).to.equal('yxz');
        expect(render('{{ o.list.1.name }}', { o: { list: ['a', { name: 'n' }] } })).to.equal('n');
    });

    it('is applied once per context', function () {
        const ctx = {};
        ctx._getFromScope = function () { return 1; };
        const patched = suppressStringIndexAccess(ctx);
        const fn = patched._getFromScope;
        expect(suppressStringIndexAccess(patched)._getFromScope).to.equal(fn);
    });
});
