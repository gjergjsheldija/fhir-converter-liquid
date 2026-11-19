const PATCHED = Symbol('dotLiquidStringIndexAccessPatched');
const INDEX_KEY = /^-?\d+$/;

// LiquidJS reads `"abc".1` as the character "b", so `{% if ID.3 %}` is truthy for a string `ID`.
// DotLiquid's variable lookup only indexes lists and dictionaries and returns nil for a string,
// which is what the pinned templates rely on (for example `DataType/_IDCoding.liquid` is
// included with `ID` bound to a Coverage id string and tests `ID.3`).
export function suppressStringIndexAccess(ctx) {
    if (ctx[PATCHED]) {
        return ctx;
    }
    ctx[PATCHED] = true;
    const getFromScope = ctx._getFromScope.bind(ctx);
    ctx._getFromScope = function* (scope, paths) {
        const keys = typeof paths === 'string' ? paths.split('.') : paths;
        for (let i = 0; i < keys.length; i++) {
            if (typeof scope === 'string' && INDEX_KEY.test(String(keys[i]))) {
                scope = undefined;
            } else {
                scope = yield* getFromScope(scope, [keys[i]]);
            }
        }
        return scope;
    };
    return ctx;
}
