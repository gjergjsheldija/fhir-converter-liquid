// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

import assert from "node:assert/strict";
import { Liquid } from "liquidjs";
import {
    applyDotLiquidCompatTransforms,
    normalizeRepeatedTagArgumentCommas,
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
            assert.strictEqual(stripDoubleBraceInsideTags(input), expected);
        });

        it("strips every {{ }} occurrence used as filter arguments in an assign tag", () => {
            const input =
                '{% assign VALUE_STRING_SN = {{OBX.5.1.Value}} | append: " " | append: {{OBX.5.2.Value}} | append: " " | append: {{OBX.5.3.Value}} | append: " " | append: {{OBX.5.4.Value}} -%}';
            const expected =
                '{% assign VALUE_STRING_SN = OBX.5.1.Value | append: " " | append: OBX.5.2.Value | append: " " | append: OBX.5.3.Value | append: " " | append: OBX.5.4.Value -%}';
            assert.strictEqual(stripDoubleBraceInsideTags(input), expected);
        });

        it("leaves an already-standard assign tag unchanged (no-op)", () => {
            const input = "{% assign x = y | append: 'z' %}";
            assert.strictEqual(stripDoubleBraceInsideTags(input), input);
        });

        it("leaves content with no tags at all entirely unchanged, including {{ }} output interpolation", () => {
            const input = "Hello {{ foo }}, welcome to {{ bar.baz }}!";
            assert.strictEqual(stripDoubleBraceInsideTags(input), input);
        });

        it("strips {{ }} braces with an adjacent quote on each side (DotLiquid now-filter idiom)", () => {
            const input = '{% assign generationInstant = "{{ "" | now }}" -%}';
            const expected = '{% assign generationInstant = "" | now -%}';
            assert.strictEqual(stripDoubleBraceInsideTags(input), expected);
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
            assert.strictEqual(stripDoubleBraceInsideTags(input), expected);
        });

        it("strips {{ }} braces from an if tag condition (_Race.liquid case)", () => {
            const input = '{% if {{p.1.Value}} == "2131-1" -%}';
            const expected = '{% if p.1.Value == "2131-1" -%}';
            assert.strictEqual(stripDoubleBraceInsideTags(input), expected);
        });

        it("strips {{ }} braces used as an array index inside a hash-argument value in an include tag", () => {
            const input =
                "{% include 'Resource/Patient' CON: conSegment.24.Repeats[{{con_25_indexValue}}], ID: patientId -%}";
            const expected =
                "{% include 'Resource/Patient' CON: conSegment.24.Repeats[con_25_indexValue], ID: patientId -%}";
            assert.strictEqual(stripDoubleBraceInsideTags(input), expected);
        });

        it("leaves a non-assign, non-if tag with no {{ }} inside it unchanged (no-op)", () => {
            const input = "{% include 'Resource/Patient' ID: patientId -%}";
            assert.strictEqual(stripDoubleBraceInsideTags(input), input);
        });

        it("leaves {{ }} output interpolation outside of any tag unchanged", () => {
            const input = "Hello {{ foo }}, welcome to {{ bar.baz }}!";
            assert.strictEqual(stripDoubleBraceInsideTags(input), input);
        });
    });

    describe("normalizeDoubleDotToSingleDot()", () => {
        it("collapses a double-dot property path in an if condition to a single dot (_PatientExtension.liquid case)", () => {
            const input = "{% if PV1..16 -%}";
            const expected = "{% if PV1.16 -%}";
            assert.strictEqual(normalizeDoubleDotToSingleDot(input), expected);
        });

        it("collapses a double-dot property path in an assign value to a single dot (_TQ_MedicationRequest.liquid case)", () => {
            const input = "{% assign durationValue = TQ..3.Value | slice: 1,3 -%}";
            const expected = "{% assign durationValue = TQ.3.Value | slice: 1,3 -%}";
            assert.strictEqual(normalizeDoubleDotToSingleDot(input), expected);
        });

        it("collapses a double-dot property path in an elsif condition to a single dot", () => {
            const input = "{% elsif foo..bar %}";
            const expected = "{% elsif foo.bar %}";
            assert.strictEqual(normalizeDoubleDotToSingleDot(input), expected);
        });

        it("leaves a legitimate range literal in a for loop completely unchanged", () => {
            const input = "{% for i in (1..5) %}{{ i }}{% endfor %}";
            assert.strictEqual(normalizeDoubleDotToSingleDot(input), input);
        });

        it("leaves content with no double-dot at all unchanged (no-op)", () => {
            const input = "{% assign x = MSG.1.Value | append: 'z' %}";
            assert.strictEqual(normalizeDoubleDotToSingleDot(input), input);
        });

        it("leaves a normal single-dot property access unchanged (no false positive)", () => {
            const input = "{% if PID.7 %}";
            assert.strictEqual(normalizeDoubleDotToSingleDot(input), input);
        });
    });

    describe("normalizeElseifTagName()", () => {
        it("renames elseif to elsif in a tag with a condition", () => {
            const input = "{% elseif foo == 'bar' -%}";
            const expected = "{% elsif foo == 'bar' -%}";
            assert.strictEqual(normalizeElseifTagName(input), expected);
        });

        it("preserves the leading whitespace-control dash when renaming", () => {
            const input = "{%- elseif foo -%}";
            const expected = "{%- elsif foo -%}";
            assert.strictEqual(normalizeElseifTagName(input), expected);
        });

        it("leaves an already-standard elsif tag unchanged (no double-substitution)", () => {
            const input = "{% elsif foo == 'bar' -%}";
            assert.strictEqual(normalizeElseifTagName(input), input);
        });

        it("leaves content with no elseif/elsif at all unchanged", () => {
            const input = "{% if foo %}bar{% else %}baz{% endif %}";
            assert.strictEqual(normalizeElseifTagName(input), input);
        });

        it("does not touch 'elseif' appearing as a substring of a longer word (word boundary check)", () => {
            const input = "{% assign myelseifvar = 1 %}";
            assert.strictEqual(normalizeElseifTagName(input), input);
        });
    });

    describe("normalizeTripleBraceOutput()", () => {
        it("normalizes triple-open, double-close braces to standard double-braces (_Linkage.liquid case)", () => {
            const input = "{{{MRG.1.Repeats[0].4.Value}}";
            const expected = "{{MRG.1.Repeats[0].4.Value}}";
            assert.strictEqual(normalizeTripleBraceOutput(input), expected);
        });

        it("leaves normal double-brace output unchanged (no-op)", () => {
            const input = "{{foo}}";
            assert.strictEqual(normalizeTripleBraceOutput(input), input);
        });

        it("leaves invalid triple-open single-close unchanged (would be invalid anyway)", () => {
            const input = "{{% tag %}";
            assert.strictEqual(normalizeTripleBraceOutput(input), input);
        });

        it("handles triple-brace output with spaces around expression", () => {
            const input = "{{{ MRG.1.Value }}";
            const expected = "{{ MRG.1.Value }}";
            assert.strictEqual(normalizeTripleBraceOutput(input), expected);
        });

        it("does not modify properly balanced triple-braces (3 open, 3 close)", () => {
            const input = "{{{foo}}}";
            // This should remain unchanged - it's balanced (3 open, 3 close)
            assert.strictEqual(normalizeTripleBraceOutput(input), input);
        });

        it("normalizes multiple triple-brace typos in the same content", () => {
            const input = "before {{{a.b}} middle {{{c.d}} after";
            const expected = "before {{a.b}} middle {{c.d}} after";
            assert.strictEqual(normalizeTripleBraceOutput(input), expected);
        });
    });

    describe("normalizeMalformedOutputCloser()", () => {
        it("normalizes malformed output closer -%}} to -}} (_AllergyIntoleranceTypeCode.liquid case)", () => {
            const input = "{{ IAM.9.1.Value | get_property: 'CodeSystem/AllergyIntoleranceTypeCode', 'code' -%}}";
            const expected = "{{ IAM.9.1.Value | get_property: 'CodeSystem/AllergyIntoleranceTypeCode', 'code' -}}";
            assert.strictEqual(normalizeMalformedOutputCloser(input), expected);
        });

        it("normalizes simple output with malformed closer", () => {
            const input = "{{ foo -%}}";
            const expected = "{{ foo -}}";
            assert.strictEqual(normalizeMalformedOutputCloser(input), expected);
        });

        it("normalizes output with filter and malformed closer", () => {
            const input = "{{ foo | filter -%}}";
            const expected = "{{ foo | filter -}}";
            assert.strictEqual(normalizeMalformedOutputCloser(input), expected);
        });

        it("leaves normal output unchanged (no-op)", () => {
            const input = "{{ foo }}";
            assert.strictEqual(normalizeMalformedOutputCloser(input), input);
        });

        it("leaves already-correct whitespace control output unchanged", () => {
            const input = "{{ foo -}}";
            assert.strictEqual(normalizeMalformedOutputCloser(input), input);
        });

        it("leaves legitimate tag whitespace control unchanged", () => {
            const input = "{% tag -%}";
            assert.strictEqual(normalizeMalformedOutputCloser(input), input);
        });

        it("normalizes multiple malformed closers in the same content", () => {
            const input = "{{ a -%}} text {{ b -%}}";
            const expected = "{{ a -}} text {{ b -}}";
            assert.strictEqual(normalizeMalformedOutputCloser(input), expected);
        });
    });

    describe("normalizeVariableNameTypos()", () => {
        it("normalizes messageHeaderID to messageHeaderId in output tag", () => {
            const input = "{{ messageHeaderID }}";
            const expected = "{{ messageHeaderId }}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("normalizes messageHeaderID to messageHeaderId in include tag", () => {
            const input = "{% include 'Resource/MessageHeader' MSH: firstSegments.MSH, SFT:sftSegment, ID: messageHeaderID -%}";
            const expected = "{% include 'Resource/MessageHeader' MSH: firstSegments.MSH, SFT:sftSegment, ID: messageHeaderId -%}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("normalizes multiple occurrences in same content", () => {
            const input = "{{ messageHeaderID }} and {{ messageHeaderID }}";
            const expected = "{{ messageHeaderId }} and {{ messageHeaderId }}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves messageHeaderId unchanged (already correct)", () => {
            const input = "{{ messageHeaderId }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("does not match partial word (messageHeaderIDValue)", () => {
            const input = "{{ messageHeaderIDValue }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("does not match partial word (PrefixmessageHeaderID)", () => {
            const input = "{{ PrefixmessageHeaderID }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("normalizes PatientId to patientId in include tag", () => {
            const input = "{% include 'Extensions/Patient/PatientExtension' ID: PatientId, PID: firstSegments.PID -%}";
            const expected = "{% include 'Extensions/Patient/PatientExtension' ID: patientId, PID: firstSegments.PID -%}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves fullPatientId unchanged (different variable)", () => {
            const input = "{{ fullPatientId }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("normalizes both messageHeaderID and PatientId in same content", () => {
            const input = "{{ messageHeaderID }} and {{ PatientId }}";
            const expected = "{{ messageHeaderId }} and {{ patientId }}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("normalizes medicationRequestID to medicationRequestId in the ORM_O01 include argument", () => {
            const input = "{% include 'Resource/MedicationRequest' ORM_ORC_7: orcSegment_7_firstRep, ORM_RXO: rxoSegment, ID: medicationRequestID -%}";
            const expected = "{% include 'Resource/MedicationRequest' ORM_ORC_7: orcSegment_7_firstRep, ORM_RXO: rxoSegment, ID: medicationRequestId -%}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves medicationRequestId and longer names unchanged", () => {
            const input = "{{ medicationRequestId }} {{ medicationRequestIDx }} {{ fullmedicationRequestID }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("normalizes AccountId_BLG to accountId_BLG in the BLG Account include argument", () => {
            const input = "{% include 'Resource/Account' BLG: blgSegment, ID: AccountId_BLG -%}";
            const expected = "{% include 'Resource/Account' BLG: blgSegment, ID: accountId_BLG -%}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves accountId_BLG and longer names unchanged", () => {
            const input = "{{ accountId_BLG }} {{ AccountId_BLGx }} {{ fullAccountId_BLG }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("normalizes AccountId to accountId in the Encounter account reference and caller argument", () => {
            const input = '{% if AccountId -%}{ "reference":"Account/{{ AccountId }}" }{% endif -%}\n{% include \'Resource/Encounter\' ID: encounterId, AccountId:accountId -%}';
            const expected = '{% if accountId -%}{ "reference":"Account/{{ accountId }}" }{% endif -%}\n{% include \'Resource/Encounter\' ID: encounterId, accountId:accountId -%}';
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves accountId and longer AccountId names unchanged", () => {
            const input = "{{ accountId }} {{ AccountIdx }} {{ fullAccountId }} {{ AccountId_Other }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("normalizes device_ID_AIG_3 to device_Id_AIG_3 in the Appointment participant reference", () => {
            const input = '"reference":"Device/{{ device_ID_AIG_3 }}"';
            const expected = '"reference":"Device/{{ device_Id_AIG_3 }}"';
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves device_Id_AIG_3 and longer names unchanged", () => {
            const input = "{{ device_Id_AIG_3 }} {{ device_ID_AIG_3x }} {{ fulldevice_ID_AIG_3 }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("normalizes practitionerId_obr_10 to practitionerId_OBR_10 in the collector PractitionerRole include", () => {
            const input = "{% include 'Resource/PractitionerRole' OBR: obrSegment, collection_collector_practitioner: practitionerId_obr_10, ID: practitionerRoleId_OBR_10 -%}";
            const expected = "{% include 'Resource/PractitionerRole' OBR: obrSegment, collection_collector_practitioner: practitionerId_OBR_10, ID: practitionerRoleId_OBR_10 -%}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves practitionerId_OBR_10, full_practitionerId_obr_10 and longer names unchanged", () => {
            const input = "{{ practitionerId_OBR_10 }} {{ full_practitionerId_obr_10 }} {{ practitionerId_obr_100 }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("normalizes REF_prac to REF_Prac in the REF PRD ServiceRequest include", () => {
            const input = "{% include 'Resource/ServiceRequest' PRD: prdSegment, REF_prac: full_PractitionerRole_ID_PRD, ID: serviceRequestId_RF1 %}";
            const expected = "{% include 'Resource/ServiceRequest' PRD: prdSegment, REF_Prac: full_PractitionerRole_ID_PRD, ID: serviceRequestId_RF1 %}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves REF_Prac, REF_pract and longer REF_prac names unchanged", () => {
            const input = "{{ REF_Prac }} {{ REF_pract }} {{ full_REF_prac }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("passes the obr_34/obr_35 loop variable as the OBR_34/OBR_35 PractitionerRole argument value", () => {
            const input = "{% include 'Resource/PractitionerRole' OBR_34: OBR_34, ID: practitionerRoleId_obr_34 -%}\n{% include 'Resource/PractitionerRole' OBR_35: OBR_35, ID: practitionerRoleId_obr_35 -%}";
            const expected = "{% include 'Resource/PractitionerRole' OBR_34: obr_34, ID: practitionerRoleId_obr_34 -%}\n{% include 'Resource/PractitionerRole' OBR_35: obr_35, ID: practitionerRoleId_obr_35 -%}";
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("keeps the OBR_34/OBR_35 argument name and in-partial reads unchanged", () => {
            const input = "{% if OBR_34 %}{% include 'DataType/NDLPractitionerRole' NDL: OBR_34 -%}{% endif %}{% include 'Resource/Practitioner' CNN_OBR_34_1: obr_34.1 -%}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("reads textString where the template captured textString but read textstring (MedicationRequest patientInstruction)", () => {
            const input = '{% capture textString %}{{ x | split: "^" | join: "--" }}{% endcapture -%}\n{% capture specomp %}{{ textstring  | split: "~" | join: "+" }}{% endcapture -%}';
            const expected = '{% capture textString %}{{ x | split: "^" | join: "--" }}{% endcapture -%}\n{% capture specomp %}{{ textString  | split: "~" | join: "+" }}{% endcapture -%}';
            assert.strictEqual(normalizeVariableNameTypos(input), expected);
        });

        it("leaves textstring alone when the template itself captures or assigns textstring", () => {
            const input = '{% capture textstring %}{{ x }}{% endcapture -%}{{ textstring }} {% capture textString %}{{ y }}{% endcapture -%}';
            assert.strictEqual(normalizeVariableNameTypos(input), input);
            const assigned = '{% assign textstring = "" -%}{{ textstring }}';
            assert.strictEqual(normalizeVariableNameTypos(assigned), assigned);
        });

        it("leaves textstring alone when textString is never defined, and does not touch textStringValue", () => {
            const input = "{{ textstring }} {{ textStringValue }}";
            assert.strictEqual(normalizeVariableNameTypos(input), input);
        });

        it("renders the captured instruction through the engine after normalization", async () => {
            const engine = new Liquid();
            const raw = '{% capture textString %}{{ v | split: "^" | join: "--" }}{% endcapture -%}{% capture specomp %}{{ textstring | split: "~" | join: "+" }}{% endcapture -%}[{{ specomp }}]';
            assert.strictEqual(await engine.parseAndRender(raw, { v: "^1 tablet" }), "[]");
            assert.strictEqual(await engine.parseAndRender(applyDotLiquidCompatTransforms(raw), { v: "1 tablet" }), "[1 tablet]");
        });
    });

    describe("normalizeRepeatedTagArgumentCommas()", () => {
        it("collapses a doubled comma between include arguments (OUL_R23 DiagnosticReport/Encounter)", () => {
            const input = "{% include 'Reference/DiagnosticReport/Encounter' REF: full_ServiceRequest_Encounter_ID,, ID: diagnosticId  %}";
            const expected = "{% include 'Reference/DiagnosticReport/Encounter' REF: full_ServiceRequest_Encounter_ID, ID: diagnosticId  %}";
            assert.strictEqual(normalizeRepeatedTagArgumentCommas(input), expected);
        });

        it("collapses commas separated by whitespace", () => {
            const input = "{% include 'Resource/EpisodeOfCare' PV2: a, ,  , ID: b -%}";
            const expected = "{% include 'Resource/EpisodeOfCare' PV2: a, ID: b -%}";
            assert.strictEqual(normalizeRepeatedTagArgumentCommas(input), expected);
        });

        it("leaves single commas, quoted literals and text outside tags untouched", () => {
            const input = "a,, b {% include 'x' A: ',,', B: \"x,,y\", C: c %} {{ d }},,";
            assert.strictEqual(normalizeRepeatedTagArgumentCommas(input), input);
        });

        it("is applied by applyDotLiquidCompatTransforms", () => {
            assert.strictEqual(applyDotLiquidCompatTransforms("{% include 'x' A: a,, B: b %}"), "{% include 'x' A: a, B: b %}");
        });

        it("keeps the ID argument so the include reaches the intended resource", async () => {
            const engine = new Liquid({ fs: { readFileSync: () => "{{ ID }}|{{ REF }}", existsSync: () => true, exists: async () => true, readFile: async () => "{{ ID }}|{{ REF }}", resolve: (root, file) => file, dirname: () => ".", sep: "/" } });
            const raw = "{% include 'p' REF: r,, ID: d %}";
            assert.strictEqual(await engine.parseAndRender(raw, { r: "R", d: "D" }), "|R");
            assert.strictEqual(await engine.parseAndRender(applyDotLiquidCompatTransforms(raw), { r: "R", d: "D" }), "D|R");
        });
    });
});
