// Mirrors the pinned Microsoft StringFilters.Match: new Regex(pattern).Match(data).Captures
// holds only the first match (group 0), so the result is [firstMatch] or [].
export function match(data, regexString) {
    if (data == null || data === "") {
        return [];
    }
    const found = new RegExp(regexString).exec(String(data));
    return found ? [found[0]] : [];
}
