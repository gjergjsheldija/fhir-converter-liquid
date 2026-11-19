// Mirrors the pinned Microsoft StringFilters.ToJsonString: null for null, otherwise
// compact JSON (JsonConvert.SerializeObject with Formatting.None).
export function toJsonString(data) {
    return data == null ? null : JSON.stringify(data);
}
