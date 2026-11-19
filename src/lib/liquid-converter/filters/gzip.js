import {gzipSync} from "zlib";

// Mirrors the pinned Microsoft StringFilters.Gzip: UTF-8 bytes, GZip-compressed, base64-encoded.
// (DotLiquid would throw on null input, so there is no nil special case.)
export function gzip(data) {
    return gzipSync(Buffer.from(String(data), "utf8")).toString("base64");
}
