// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

/**
 * DotLiquid (upstream's C# Liquid engine) tolerates `{{ }}`-wrapped
 * expressions appearing INSIDE `{% ... %}` tag bodies, e.g.:
 *   {% assign var_1 = {{MSG.1.Value}} %}
 *   {% if {{p.1.Value}} == "2131-1" -%}
 *   {% include 'Resource/Patient' CON: conSegment.24.Repeats[{{con_25_indexValue}}] -%}
 * This is never valid under standard Liquid grammar: `{{ }}` is exclusively
 * output-interpolation syntax used OUTSIDE tags, never inside a tag's own
 * arguments. liquidjs correctly rejects it as an "unexpected token" parse
 * error. The standard/expected form omits the redundant braces entirely,
 * e.g.:
 *   {% assign var_1 = MSG.1.Value %}
 *   {% if p.1.Value == "2131-1" -%}
 *
 * Because `{{ }}` is never valid ANYWHERE inside a `{% %}` tag body -
 * regardless of tag type (assign, if, elsif, evaluate, include, or any other,
 * including ones not yet encountered) - this function generalizes the fix:
 * it strips the `{{`/`}}` braces from every occurrence found within ANY
 * `{% ... %}` tag (including multiple `{{ }}` occurrences used as filter
 * arguments or as hash-argument values), while leaving normal `{{ }}` output
 * interpolation OUTSIDE tags untouched. This subsumes the previous
 * assign-only fix and future-proofs against the same DotLiquid leniency
 * surfacing in other tag types during future upstream re-syncs.
 */
export function stripDoubleBraceInsideTags(content) {
    return content.replace(/\{%-?[^%]*?-?%\}/g, (tag) => {
        return tag.replace(/"?\{\{\s*/g, "").replace(/\s*\}\}"?/g, "");
    });
}

/**
 * DotLiquid (upstream's C# Liquid engine) tolerates malformed output closers
 * where tag-style whitespace control `-%}` is mixed with output syntax `}}`,
 * resulting in `-%}}`. This is invalid: standard Liquid whitespace control
 * for outputs is `-}}` (not `-%}}`). liquidjs correctly rejects this as a
 * parse error. This normalizes `-%}}` to the correct output closer `-}}`.
 * Confirmed via upstream template audit: Extensions/_AllergyIntoleranceTypeCode.liquid
 * line 3 has `{{ IAM.9.1.Value | get_property: 'CodeSystem/AllergyIntoleranceTypeCode', 'code' -%}}`
 */
export function normalizeMalformedOutputCloser(content) {
    // Match `-%}}` (tag-style closer on output) and normalize to `-}}` (correct output closer)
    return content.replace(/-%\}\}/g, '-}}');
}

/**
 * DotLiquid (upstream's C# Liquid engine) tolerates an accidental extra `.`
 * in a property-access path -- `X..Y` is effectively treated the same as
 * `X.Y` (the double dot collapses to a single dot), NOT as a Ruby-style
 * Range object. liquidjs's parser rejects `X..Y` as an unexpected token.
 * This normalizes any bare `X..Y` identifier-path expression to `X.Y`,
 * regardless of which `{% ... %}` tag it appears in (if/elsif conditions,
 * assign values, or any other tag), since the bug is in the property-path
 * syntax itself, not the surrounding tag. It deliberately does NOT match a
 * legitimate Liquid range literal such as `(1..5)` in a `{% for %}` loop,
 * since real occurrences never have surrounding parens and range literals
 * always do.
 * Confirmed via upstream template audit: this pattern occurs 3 times in the
 * vendored Hl7v2 tree -- once in an {% if %} condition
 * (Extensions/Patient/_PatientExtension.liquid: `PV1..16`) and twice in
 * {% assign %} values (DataType/_TQ_MedicationRequest.liquid and
 * DataType/_TQ_SupplyRequest.liquid: `TQ..3.Value`) -- both are accidental
 * extra dots, consistent with `TQ.3.Value` used correctly elsewhere in the
 * same files.
 */
export function normalizeDoubleDotToSingleDot(content) {
    return content.replace(/(\()?\b(\w+)\.\.(\w+)\b(\))?/g, (match, openParen, x, y, closeParen) => {
        if (openParen && closeParen) {
            return match;
        }
        return `${openParen || ""}${x}.${y}${closeParen || ""}`;
    });
}

/**
 * DotLiquid (upstream's C# Liquid engine) accepts `{% elseif %}` as a
 * synonym for the standard Liquid tag `{% elsif %}` within an if/elsif/
 * else/endif block. liquidjs only recognizes `elsif` -- `elseif` is not a
 * registered tag name at all, so liquidjs fails with `tag "elseif" not
 * found`. This normalizes the tag name at load time. Confirmed via
 * upstream template audit: ~29 vendored Hl7v2 templates use `elseif`.
 */
export function normalizeElseifTagName(content) {
    return content.replace(/(\{%-?\s*)elseif\b/g, '$1elsif');
}

/**
 * DotLiquid (upstream's C# Liquid engine) tolerates a typo where an output
 * statement has three opening braces but only two closing braces, e.g.:
 *   `{{{MRG.1.Repeats[0].4.Value}}`
 * This is invalid Liquid syntax: standard output is `{{ expression }}`.
 * liquidjs correctly rejects this as an unexpected token. This normalizes
 * any `{{{...}}` (triple-open, double-close) to `{{...}}` (standard output).
 * The function matches `{{{` at the start of an output statement followed
 * by non-brace content and then `}}`, replacing only the leading `{{{`
 * with `{{`.
 * Confirmed via upstream template audit: ID/_Linkage.liquid line 3 has
 * `{{{MRG.1.Repeats[0].4.Value}}` (3 opens, 2 closes).
 */
export function normalizeTripleBraceOutput(content) {
    // Match {{{ followed by non-brace chars (the expression) followed by }}
    // but NOT followed by another } (to avoid matching {{{...}}})
    return content.replace(/\{\{\{([^{}]+)\}\}(?!\})/g, '{{$1}}');
}

/**
 * DotLiquid (upstream's C# Liquid engine) performs case-insensitive variable
 * lookups when configured with CSharpNamingConvention. The vendored upstream
 * templates contain typos where variables are defined with one casing but
 * later referenced with a different casing. In DotLiquid this works due to
 * case-insensitive lookup; liquidjs is case-sensitive by default. This
 * normalizes the common typos to match the actual variable definitions.
 * 
 * Known typos:
 * - `messageHeaderID` → `messageHeaderId` (49 occurrences)
 * - `PatientId` → `patientId` (1150 occurrences, though many are legitimate
 *   parameter names; only standalone variable references need fixing)
 */
export function normalizeVariableNameTypos(content) {
    // Normalize messageHeaderID -> messageHeaderId (the correct variable name)
    content = content.replace(/\bmessageHeaderID\b/g, 'messageHeaderId');
    // Normalize PatientId -> patientId when it appears as a standalone variable reference
    // (i.e., not part of a compound name like fullPatientId or _PatientId)
    content = content.replace(/\bPatientId\b/g, 'patientId');
    return content;
}

/**
 * DotLiquid (upstream's C# Liquid engine) treats the bare `null`/`nil` literal
 * as a real nil value wherever it's assigned or passed as a parameter --
 * `{% assign x = null %}` leaves `x` falsy, matching a genuinely-undefined
 * variable. liquidjs does NOT: confirmed via a standalone liquidjs render
 * that `{% assign x = null %}` (or `= nil`) leaves `x` TRUTHY while `{{x}}`
 * still renders empty -- liquidjs's own internal representation for the
 * literal keyword is an empty object `{}`, not a real null/undefined. (Liquid
 * `== null`/`!= null` COMPARISONS already work correctly against a real
 * null/undefined; only assigning or passing the bare literal is affected.)
 * Confirmed by also testing that assigning from a deliberately-undefined
 * variable reference DOES produce a correctly-falsy result in liquidjs, so
 * this rewrites `= null`/`= nil` (in `{% assign %}`) and `param: null`/
 * `param: nil` (named parameters, e.g. in `{% include %}`/`{% evaluate %}`)
 * to reference a variable name that can never legitimately exist in any
 * HL7v2 render context, which liquidjs then correctly resolves as falsy.
 * Confirmed via upstream template audit: 81 occurrences across the vendored
 * Hl7v2 tree (79 `{% assign %}`, 2 `{% include %}` named parameters).
 *
 * KNOWN ISSUE (2026-08-21, shipped anyway per explicit direction): fixed 13
 * previously-failing regression tests but introduced 9 new failures
 * (previously-passing tests regressing), net +4 passing / -4 failing. At
 * least one traced regression (ORU-R01-01.hl7) shows a genuinely-missing
 * `Observation` entry (id literally the string "undefined") and a spurious
 * extra `DiagnosticReport.performer` reference -- some site(s) among the 81
 * rewritten occurrences depend on the OLD truthy-`{}` behavior in a way not
 * yet identified. Needs a targeted trace of the regressed tests (OUL_R22/
 * R23/R24, OMG_O19, ORM-O01-05/06, OML-O21-03, ORU-R01-01) before this can
 * be considered fully correct -- do not assume this transform is safe to
 * extend further without first resolving the known regressions.
 */
export function normalizeNullNilLiteralAssignment(content) {
    // The lookbehind on the operator excludes `==`/`!=` comparisons (which liquidjs already
    // evaluates correctly against a real null/undefined) -- only a bare assign/parameter `=`
    // or `:` immediately before the literal is rewritten.
    return content.replace(/(\{%-?[^%]*?(?<![=!])[=:]\s*)(null|nil)\b(\s*(?:,|-?%\}))/g, (match, prefix, literal, suffix) => {
        return `${prefix}__liquidjs_nil_shim__${suffix}`;
    });
}

/**
 * Applies every DotLiquid-compat transform above, in the order this module has always applied
 * them for `{% include %}`/`{% evaluate %}`-loaded sub-templates. Root/top-level message-type
 * templates (e.g. `ORM_O01.liquid`) are supplied directly as request payload content rather than
 * loaded from disk, so they never passed through liquid-converter.js's custom `fs.readFileSync`
 * hook where these transforms lived -- confirmed by tracing a real regression test
 * (ORM-O01-01.hl7) where `normalizeNullNilLiteralAssignment` fixed the same `{% assign X = null %}`
 * pattern in an included partial but had no effect until also applied to root templates via
 * hl7v2Liquid.js's `preProcessTemplate` (which had its own stale, duplicate transform chain that
 * silently shadowed this one -- see hl7v2Liquid.js). Call this on root template content before
 * rendering, matching what sub-templates already receive.
 */
export function applyDotLiquidCompatTransforms(content) {
    return normalizeNullNilLiteralAssignment(
        normalizeVariableNameTypos(
            normalizeMalformedOutputCloser(
                normalizeTripleBraceOutput(
                    normalizeElseifTagName(
                        normalizeDoubleDotToSingleDot(
                            stripDoubleBraceInsideTags(content)
                        )
                    )
                )
            )
        )
    );
}
