import assert from "assert";
import {mkdir, mkdtemp, rm, writeFile} from "fs/promises";
import os from "os";
import path from "path";
import {applySitePack, collectUnmapped, loadSitePack} from "./sitePack.js";

const CONCEPT_MAP = {
    resourceType: "ConceptMap",
    group: [
        {
            source: "http://local/gender",
            target: "http://hl7.org/fhir/administrative-gender",
            element: [{code: "W", target: [{code: "female", display: "Female"}]}]
        },
        "not-an-object"
    ]
};

describe("projects/sitePack", function () {
    let tempRoot;

    before(async function () {
        tempRoot = await mkdtemp(path.join(os.tmpdir(), "fhir-site-pack-"));
    });

    after(async function () {
        if (tempRoot) {
            await rm(tempRoot, {recursive: true, force: true});
        }
    });

    it("treats a missing conceptmaps directory and identifiers.json as an empty pack", async function () {
        const root = await mkdtemp(path.join(tempRoot, "empty-"));
        const pack = await loadSitePack(root);
        assert.deepStrictEqual(pack, {conceptMaps: [], identifiers: {}});
    });

    it("rewrites a matching Coding and leaves other Codings unchanged", async function () {
        const root = await mkdtemp(path.join(tempRoot, "maps-"));
        await mkdir(path.join(root, "conceptmaps"));
        await writeFile(path.join(root, "conceptmaps/gender.json"), JSON.stringify(CONCEPT_MAP), "utf8");
        const pack = await loadSitePack(root);

        const resource = {
            resourceType: "Patient",
            extension: [
                {valueCoding: {system: "http://local/gender", code: "W"}},
                {valueCoding: {system: "http://local/gender", code: "X", display: "Other"}}
            ]
        };
        const before = JSON.stringify(resource);
        const out = applySitePack(resource, pack);
        assert.strictEqual(JSON.stringify(resource), before);
        assert.deepStrictEqual(out.extension[0].valueCoding, {
            system: "http://hl7.org/fhir/administrative-gender",
            code: "female",
            display: "Female"
        });
        assert.deepStrictEqual(out.extension[1].valueCoding, {
            system: "http://local/gender",
            code: "X",
            display: "Other"
        });
    });

    it("lists only Codings that no ConceptMap group matches, with dot paths", async function () {
        const root = await mkdtemp(path.join(tempRoot, "unmapped-"));
        await mkdir(path.join(root, "conceptmaps"));
        await writeFile(path.join(root, "conceptmaps/gender.json"), JSON.stringify(CONCEPT_MAP), "utf8");
        await writeFile(path.join(root, "identifiers.json"), JSON.stringify({MR: "http://clinic/mrn"}), "utf8");
        const pack = await loadSitePack(root);

        const resource = {
            resourceType: "Bundle",
            entry: [{
                resource: {
                    resourceType: "Patient",
                    identifier: [{value: "123", type: {coding: [{system: "http://local/idtype", code: "MR"}]}}],
                    extension: [
                        {valueCoding: {system: "http://local/gender", code: "W"}},
                        {valueCoding: {system: "http://local/gender", code: "X"}},
                        {valueCoding: {system: "http://local/gender", code: "X"}}
                    ]
                }
            }]
        };
        const before = JSON.stringify(resource);
        const unmapped = collectUnmapped(resource, pack);
        assert.strictEqual(JSON.stringify(resource), before);
        assert.deepStrictEqual(unmapped, [
            {system: "http://local/idtype", code: "MR", path: "entry.0.resource.identifier.0.type.coding.0"},
            {system: "http://local/gender", code: "X", path: "entry.0.resource.extension.1.valueCoding"},
            {system: "http://local/gender", code: "X", path: "entry.0.resource.extension.2.valueCoding"}
        ]);
        assert.ok(!("unmapped" in applySitePack(resource, pack)));
    });

    it("lists every Coding for a pack with no ConceptMaps and nothing for a missing pack", async function () {
        const root = await mkdtemp(path.join(tempRoot, "nomaps-"));
        const pack = await loadSitePack(root);
        const resource = {
            resourceType: "Patient",
            maritalStatus: {coding: [{system: "http://local/ms", code: "M"}]},
            gender: "female"
        };
        assert.deepStrictEqual(collectUnmapped(resource, pack), [
            {system: "http://local/ms", code: "M", path: "maritalStatus.coding.0"}
        ]);
        assert.deepStrictEqual(collectUnmapped(resource, undefined), []);
        assert.deepStrictEqual(collectUnmapped(resource, null), []);
        assert.ok(!("unmapped" in applySitePack(resource, pack)));
    });

    it("fills a missing Identifier system and keeps an existing one", async function () {
        const root = await mkdtemp(path.join(tempRoot, "ids-"));
        await writeFile(path.join(root, "identifiers.json"), JSON.stringify({MR: "http://clinic/mrn"}), "utf8");
        const pack = await loadSitePack(root);

        const out = applySitePack({
            resourceType: "Patient",
            identifier: [
                {value: "123", type: {coding: [{code: "MR"}]}},
                {value: "456", system: "urn:keep", type: {coding: [{code: "MR"}]}}
            ]
        }, pack);
        assert.strictEqual(out.identifier[0].system, "http://clinic/mrn");
        assert.strictEqual(out.identifier[1].system, "urn:keep");
    });

    it("throws status 400 for invalid JSON and for non-object JSON", async function () {
        const badJson = await mkdtemp(path.join(tempRoot, "bad-"));
        await mkdir(path.join(badJson, "conceptmaps"));
        await writeFile(path.join(badJson, "conceptmaps/broken.json"), "{ nope", "utf8");
        await assert.rejects(() => loadSitePack(badJson), (err) => err && err.status === 400);

        const notObject = await mkdtemp(path.join(tempRoot, "arr-"));
        await writeFile(path.join(notObject, "identifiers.json"), "[]", "utf8");
        await assert.rejects(() => loadSitePack(notObject), (err) => err && err.status === 400);
    });

    it("supports composite typeCode@assigner keys matching assigner.display or existing system", async function () {
        const root = await mkdtemp(path.join(tempRoot, "ids-composite-"));
        await writeFile(path.join(root, "identifiers.json"), JSON.stringify({
            "MR@HOSP_A": "https://hosp-a.org/mrn",
            "MR@urn:oid:1.2.3": "https://oid-hosp.org/mrn",
            "MR@LOCAL_NS": "https://local-ns.org/mrn",
            MR: "http://clinic/mrn"
        }), "utf8");
        const pack = await loadSitePack(root);

        const resource = {
            resourceType: "Patient",
            identifier: [
                {
                    value: "101",
                    assigner: {display: "HOSP_A"},
                    type: {coding: [{code: "MR"}]}
                },
                {
                    value: "102",
                    system: "urn:placeholder",
                    assigner: {display: "HOSP_A"},
                    type: {coding: [{code: "MR"}]}
                },
                {
                    value: "103",
                    system: "urn:oid:1.2.3",
                    type: {coding: [{code: "MR"}]}
                },
                {
                    value: "104",
                    system: "LOCAL_NS",
                    type: {coding: [{code: "MR"}]}
                },
                {
                    value: "105",
                    assigner: {display: "UNMAPPED_FAC"},
                    type: {coding: [{code: "MR"}]}
                },
                {
                    value: "106",
                    system: "urn:keep",
                    assigner: {display: "UNMAPPED_FAC"},
                    type: {coding: [{code: "MR"}]}
                }
            ]
        };

        const out = applySitePack(resource, pack);
        assert.strictEqual(out.identifier[0].system, "https://hosp-a.org/mrn");
        assert.strictEqual(out.identifier[1].system, "https://hosp-a.org/mrn");
        assert.strictEqual(out.identifier[2].system, "https://oid-hosp.org/mrn");
        assert.strictEqual(out.identifier[3].system, "https://local-ns.org/mrn");
        assert.strictEqual(out.identifier[4].system, "http://clinic/mrn");
        assert.strictEqual(out.identifier[5].system, "urn:keep");
    });

    it("supports identifier rule objects (bySystem, byAssigner, default, override) and * wildcard", async function () {
        const root = await mkdtemp(path.join(tempRoot, "ids-rules-"));
        await writeFile(path.join(root, "identifiers.json"), JSON.stringify({
            MR: {
                default: "http://clinic/mrn",
                override: false,
                byAssigner: {HOSP_A: "https://hosp-a.org/mrn", EMPI: "https://empi.org/id"},
                bySystem: {"urn:oid:1.2.3": "https://hosp-a.org/mrn", HOSP_B: "https://hosp-b.org/mrn"}
            },
            VN: {
                default: "http://clinic/visit",
                override: true
            },
            "*": {
                default: "http://hie.org/default-id",
                override: false,
                byAssigner: {HIE_HUB: "https://hie.org/hub-id"},
                bySystem: {"urn:oid:9.9.9": "https://hie.org/oid-id"}
            }
        }), "utf8");
        const pack = await loadSitePack(root);

        const resource = {
            resourceType: "Patient",
            identifier: [
                {value: "m1", system: "urn:oid:1.2.3", type: {coding: [{code: "MR"}]}},
                {value: "m2", system: "HOSP_B", type: {coding: [{code: "MR"}]}},
                {value: "m3", system: "urn:legacy", assigner: {display: "EMPI"}, type: {coding: [{code: "MR"}]}},
                {value: "m4", type: {coding: [{code: "MR"}]}},
                {value: "m5", system: "urn:keep-mr", type: {coding: [{code: "MR"}]}},
                {value: "v1", system: "urn:old-visit", type: {coding: [{code: "VN"}]}},
                {value: "w1", system: "urn:oid:9.9.9", type: {coding: [{code: "AN"}]}},
                {value: "w2", assigner: {display: "HIE_HUB"}},
                {value: "w3"},
                {value: "w4", system: "urn:keep-wild", type: {coding: [{code: "AN"}]}}
            ],
            telecom: [
                {system: "phone", value: "555-0100"},
                {value: "555-0101"}
            ]
        };

        const out = applySitePack(resource, pack);
        assert.strictEqual(out.identifier[0].system, "https://hosp-a.org/mrn");
        assert.strictEqual(out.identifier[1].system, "https://hosp-b.org/mrn");
        assert.strictEqual(out.identifier[2].system, "https://empi.org/id");
        assert.strictEqual(out.identifier[3].system, "http://clinic/mrn");
        assert.strictEqual(out.identifier[4].system, "urn:keep-mr");
        assert.strictEqual(out.identifier[5].system, "http://clinic/visit");
        assert.strictEqual(out.identifier[6].system, "https://hie.org/oid-id");
        assert.strictEqual(out.identifier[7].system, "https://hie.org/hub-id");
        assert.strictEqual(out.identifier[8].system, "http://hie.org/default-id");
        assert.strictEqual(out.identifier[9].system, "urn:keep-wild");
        assert.deepStrictEqual(out.telecom, [
            {system: "phone", value: "555-0100"},
            {value: "555-0101"}
        ]);
    });

    it("preserves source Coding and appends mapped target in coding[] when preserveSource is true", async function () {
        const root = await mkdtemp(path.join(tempRoot, "preserve-source-"));
        await mkdir(path.join(root, "conceptmaps"));
        await writeFile(path.join(root, "conceptmaps/labs.json"), JSON.stringify({
            resourceType: "ConceptMap",
            preserveSource: true,
            group: [
                {
                    source: "http://hosp-a.local/lab",
                    target: "http://loinc.org",
                    element: [
                        {code: "CBC_FAST", target: [{code: "58410-2", display: "CBC panel"}]},
                        {code: "GLU_STAT", target: [{code: "2345-7"}]}
                    ]
                },
                {
                    source: "http://hosp-a.local/status",
                    target: "http://hl7.org/fhir/observation-status",
                    preserveSource: false,
                    element: [
                        {code: "FIN", target: [{code: "final"}]}
                    ]
                }
            ]
        }), "utf8");
        await writeFile(path.join(root, "conceptmaps/orders.json"), JSON.stringify({
            resourceType: "ConceptMap",
            group: [
                {
                    source: "http://hosp-a.local/order",
                    target: "http://snomed.info/sct",
                    preserveSource: true,
                    element: [
                        {code: "ECG_12", target: [{code: "29303009", display: "Electrocardiographic procedure"}]}
                    ]
                }
            ]
        }), "utf8");
        const pack = await loadSitePack(root);

        const resource = {
            resourceType: "Observation",
            code: {
                coding: [
                    {system: "http://hosp-a.local/lab", code: "CBC_FAST", display: "Stat CBC"},
                    {system: "http://hosp-a.local/lab", code: "GLU_STAT"}
                ],
                text: "Stat CBC"
            },
            category: [
                {
                    coding: [
                        {system: "http://hosp-a.local/order", code: "ECG_12"},
                        {system: "http://snomed.info/sct", code: "29303009", display: "Electrocardiographic procedure"}
                    ]
                },
                {
                    coding: [
                        {system: "http://hosp-a.local/status", code: "FIN"}
                    ]
                }
            ],
            extension: [
                {
                    valueCoding: {system: "http://hosp-a.local/lab", code: "CBC_FAST", display: "Stat CBC"}
                }
            ]
        };

        const before = JSON.stringify(resource);
        const out = applySitePack(resource, pack);
        assert.strictEqual(JSON.stringify(resource), before);

        assert.deepStrictEqual(out.code.coding, [
            {system: "http://hosp-a.local/lab", code: "CBC_FAST", display: "Stat CBC"},
            {system: "http://loinc.org", code: "58410-2", display: "CBC panel"},
            {system: "http://hosp-a.local/lab", code: "GLU_STAT"},
            {system: "http://loinc.org", code: "2345-7"}
        ]);

        // Already contains target {system, code} -> no duplicate appended.
        assert.deepStrictEqual(out.category[0].coding, [
            {system: "http://hosp-a.local/order", code: "ECG_12"},
            {system: "http://snomed.info/sct", code: "29303009", display: "Electrocardiographic procedure"}
        ]);

        // Group-level preserveSource: false overrides ConceptMap-level preserveSource: true.
        assert.deepStrictEqual(out.category[1].coding, [
            {system: "http://hl7.org/fhir/observation-status", code: "final"}
        ]);

        // Standalone Coding (valueCoding) keeps in-place rewrite behavior even with preserveSource: true.
        assert.deepStrictEqual(out.extension[0].valueCoding, {
            system: "http://loinc.org",
            code: "58410-2",
            display: "CBC panel"
        });

        // Re-applying pack is idempotent (no duplicate target appended).
        const reapplied = applySitePack(out, pack);
        assert.deepStrictEqual(reapplied, out);
    });

    it("skips canonical standard CodeSystems in collectUnmapped unless a ConceptMap group targets that source", async function () {
        const emptyRoot = await mkdtemp(path.join(tempRoot, "std-empty-"));
        const emptyPack = await loadSitePack(emptyRoot);

        const bundle = {
            resourceType: "Bundle",
            entry: [{
                resource: {
                    resourceType: "Observation",
                    code: {
                        coding: [
                            {system: "http://loinc.org", code: "85354-9"},
                            {system: "http://snomed.info/sct", code: "386661006"},
                            {system: "http://unitsofmeasure.org", code: "mm[Hg]"},
                            {system: "http://www.nlm.nih.gov/research/umls/rxnorm", code: "197361"},
                            {system: "http://hl7.org/fhir/administrative-gender", code: "female"},
                            {system: "http://terminology.hl7.org/CodeSystem/v3-ActCode", code: "IMP"},
                            {system: "http://ihe.net/fhir/ValueSet/IHE.FormatCode.codesystem", code: "urn:ihe:iti:xds:2017:mimeTypeSufficient"},
                            {system: "urn:ietf:bcp:47", code: "en-US"},
                            {system: "urn:iso:std:iso:3166", code: "US"},
                            {system: "urn:oid:2.16.840.1.113883.12.1", code: "W"},
                            {system: "99LOCAL_LAB", code: "CBC_FAST"}
                        ]
                    }
                }
            }]
        };

        assert.deepStrictEqual(collectUnmapped(bundle, emptyPack), [
            {
                system: "urn:oid:2.16.840.1.113883.12.1",
                code: "W",
                path: "entry.0.resource.code.coding.9"
            },
            {
                system: "99LOCAL_LAB",
                code: "CBC_FAST",
                path: "entry.0.resource.code.coding.10"
            }
        ]);

        const mappedStdRoot = await mkdtemp(path.join(tempRoot, "std-source-"));
        await mkdir(path.join(mappedStdRoot, "conceptmaps"));
        await writeFile(path.join(mappedStdRoot, "conceptmaps/actcode.json"), JSON.stringify({
            resourceType: "ConceptMap",
            group: [{
                source: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                target: "http://hl7.org/fhir/encounter-class",
                element: [{code: "AMB", target: [{code: "ambulatory"}]}]
            }]
        }), "utf8");
        const mappedStdPack = await loadSitePack(mappedStdRoot);

        assert.deepStrictEqual(collectUnmapped(bundle, mappedStdPack), [
            {
                system: "http://terminology.hl7.org/CodeSystem/v3-ActCode",
                code: "IMP",
                path: "entry.0.resource.code.coding.5"
            },
            {
                system: "urn:oid:2.16.840.1.113883.12.1",
                code: "W",
                path: "entry.0.resource.code.coding.9"
            },
            {
                system: "99LOCAL_LAB",
                code: "CBC_FAST",
                path: "entry.0.resource.code.coding.10"
            }
        ]);
    });
});
