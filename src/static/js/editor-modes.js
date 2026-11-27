/* eslint-disable no-undef, no-unused-vars */
// CodeMirror 5 modes for the three editor panes (used with the "fhir" theme):
//   - "hl7v2": HL7v2 segment IDs, field/component delimiters, escape sequences,
//     and numeric/timestamp fields.
//   - "liquid-inner": tokens inside Liquid {% ... %} / {{ ... }} slices.
//   - "liquid-json": strict FHIR JSON ({name: "javascript", json: true}) with Liquid
//     tag/variable slices and true comment handling for {% comment %}...{% endcomment %}
//     and {% raw %}...{% endraw %} blocks (all trim-dash/whitespace variants).
// Loaded after /codemirror/lib/codemirror.js plus the simple.js and multiplex.js
// mode addons (see src/static/index.html).

CodeMirror.defineSimpleMode("hl7v2", {
    start: [
        {regex: /MSH(?=\|)/, token: "keyword", sol: true, next: "mshSep"},
        {regex: /[A-Z][A-Z0-9]{2}(?=\|)/, token: "keyword", sol: true, next: "body"}
    ],
    mshSep: [
        {regex: /^\|[^\r\n|]{1,4}/, token: ["operator", "meta"], next: "body"},
        {regex: /\|/, token: "operator", next: "body"}
    ],
    body: [
        {regex: /MSH(?=\|)/, token: "keyword", sol: true, next: "mshSep"},
        {regex: /[A-Z][A-Z0-9]{2}(?=\|)/, token: "keyword", sol: true, next: "body"},
        {regex: /\|/, token: "operator"},
        {regex: /[\^~&]/, token: "bracket"},
        {regex: /\\[A-Za-z0-9.+-]+\\/, token: "variable-2"},
        {regex: /\b\d{4,14}(?:\.\d+)?(?:[+-]\d{4})?\b/, token: "number"},
        {regex: /[^|^~&\\\r\n]+/, token: null}
    ]
});

CodeMirror.defineSimpleMode("liquid-inner", {
    start: [
        {regex: /(\|\s*)([A-Za-z_][\w]*)/, token: ["operator", "builtin"]},
        {regex: /'[^']*'|"[^"]*"/, token: "string"},
        {regex: /(?:assign|capture|endcapture|if|elsif|else|endif|unless|endunless|for|endfor|in|break|continue|case|when|endcase|include|render|evaluate|using|raw|endraw|tablerow|endtablerow|increment|decrement|and|or|not|contains|nil|null|true|false|empty|blank)\b/, token: "keyword"},
        {regex: /\b\d+(?:\.\d+)?\b/, token: "number"},
        {regex: /(?:==|!=|<=|>=|<|>|=|:|,|\.\.)/, token: "operator"},
        {regex: /[A-Za-z_][\w]*(?:\.[A-Za-z0-9_]+)*/, token: "variable"}
    ]
});

CodeMirror.defineMode("liquid-json", function (config) {
    var jsonOuter = CodeMirror.getMode(config, {name: "javascript", json: true});
    var plainMode = CodeMirror.getMode(config, "text/plain");
    var liquidInner = CodeMirror.getMode(config, "liquid-inner");

    function commentSlice(open, close) {
        return {open: open, close: close, mode: plainMode, delimStyle: "comment", innerStyle: "comment"};
    }
    function tagSlice(open, close) {
        return {open: open, close: close, mode: liquidInner, delimStyle: "meta"};
    }

    return CodeMirror.multiplexingMode(
        jsonOuter,
        commentSlice(/\{%-?\s*comment\s*-?%\}/, /\{%-?\s*endcomment\s*-?%\}/),
        commentSlice(/\{%-?\s*raw\s*-?%\}/, /\{%-?\s*endraw\s*-?%\}/),
        tagSlice("{%-", "-%}"),
        tagSlice("{%-", "%}"),
        tagSlice("{%", "-%}"),
        tagSlice("{%", "%}"),
        tagSlice("{{-", "-}}"),
        tagSlice("{{-", "}}"),
        tagSlice("{{", "-}}"),
        tagSlice("{{", "}}")
    );
});

function templateEditorModeForName(name) {
    if (/\.json$/i.test(name)) {
        return {name: "javascript", json: true};
    }
    if (!name || name === "untitled" || /\.liquid$/i.test(name)) {
        return "liquid-json";
    }
    return "text/plain";
}
