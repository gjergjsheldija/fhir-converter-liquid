// DotLiquid `StandardFilters.Prepend` returns null when its input is null, so
// `{% assign x = nil | prepend: 'Encounter/' %}` leaves `x` empty and a
// following `"reference": "{{ x }}"` renders as an empty reference. LiquidJS's
// built-in `prepend` stringifies nil to '' first and always returns a string
// (`Encounter/`).
const stringify = (value) => {
    if (value == null) {
        return '';
    }
    if (Array.isArray(value)) {
        return value.map(stringify).join('');
    }
    return String(value);
};

export function prepend(input, operand) {
    if (input == null) {
        return null;
    }
    return stringify(operand) + stringify(input);
}
