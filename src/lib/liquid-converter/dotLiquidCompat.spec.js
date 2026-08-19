// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import { expect } from "chai";
import {
    stripDoubleBraceInsideTags,
    normalizeDoubleDotToSingleDot,
    normalizeElseifTagName,
    normalizeTripleBraceOutput,
    normalizeMalformedOutputCloser,
    normalizeVariableNameTypos
} from "./dotLiquidCompat.js";

describe("dotLiquidCompat", () => {
    describe("stripDoubleBraceInsideTags()", () => {
        it("strips {{ }} braces from a simple assign tag", () => {
            const input = "{% assign var_1 = {{MSG.1.Value}} %}";
            const expected = "{% assign var_1 = MSG.1.Value %}";
            expect(stripDoubleBraceInsideTags(input)).to.equal(expected);
        });

        it("strips every {{ }} occurrence used as filter arguments in an assign tag", () => {
            const input =
                '{% assign VALUE_STRING_SN = {{OBX.5.1.Value}} | append: " " | append: {{OBX.5.2.Value}} | append: " " | append: {{OBX.5.3.Value}} | append: " " | append: {{OBX.5.4.Value}} -%}';
            const expected =
                '{% assign VALUE_STRING_SN = OBX.5.1.Value | append: " " | append: OBX.5.2.Value | append: " " | append: OBX.5.3.Value | append: " " | append: OBX.5.4.Value -%}';
            expect(stripDoubleBraceInsideTags(input)).to.equal(expected);
        });

        it("leaves an already-standard assign tag unchanged (no-op)", () => {
            const input = "{% assign x = y | append: 'z' %}";
            expect(stripDoubleBraceInsideTags(input)).to.equal(input);
        });

        it("leaves content with no tags at all entirely unchanged, including {{ }} output interpolation", () => {
            const input = "Hello {{ foo }}, welcome to {{ bar.baz }}!";
            expect(stripDoubleBraceInsideTags(input)).to.equal(input);
        });

        it("strips {{ }} braces with an adjacent quote on each side (DotLiquid now-filter idiom)", () => {
            const input = '{% assign generationInstant = "{{ "" | now }}" -%}';
            const expected = '{% assign generationInstant = "" | now -%}';
            expect(stripDoubleBraceInsideTags(input)).to.equal(expected);
        });

        it("handles multiple assign tags in the same content independently", () => {
            const input = [
                "{% assign var_1 = {{MSG.1.Value}} %}",
                "some text {{ output }} here",
                "{% assign var_2 = {{MSG.2.Value}} %}"
            ].join("\n");
            const expected = [
                "{% assign var_1 = MSG.1.Value %}",
                "some text {{ output }} here",
                "{% assign var_2 = MSG.2.Value %}"
            ].join("\n");
            expect(stripDoubleBraceInsideTags(input)).to.equal(expected);
        });

        it("strips {{ }} braces from an if tag condition (_Race.liquid case)", () => {
            const input = '{% if {{p.1.Value}} == "2131-1" -%}';
            const expected = '{% if p.1.Value == "2131-1" -%}';
            expect(stripDoubleBraceInsideTags(input)).to.equal(expected);
        });

        it("strips {{ }} braces used as an array index inside a hash-argument value in an include tag", () => {
            const input =
                "{% include 'Resource/Patient' CON: conSegment.24.Repeats[{{con_25_indexValue}}], ID: patientId -%}";
            const expected =
                "{% include 'Resource/Patient' CON: conSegment.24.Repeats[con_25_indexValue], ID: patientId -%}";
            expect(stripDoubleBraceInsideTags(input)).to.equal(expected);
        });

        it("leaves a non-assign, non-if tag with no {{ }} inside it unchanged (no-op)", () => {
            const input = "{% include 'Resource/Patient' ID: patientId -%}";
            expect(stripDoubleBraceInsideTags(input)).to.equal(input);
        });

        it("leaves {{ }} output interpolation outside of any tag unchanged", () => {
            const input = "Hello {{ foo }}, welcome to {{ bar.baz }}!";
            expect(stripDoubleBraceInsideTags(input)).to.equal(input);
        });
    });

    describe("normalizeDoubleDotToSingleDot()", () => {
        it("collapses a double-dot property path in an if condition to a single dot (_PatientExtension.liquid case)", () => {
            const input = "{% if PV1..16 -%}";
            const expected = "{% if PV1.16 -%}";
            expect(normalizeDoubleDotToSingleDot(input)).to.equal(expected);
        });

        it("collapses a double-dot property path in an assign value to a single dot (_TQ_MedicationRequest.liquid case)", () => {
            const input = "{% assign durationValue = TQ..3.Value | slice: 1,3 -%}";
            const expected = "{% assign durationValue = TQ.3.Value | slice: 1,3 -%}";
            expect(normalizeDoubleDotToSingleDot(input)).to.equal(expected);
        });

        it("collapses a double-dot property path in an elsif condition to a single dot", () => {
            const input = "{% elsif foo..bar %}";
            const expected = "{% elsif foo.bar %}";
            expect(normalizeDoubleDotToSingleDot(input)).to.equal(expected);
        });

        it("leaves a legitimate range literal in a for loop completely unchanged", () => {
            const input = "{% for i in (1..5) %}{{ i }}{% endfor %}";
            expect(normalizeDoubleDotToSingleDot(input)).to.equal(input);
        });

        it("leaves content with no double-dot at all unchanged (no-op)", () => {
            const input = "{% assign x = MSG.1.Value | append: 'z' %}";
            expect(normalizeDoubleDotToSingleDot(input)).to.equal(input);
        });

        it("leaves a normal single-dot property access unchanged (no false positive)", () => {
            const input = "{% if PID.7 %}";
            expect(normalizeDoubleDotToSingleDot(input)).to.equal(input);
        });
    });

    describe("normalizeElseifTagName()", () => {
        it("renames elseif to elsif in a tag with a condition", () => {
            const input = "{% elseif foo == 'bar' -%}";
            const expected = "{% elsif foo == 'bar' -%}";
            expect(normalizeElseifTagName(input)).to.equal(expected);
        });

        it("preserves the leading whitespace-control dash when renaming", () => {
            const input = "{%- elseif foo -%}";
            const expected = "{%- elsif foo -%}";
            expect(normalizeElseifTagName(input)).to.equal(expected);
        });

        it("leaves an already-standard elsif tag unchanged (no double-substitution)", () => {
            const input = "{% elsif foo == 'bar' -%}";
            expect(normalizeElseifTagName(input)).to.equal(input);
        });

        it("leaves content with no elseif/elsif at all unchanged", () => {
            const input = "{% if foo %}bar{% else %}baz{% endif %}";
            expect(normalizeElseifTagName(input)).to.equal(input);
        });

        it("does not touch 'elseif' appearing as a substring of a longer word (word boundary check)", () => {
            const input = "{% assign myelseifvar = 1 %}";
            expect(normalizeElseifTagName(input)).to.equal(input);
        });
    });

    describe("normalizeTripleBraceOutput()", () => {
        it("normalizes triple-open, double-close braces to standard double-braces (_Linkage.liquid case)", () => {
            const input = "{{{MRG.1.Repeats[0].4.Value}}";
            const expected = "{{MRG.1.Repeats[0].4.Value}}";
            expect(normalizeTripleBraceOutput(input)).to.equal(expected);
        });

        it("leaves normal double-brace output unchanged (no-op)", () => {
            const input = "{{foo}}";
            expect(normalizeTripleBraceOutput(input)).to.equal(input);
        });

        it("leaves invalid triple-open single-close unchanged (would be invalid anyway)", () => {
            const input = "{{% tag %}";
            expect(normalizeTripleBraceOutput(input)).to.equal(input);
        });

        it("handles triple-brace output with spaces around expression", () => {
            const input = "{{{ MRG.1.Value }}";
            const expected = "{{ MRG.1.Value }}";
            expect(normalizeTripleBraceOutput(input)).to.equal(expected);
        });

        it("does not modify properly balanced triple-braces (3 open, 3 close)", () => {
            const input = "{{{foo}}}";
            // This should remain unchanged - it's balanced (3 open, 3 close)
            expect(normalizeTripleBraceOutput(input)).to.equal(input);
        });

        it("normalizes multiple triple-brace typos in the same content", () => {
            const input = "before {{{a.b}} middle {{{c.d}} after";
            const expected = "before {{a.b}} middle {{c.d}} after";
            expect(normalizeTripleBraceOutput(input)).to.equal(expected);
        });
    });

    describe("normalizeMalformedOutputCloser()", () => {
        it("normalizes malformed output closer -%}} to -}} (_AllergyIntoleranceTypeCode.liquid case)", () => {
            const input = "{{ IAM.9.1.Value | get_property: 'CodeSystem/AllergyIntoleranceTypeCode', 'code' -%}}";
            const expected = "{{ IAM.9.1.Value | get_property: 'CodeSystem/AllergyIntoleranceTypeCode', 'code' -}}";
            expect(normalizeMalformedOutputCloser(input)).to.equal(expected);
        });

        it("normalizes simple output with malformed closer", () => {
            const input = "{{ foo -%}}";
            const expected = "{{ foo -}}";
            expect(normalizeMalformedOutputCloser(input)).to.equal(expected);
        });

        it("normalizes output with filter and malformed closer", () => {
            const input = "{{ foo | filter -%}}";
            const expected = "{{ foo | filter -}}";
            expect(normalizeMalformedOutputCloser(input)).to.equal(expected);
        });

        it("leaves normal output unchanged (no-op)", () => {
            const input = "{{ foo }}";
            expect(normalizeMalformedOutputCloser(input)).to.equal(input);
        });

        it("leaves already-correct whitespace control output unchanged", () => {
            const input = "{{ foo -}}";
            expect(normalizeMalformedOutputCloser(input)).to.equal(input);
        });

        it("leaves legitimate tag whitespace control unchanged", () => {
            const input = "{% tag -%}";
            expect(normalizeMalformedOutputCloser(input)).to.equal(input);
        });

        it("normalizes multiple malformed closers in the same content", () => {
            const input = "{{ a -%}} text {{ b -%}}";
            const expected = "{{ a -}} text {{ b -}}";
            expect(normalizeMalformedOutputCloser(input)).to.equal(expected);
        });
    });

    describe("normalizeVariableNameTypos()", () => {
        it("normalizes messageHeaderID to messageHeaderId in output tag", () => {
            const input = "{{ messageHeaderID }}";
            const expected = "{{ messageHeaderId }}";
            expect(normalizeVariableNameTypos(input)).to.equal(expected);
        });

        it("normalizes messageHeaderID to messageHeaderId in include tag", () => {
            const input = "{% include 'Resource/MessageHeader' MSH: firstSegments.MSH, SFT:sftSegment, ID: messageHeaderID -%}";
            const expected = "{% include 'Resource/MessageHeader' MSH: firstSegments.MSH, SFT:sftSegment, ID: messageHeaderId -%}";
            expect(normalizeVariableNameTypos(input)).to.equal(expected);
        });

        it("normalizes multiple occurrences in same content", () => {
            const input = "{{ messageHeaderID }} and {{ messageHeaderID }}";
            const expected = "{{ messageHeaderId }} and {{ messageHeaderId }}";
            expect(normalizeVariableNameTypos(input)).to.equal(expected);
        });

        it("leaves messageHeaderId unchanged (already correct)", () => {
            const input = "{{ messageHeaderId }}";
            expect(normalizeVariableNameTypos(input)).to.equal(input);
        });

        it("does not match partial word (messageHeaderIDValue)", () => {
            const input = "{{ messageHeaderIDValue }}";
            expect(normalizeVariableNameTypos(input)).to.equal(input);
        });

        it("does not match partial word (PrefixmessageHeaderID)", () => {
            const input = "{{ PrefixmessageHeaderID }}";
            expect(normalizeVariableNameTypos(input)).to.equal(input);
        });

        it("normalizes PatientId to patientId in include tag", () => {
            const input = "{% include 'Extensions/Patient/PatientExtension' ID: PatientId, PID: firstSegments.PID -%}";
            const expected = "{% include 'Extensions/Patient/PatientExtension' ID: patientId, PID: firstSegments.PID -%}";
            expect(normalizeVariableNameTypos(input)).to.equal(expected);
        });

        it("leaves fullPatientId unchanged (different variable)", () => {
            const input = "{{ fullPatientId }}";
            expect(normalizeVariableNameTypos(input)).to.equal(input);
        });

        it("normalizes both messageHeaderID and PatientId in same content", () => {
            const input = "{{ messageHeaderID }} and {{ PatientId }}";
            const expected = "{{ messageHeaderId }} and {{ patientId }}";
            expect(normalizeVariableNameTypos(input)).to.equal(expected);
        });
    });
});
