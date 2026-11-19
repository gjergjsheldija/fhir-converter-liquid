// Mirrors the pinned Microsoft StringFilters.Base64Encode: base64 of the UTF-8 bytes.
export function base64Encode(data) {
    return Buffer.from(String(data), "utf8").toString("base64");
}
