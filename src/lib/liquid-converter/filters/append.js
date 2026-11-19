// DotLiquid `StandardFilters.Append` returns null when its input is null, so
// `{% assign x = nil | append: '--' %}` leaves `x == null` true. LiquidJS's
// built-in `append` stringifies nil to '' first and always returns a string.
const stringify = (value) => {
    if (value == null) {
        return '';
    }
    if (Array.isArray(value)) {
        return value.map(stringify).join('');
    }
    return String(value);
};

export function append(input, operand) {
    if (input == null) {
        return null;
    }
    return stringify(input) + stringify(operand);
}
