// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// DotLiquid's `==` / `!=` (Condition.EqualVariables) converts the right operand to the left
// operand's type when the two types differ, so `15 == "15"` and `"15" == 15` are both true.
// LiquidJS compares with `===`, so a numeric include argument such as `type_sch: 15` never matched
// `type_sch == "15"` in `Resource/_Appointment.liquid` and the Appointment `status` was dropped.

const INTEGER_TEXT = /^[+-]?\d+$/;

const convertsToNumber = (left, text) => {
    const trimmed = text.trim();
    if (trimmed === '') {
        return undefined;
    }
    if (Number.isInteger(left) && !INTEGER_TEXT.test(trimmed)) {
        return undefined;
    }
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : undefined;
};

export function dotLiquidEquals(left, right) {
    if (left === right) {
        return true;
    }
    if (typeof left === 'number' && typeof right === 'string') {
        return convertsToNumber(left, right) === left;
    }
    if (typeof left === 'string' && typeof right === 'number') {
        return left === String(right);
    }
    return false;
}

// Replace `==` and `!=` on one engine, leaving the shared LiquidJS default operators untouched.
export function applyDotLiquidEquality(engine) {
    const defaults = engine.options.operators;
    engine.options.operators = {
        ...defaults,
        '==': (l, r, ctx) => defaults['=='](l, r, ctx) || dotLiquidEquals(l, r),
        '!=': (l, r, ctx) => defaults['!='](l, r, ctx) && !dotLiquidEquals(l, r)
    };
}
