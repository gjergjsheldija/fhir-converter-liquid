import {Context, toPromise} from "liquidjs";

// Mirrors the pinned Microsoft CollectionFilters.BatchRender: renders the named template once
// per collection entry inside a new scope (the entry is bound to `variableName`), appends ","
// after every rendering and returns the concatenation. A null collection renders nothing.
// Like the DotLiquid context.Stack, the template reads every variable visible at the call site.
export async function batchRender(collection, templateName, variableName) {
    const {context: ctx, liquid} = this;
    const templates = await toPromise(liquid._parsePartialFile(templateName, false));

    let output = "";
    const entries = Array.isArray(collection) ? collection : [];
    for (const entry of entries) {
        const childCtx = new Context(ctx.environments, ctx.opts,
            {sync: false, globals: ctx.globals, strictVariables: ctx.strictVariables});
        childCtx.scopes = ctx.scopes.slice();
        childCtx.push({[variableName]: entry});
        output += await toPromise(liquid.renderer.renderTemplates(templates, childCtx)) + ",";
    }
    return output;
}
