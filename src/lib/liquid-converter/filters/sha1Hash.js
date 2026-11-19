import {createHash} from "crypto";

// Mirrors the pinned Microsoft StringFilters.Sha1Hash: lowercase hex SHA-1 of the UTF-8 bytes.
export function sha1Hash(data) {
    return createHash("sha1").update(Buffer.from(String(data), "utf8")).digest("hex");
}
