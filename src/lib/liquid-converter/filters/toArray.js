// Mirrors the pinned Microsoft CollectionFilters.ToArray: null becomes an empty list, a
// list is copied, and any other value (including strings and objects) becomes a one-item list.
export function toArray(input) {
    if (input == null) {
        return [];
    }
    return Array.isArray(input) ? input.slice() : [input];
}
