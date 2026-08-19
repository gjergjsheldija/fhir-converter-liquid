import {_evalToken, Context, Hash, Tokenizer} from "liquidjs";
import {__assign} from "tslib";
import assert from "assert";


//    "{% evaluate bundleID using 'ID/Bundle' Data: firstSegments.MSH.10 -%}"
export default {
    parse: function(token) {
        const tokenizer = new Tokenizer(token.args, this.liquid.options.operatorsTrie);
        this.key = tokenizer.readIdentifier().content; // output variable name
        tokenizer.skipBlank();

        const using = tokenizer.readIdentifier().content; // using keyword
        assert(using, "using");

        let filePath = tokenizer.readQuoted().getText(); // filepath, for instance: 'ID/Bundle'

        filePath = filePath.replace(/'/g,''); // replace, so it's a string "ID/Bundle"
        this['file'] = this.liquid.parse(filePath);
        this['currentFile'] = token.file;

        if (!tokenizer.end()) {
            // get input params
            this.hash = new Hash(tokenizer.remaining());
        }
    },
    render: function * (ctx) {
        const { liquid, hash } = this;

        const filePath = yield renderSubTemplateFilePath(this['file'], ctx, liquid);
        assert(filePath, () => `illegal fileName "${filePath}"`);

        const childCtx = new Context({}, ctx.opts,
            { sync: ctx.sync, globals: ctx.globals, strictVariables: ctx.strictVariables });
        const scope = childCtx.bottom();
        __assign(scope, yield hash.render(ctx));

        // parse sub template, retrieve result and assign to output variable
        const templates = yield liquid._parsePartialFile(filePath, childCtx.sync, this['currentFile']);
        const rendered = yield liquid.renderer.renderTemplates(templates, childCtx);
        // Matches upstream's Evaluate.cs: .Trim() the sub-template's rendered content
        // (template files end with a trailing newline; without trimming it, that
        // newline lands literally inside whatever JSON string embeds this value,
        // producing invalid JSON) and assign null rather than an empty string when
        // nothing meaningful was rendered.
        const trimmed = rendered.trim();
        ctx.bottom()[this.key] = trimmed.length === 0 ? null : trimmed;
    }
};

export function * renderSubTemplateFilePath(file, ctx, liquid) {
    if (typeof file === 'string') return file;
    if (Array.isArray(file)) return liquid.renderer.renderTemplates(file, ctx);
    return yield _evalToken(file, ctx);
}
