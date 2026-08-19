import assert from "assert";
import {external as helpers} from "./liquid-helpers.js";
import {Liquid} from 'liquidjs';
import evaluate from "./tags/evaluate.js";
import validate from "./tags/validate.js";
import {generateIdInput} from "./filters/generateIdInput.js";
import {generateUuid} from "./filters/generateUuid.js";
import {expect} from 'chai';

describe('Liquid helpers', function () {
    helpers.forEach((h, idx) => {
        it(`func ${idx} should have a name`, function (done) {
            if (h.name.length === 0) {
                done(
                    new Error(`Length of function ${idx} has zero length`)
                );
            } else {
                done();
            }
        });
        it(`${h.name} has a description`, function (done) {
            if (h.description.length === 0) {
                done(new Error(`Length of description for ${h.name} is 0`));
            } else {
                done();
            }
        });
        it(h.name + " should have a function definition", function (done) {
            if (h.func) {
                done();
            } else {
                done(new Error(h.name + " has no function definition"));
            }
        });
    });
    describe('divide filter tests', function () {
        const divide = helpers.find((h) => h.name === 'divide');
        it('should divide two numbers and return a double', function () {
            assert.equal(divide.func(5, 2), 2.5);
        });
        it('should divide two numbers evenly', function () {
            assert.equal(divide.func(10, 2), 5);
        });
        it('should return NaN when dividing by non-numeric input', function () {
            assert.equal(Number.isNaN(divide.func(5, "abc")), true);
        });
    });

    describe('generate_id_input tests', function () {
        it('should generate valid base resource id input', function () {
            assert.equal(generateIdInput("PATID1234,ADT1", "Patient", false), "Patient_PATID1234,ADT1");
        });
        it('should generate valid base optional resource id input', function () {
            assert.equal(generateIdInput("0123456789", "Encounter", false, "5002eb07-c460-7112-6574-50303ae3b4a6"), "Encounter_0123456789_5002eb07-c460-7112-6574-50303ae3b4a6");
        });
        it('should generate valid base required resource id input', function () {
            assert.equal(generateIdInput("NK1|1|DUCK^HUEY|SO|3583 DUCK RD^^FOWL^CA^999990000|8885552222||Y|||||||||||||| ", "RelatedPerson", true, "bab5ca58-f272-4c06-4b3f-f9661e45a22b"), "RelatedPerson_NK1|1|DUCK^HUEY|SO|3583 DUCK RD^^FOWL^CA^999990000|8885552222||Y||||||||||||||_bab5ca58-f272-4c06-4b3f-f9661e45a22b");
        });
        it('should generate valid trimmed base resource id input', function () {
            assert.equal(generateIdInput(`MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3||| 
EVN|A01|20050110045502||||| `, "Bundle", false), `Bundle_MSH|^~\\&|AccMgr|1|||20050110045504||ADT^A01|599102|P|2.3||| 
EVN|A01|20050110045502|||||`);
        });
        it('should handle null, empty or whitespace values correctly', function () {
            assert.equal(generateIdInput(null, "Location", false), null);
            assert.equal(generateIdInput("", "Location", false), null);
            assert.equal(generateIdInput(" \n", "Location", false), null);
        });
        it('should throw an error because base id is required but not provided', function () {
            assert.throws(() => generateIdInput("NK1|1|DUCK^HUEY|SO|3583 DUCK RD^^FOWL^CA^999990000|8885552222||Y|||||||||||||| ", "RelatedPerson", true), Error);
        });
    });

    describe('generate_uuid tests', function () {
        it('should generate the exact upstream-verified UUID for a Bundle id input', function () {
            assert.equal(generateUuid('Bundle_MSG00001'), '513a3d06-5e87-6fbc-ad1b-170ab430499f');
        });
        it('should generate a deterministic SHA256-based UUID (.NET Guid byte order)', function () {
            assert.equal(generateUuid('Patient_PATID1234,ADT1'), 'd5fe6802-a680-e762-8f43-9659340b00ac');
        });
        it('should generate the same UUID for the same input consistently', function () {
            assert.equal(generateUuid('Encounter_0123456789'), generateUuid('Encounter_0123456789'));
        });
        it('should generate different UUIDs for different inputs', function () {
            assert.notEqual(generateUuid('Encounter_0123456789'), generateUuid('Encounter_0123456780'));
        });
    });
});

describe('liquid filters/tags', async function () {

    const engine = new Liquid( {
        root: `${process.cwd()}/src/lib/liquid-converter/demo_templates`,
        extname: '.liquid',
        strictVariables: false,
        lenientIf: true,
    });

    engine.registerFilter('generate_id_input',  generateIdInput);

    engine.registerFilter('generate_uuid', generateUuid);

    engine.registerTag('evaluate', {
        parse: evaluate.parse,
        render: evaluate.render
    });

    engine.registerTag('validate', {
        parse: validate.parse,
        render: validate.render
    });

    it('should work with valid input', function () {
        const template = engine.parseFileSync("ADT_A01");
        const output = engine.renderSync(template);
        const jsonObject = JSON.parse(output.trim());
        assert.equal(jsonObject["resourceType"], "Bundle");
        expect(jsonObject).to.have.property('resourceType').to.equal('Bundle');
        expect(jsonObject).to.have.property('id').to.not.be.null;
    });

    it('should work with valid input and multiple variables', function () {
        const template = engine.parseFileSync("ADT_A01_multiple_vars");
        const output = engine.renderSync(template);
        const json = JSON.parse(output);
        expect(json).to.have.property('resourceType').to.equal('Bundle');
        expect(json).to.have.property('id').to.not.be.null;
    });

    it('should validate without errors', function () {
        const template = engine.parseFileSync("validate-templates/valid_matched.liquid");
        expect(() => engine.renderSync(template)).to.not.throw();
    });

    it('should validate with errors on type mismatch', function () {
        const template = engine.parseFileSync("validate-templates/valid_unmatched1.liquid");
        expect( () => engine.renderSync(template)).to.throw(Error, "failed with data/id must be string");
    });

    it('should validate with errors on additional entry', function () {
        const template = engine.parseFileSync("validate-templates/valid_unmatched2.liquid");
        expect(() => engine.renderSync(template)).to.throw(Error, "failed with data must NOT have additional properties");
    });
});

