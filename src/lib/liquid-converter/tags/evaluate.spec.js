import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Liquid } from 'liquidjs';
import evaluate from './evaluate.js';

// Upstream Evaluate.cs renders the partial inside `context.Stack`, so the partial reads every
// variable visible at the call site, not only the named arguments.
describe('evaluate tag scope', function () {
    let root;
    let engine;

    before(function () {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'evaluate-tag-'));
        fs.writeFileSync(path.join(root, 'echo.liquid'), '{% if AIG %}{{ AIG }}{% elsif CWE %}{{ CWE }}{% endif %}');
        fs.writeFileSync(path.join(root, 'only-aig.liquid'), '{{ AIG }}');
        fs.writeFileSync(path.join(root, 'caller.liquid'), "{% evaluate id using 'only-aig' CWE: AIG -%}[{{ id }}]");
        engine = new Liquid({ root, extname: '.liquid', strictVariables: false });
        engine.registerTag('evaluate', { parse: evaluate.parse, render: evaluate.render });
    });

    after(function () {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('lets the partial read variables from the call site', function () {
        const output = engine.parseAndRenderSync("{% assign AIG = 'aig-value' -%}{% evaluate out using 'echo' CWE: 'x' -%}[{{ out }}]");
        expect(output).to.equal('[aig-value]');
    });

    it('lets named arguments shadow variables from the call site', function () {
        const output = engine.parseAndRenderSync("{% assign AIG = 'outer' -%}{% evaluate out using 'echo' AIG: 'inner' -%}[{{ out }}]");
        expect(output).to.equal('[inner]');
    });

    it('keeps a caller variable when an included template re-evaluates it with the same inputs', function () {
        const output = engine.parseAndRenderSync(
            "{% assign AIG = 'aig-value' -%}{% evaluate id using 'only-aig' AIG: AIG -%}{% include 'caller' AIG: AIG -%}[{{ id }}]"
        );
        expect(output).to.equal('[aig-value][aig-value]');
    });

    it('assigns null when nothing renders', function () {
        const output = engine.parseAndRenderSync("{% evaluate out using 'echo' CWE: nothing -%}[{{ out }}]");
        expect(output).to.equal('[]');
    });
});
