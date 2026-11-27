/**
 * Pre-conversion check for the identifiers R2 conditionally updates on.
 *
 * Returns a list of missing fields for an HL7 v2 ER7 message, or [] when the
 * message carries MSH-10, PID-3.1, PV1-19.1 (when PV1 exists) and TXA-12.1
 * (when TXA exists).
 * Messages without an MSH segment are left to the parser, which rejects them
 * with 400, so this check returns [] for them.
 */
export function findMissingInboundCorrelationIds(srcData) {
    if (typeof srcData !== "string") {
        return [];
    }
    const segments = srcData
        .replace(/^\uFEFF/, "")
        .split(/\r\n|\r|\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

    const msh = segments.find((line) => line.startsWith("MSH"));
    if (!msh || msh.length < 5) {
        return [];
    }
    const fieldSep = msh.charAt(3);
    const componentSep = msh.charAt(4) || "^";

    const fieldsOf = (id) => {
        const line = segments.find((s) => s.startsWith(id + fieldSep));
        return line ? line.split(fieldSep) : null;
    };
    const firstComponent = (fields, index) => {
        if (!fields || fields.length <= index) {
            return "";
        }
        return String(fields[index]).split(componentSep)[0].trim();
    };

    const missing = [];
    // MSH-1 is the field separator itself, so MSH-n sits at split index n-1.
    if (!firstComponent(msh.split(fieldSep), 9)) {
        missing.push("MSH-10");
    }
    const pid = fieldsOf("PID");
    if (!pid || !firstComponent(pid, 3)) {
        missing.push("PID-3");
    }
    const pv1 = fieldsOf("PV1");
    if (pv1 && !firstComponent(pv1, 19)) {
        missing.push("PV1-19");
    }
    const txa = fieldsOf("TXA");
    if (txa && !firstComponent(txa, 12)) {
        missing.push("TXA-12");
    }
    return missing;
}
