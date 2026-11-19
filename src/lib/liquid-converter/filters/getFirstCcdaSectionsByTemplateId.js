// Mirrors the pinned Microsoft SectionFilters.GetFirstCcdaSectionsByTemplateId: for each
// "|"-separated template id, finds the first structuredBody component whose section
// templateId (serialized as JSON) contains it, case-insensitively, and keys the section by
// the template id with every non-alphanumeric character replaced by "_".
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function getComponents(data) {
    const document = data && data.ClinicalDocument;
    const components = isObject(document) && isObject(document.component) && isObject(document.component.structuredBody)
        ? document.component.structuredBody.component
        : undefined;
    if (components == null) {
        return null;
    }
    return Array.isArray(components) ? components : [components];
}

export function getFirstCcdaSectionsByTemplateId(data, templateIdContent) {
    const result = {};
    const components = getComponents(data);
    if (components === null) {
        return result;
    }
    const templateIds = String(templateIdContent == null ? "" : templateIdContent)
        .split("|")
        .filter((id) => id !== "");
    for (const templateId of templateIds) {
        const needle = templateId.toLowerCase();
        for (const component of components) {
            const section = isObject(component) ? component.section : undefined;
            if (isObject(section) && section.templateId != null &&
                JSON.stringify(section.templateId).toLowerCase().includes(needle)) {
                result[templateId.replace(/[^A-Za-z0-9]/g, "_")] = section;
                break;
            }
        }
    }
    return result;
}
