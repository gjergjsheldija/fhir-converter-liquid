
export function generateIdInput(segment, resourceType, isBaseIdRequired, baseId) {

    if (!segment) {
        if (!this) return null;
        if (this.context.scopes.length === 1) {
            const obj = this.context.scopes[0];
            if (typeof obj === 'object') {
                segment = Object.values(obj);
            }
        }
    }

    const filter = function (segment, resourceType, isBaseIdRequired, baseId = "default") {
        if (!segment || segment.length === 0 || segment.toString().trim().length === 0) {
            return null;
        }

        if ((!resourceType || resourceType.length === 0) || (isBaseIdRequired && (baseId === "default"))) {
            throw new Error("invalid id generation input");
        }

        segment = segment.toString().trim();
        return baseId !== "default" ? `${resourceType}_${segment}_${baseId}` : `${resourceType}_${segment}`;
    };
    return filter(segment, resourceType, isBaseIdRequired, baseId);
}
