import assert from 'node:assert/strict';
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
        assert.strictEqual(render('[{{ s.3 }}][{{ s[3] }}][{{ s.3.Value }}]', { s: 'dfab6985' }), '[][][]');
        assert.strictEqual(render('{% if s.3 %}T{% else %}F{% endif %}', { s: 'dfab6985' }), 'F');
        assert.strictEqual(render('[{{ s.-1 }}]', { s: 'dfab6985' }), '[]');
    });

    it('keeps string size', function () {
        assert.strictEqual(render('{{ s.size }}', { s: 'abcd' }), '4');
    });

    it('keeps numeric access on arrays and objects', function () {
        assert.strictEqual(render('{{ a.1 }}{{ a[0] }}{{ o.1 }}', { a: ['x', 'y'], o: { 1: 'z' } }), 'yxz');
        assert.strictEqual(render('{{ o.list.1.name }}', { o: { list: ['a', { name: 'n' }] } }), 'n');
    });

    it('is applied once per context', function () {
        const ctx = {};
        ctx._getFromScope = function () {
            return 1;
        };
        const patched = suppressStringIndexAccess(ctx);
        const fn = patched._getFromScope;
        assert.strictEqual(suppressStringIndexAccess(patched)._getFromScope, fn);
    });
});
