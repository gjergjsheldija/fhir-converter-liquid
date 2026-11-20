// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// Tolerant JSON lexer + recursive-descent parser matching json.g4 + jsonCustomListener:
//   json  : obj ;
//   obj   : '{' (','* pair)* ','* '}' ;
//   pair  : STRING ':' | STRING ':' value ;
//   array : '[' (','* value)* ','* ']' ;
//   value : STRING | NUMBER | obj | array | 'true' | 'false' | 'null' ;
//
// Normalizes omitted/repeated commas, recovers from malformed pairs/tokens, and prunes
// empty strings (""), valueless pairs ("k":), empty objects, and empty arrays while
// preserving JSON literal null, booleans, and numbers.

const T_EOF = 0;
const T_LBRACE = 1;
const T_COMMA = 2;
const T_RBRACE = 3;
const T_COLON = 4;
const T_LBRACKET = 5;
const T_RBRACKET = 6;
const T_TRUE = 7;
const T_FALSE = 8;
const T_NULL = 9;
const T_STRING = 10;
const T_NUMBER = 11;

const VALUE_START =
    (1 << T_STRING) |
    (1 << T_NUMBER) |
    (1 << T_LBRACE) |
    (1 << T_LBRACKET) |
    (1 << T_TRUE) |
    (1 << T_FALSE) |
    (1 << T_NULL);

const OBJ_FOLLOW_PAIR = (1 << T_COMMA) | (1 << T_STRING) | (1 << T_RBRACE);
const ARRAY_FOLLOW_ELEM = (1 << T_COMMA) | (1 << T_RBRACKET) | VALUE_START;

function isDigit(c) {
    return c >= 48 && c <= 57;
}

function isHex(c) {
    return (c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
}

function isSimpleEscape(c) {
    return (
        c === 34 || // "
        c === 47 || // /
        c === 92 || // \
        c === 98 || // b
        c === 102 || // f
        c === 110 || // n
        c === 114 || // r
        c === 116 // t
    );
}

function tokenize(input) {
    const len = input.length;
    const types = [];
    const texts = [];
    let i = 0;

    while (i < len) {
        const c = input.charCodeAt(i);

        if (c === 32 || c === 9 || c === 10 || c === 13) {
            i++;
            continue;
        }
        if (c === 123) {
            types.push(T_LBRACE);
            texts.push('');
            i++;
            continue;
        }
        if (c === 44) {
            types.push(T_COMMA);
            texts.push('');
            i++;
            continue;
        }
        if (c === 125) {
            types.push(T_RBRACE);
            texts.push('');
            i++;
            continue;
        }
        if (c === 58) {
            types.push(T_COLON);
            texts.push('');
            i++;
            continue;
        }
        if (c === 91) {
            types.push(T_LBRACKET);
            texts.push('');
            i++;
            continue;
        }
        if (c === 93) {
            types.push(T_RBRACKET);
            texts.push('');
            i++;
            continue;
        }

        if (c === 34) {
            let j = i + 1;
            let matched = false;
            while (j < len) {
                const ch = input.charCodeAt(j);
                if (ch === 34) {
                    types.push(T_STRING);
                    texts.push(input.slice(i, j + 1));
                    i = j + 1;
                    matched = true;
                    break;
                }
                if (ch === 92) {
                    if (j + 1 >= len) {
                        break;
                    }
                    const esc = input.charCodeAt(j + 1);
                    if (isSimpleEscape(esc)) {
                        j += 2;
                        continue;
                    }
                    if (
                        esc === 117 &&
                        j + 5 < len &&
                        isHex(input.charCodeAt(j + 2)) &&
                        isHex(input.charCodeAt(j + 3)) &&
                        isHex(input.charCodeAt(j + 4)) &&
                        isHex(input.charCodeAt(j + 5))
                    ) {
                        j += 6;
                        continue;
                    }
                    break;
                }
                if (ch < 32) {
                    break;
                }
                j++;
            }
            if (!matched) {
                i++;
            }
            continue;
        }

        if (c === 45 || (c >= 48 && c <= 57)) {
            let j = i;
            if (c === 45) {
                j++;
            }
            if (j < len && isDigit(input.charCodeAt(j))) {
                if (input.charCodeAt(j) === 48) {
                    j++;
                } else {
                    j++;
                    while (j < len && isDigit(input.charCodeAt(j))) {
                        j++;
                    }
                }
                let end = j;
                if (j + 1 < len && input.charCodeAt(j) === 46 && isDigit(input.charCodeAt(j + 1))) {
                    j += 2;
                    while (j < len && isDigit(input.charCodeAt(j))) {
                        j++;
                    }
                    end = j;
                }
                if (j < len && (input.charCodeAt(j) === 69 || input.charCodeAt(j) === 101)) {
                    let k = j + 1;
                    if (k < len && (input.charCodeAt(k) === 43 || input.charCodeAt(k) === 45)) {
                        k++;
                    }
                    if (k < len && isDigit(input.charCodeAt(k))) {
                        if (input.charCodeAt(k) === 48) {
                            k++;
                        } else {
                            k++;
                            while (k < len && isDigit(input.charCodeAt(k))) {
                                k++;
                            }
                        }
                        end = k;
                    }
                }
                types.push(T_NUMBER);
                texts.push(input.slice(i, end));
                i = end;
                continue;
            }
            i++;
            continue;
        }

        if (c === 116 && input.startsWith('true', i)) {
            types.push(T_TRUE);
            texts.push('true');
            i += 4;
            continue;
        }
        if (c === 102 && input.startsWith('false', i)) {
            types.push(T_FALSE);
            texts.push('false');
            i += 5;
            continue;
        }
        if (c === 110 && input.startsWith('null', i)) {
            types.push(T_NULL);
            texts.push('null');
            i += 4;
            continue;
        }

        i++;
    }

    // Pad with 4 EOF sentinels so up to LL(4) lookahead needs no bounds checks.
    types.push(T_EOF, T_EOF, T_EOF, T_EOF);
    texts.push('', '', '', '');
    return {types, texts};
}

function consumeUntil(state, mask) {
    const {types} = state;
    while (types[state.pos] !== T_EOF && ((mask >>> types[state.pos]) & 1) === 0) {
        state.pos++;
    }
}

function matchClose(state, expectedType, immediateFollow, fullFollow) {
    const {types} = state;
    if (types[state.pos] === expectedType) {
        state.pos++;
        state.errorRecovery = false;
        return;
    }
    if (types[state.pos + 1] === expectedType) {
        state.pos += 2;
        state.errorRecovery = false;
        return;
    }
    if (((immediateFollow >>> types[state.pos]) & 1) !== 0) {
        state.errorRecovery = true;
        return;
    }
    state.errorRecovery = true;
    consumeUntil(state, fullFollow);
}

function syncLoopEntry(state, expecting, fullFollow) {
    const {types} = state;
    if (state.errorRecovery || ((expecting >>> types[state.pos]) & 1) !== 0) {
        return true;
    }
    if (((expecting >>> types[state.pos + 1]) & 1) !== 0) {
        state.pos++;
        state.errorRecovery = false;
        return true;
    }
    state.errorRecovery = true;
    consumeUntil(state, fullFollow);
    return false;
}

function syncLoopBack(state, expecting, innerFullFollow) {
    if (!state.errorRecovery && ((expecting >>> state.types[state.pos]) & 1) === 0) {
        state.errorRecovery = true;
        consumeUntil(state, innerFullFollow);
    }
}

function parseObj(state, immediateFollow, fullFollow, isRoot) {
    const {types, texts} = state;
    if (types[state.pos] === T_LBRACE) {
        state.pos++;
        state.errorRecovery = false;
    } else if (isRoot) {
        if (types[state.pos + 1] === T_LBRACE) {
            state.pos += 2;
            state.errorRecovery = false;
        } else if (((OBJ_FOLLOW_PAIR >>> types[state.pos]) & 1) !== 0) {
            state.errorRecovery = true;
        } else {
            state.errorRecovery = true;
            consumeUntil(state, fullFollow);
            return null;
        }
    }

    const pairs = [];
    const innerFullFollow = fullFollow | OBJ_FOLLOW_PAIR;

    if (!syncLoopEntry(state, OBJ_FOLLOW_PAIR, fullFollow)) {
        return null;
    }

    for (;;) {
        let k = state.pos;
        while (types[k] === T_COMMA) {
            k++;
        }
        if (types[k] !== T_STRING) {
            break;
        }
        if (k > state.pos) {
            state.pos = k;
            state.errorRecovery = false;
        }

        // pair : STRING ':' | STRING ':' value
        if (types[state.pos + 1] !== T_COLON) {
            state.errorRecovery = true;
            state.pos++;
            consumeUntil(state, innerFullFollow);
            syncLoopBack(state, OBJ_FOLLOW_PAIR, innerFullFollow);
            continue;
        }

        const la3 = types[state.pos + 2];
        if (la3 === T_COMMA || la3 === T_RBRACE) {
            state.pos += 2;
            state.errorRecovery = false;
            syncLoopBack(state, OBJ_FOLLOW_PAIR, innerFullFollow);
            continue;
        }

        if (la3 === T_STRING) {
            const la4 = types[state.pos + 3];
            if (la4 === T_COLON) {
                // Next STRING starts another pair ("b":"c":"3" -> drop "b":).
                state.pos += 2;
                state.errorRecovery = false;
                syncLoopBack(state, OBJ_FOLLOW_PAIR, innerFullFollow);
                continue;
            }
            if (la4 === T_COMMA || la4 === T_STRING || la4 === T_RBRACE) {
                const key = texts[state.pos];
                const val = texts[state.pos + 2];
                state.pos += 3;
                state.errorRecovery = false;
                if (val !== '""') {
                    pairs.push(`${key}:${val}`);
                }
                syncLoopBack(state, OBJ_FOLLOW_PAIR, innerFullFollow);
                continue;
            }
            state.errorRecovery = true;
            state.pos++;
            consumeUntil(state, innerFullFollow);
            syncLoopBack(state, OBJ_FOLLOW_PAIR, innerFullFollow);
            continue;
        }

        if (((VALUE_START >>> la3) & 1) !== 0) {
            const key = texts[state.pos];
            state.pos += 2;
            state.errorRecovery = false;
            const val = parseValue(state, OBJ_FOLLOW_PAIR, innerFullFollow);
            if (val) {
                pairs.push(`${key}:${val}`);
            }
            syncLoopBack(state, OBJ_FOLLOW_PAIR, innerFullFollow);
            continue;
        }

        state.errorRecovery = true;
        state.pos++;
        consumeUntil(state, innerFullFollow);
        syncLoopBack(state, OBJ_FOLLOW_PAIR, innerFullFollow);
    }

    while (types[state.pos] === T_COMMA) {
        state.pos++;
        state.errorRecovery = false;
    }
    matchClose(state, T_RBRACE, immediateFollow, fullFollow);

    return pairs.length > 0 ? `{${pairs.join(',')}}` : null;
}

function parseArray(state, immediateFollow, fullFollow) {
    const {types} = state;
    state.pos++;
    state.errorRecovery = false;
    const values = [];
    const innerFullFollow = fullFollow | ARRAY_FOLLOW_ELEM;

    if (!syncLoopEntry(state, ARRAY_FOLLOW_ELEM, fullFollow)) {
        return null;
    }

    for (;;) {
        let k = state.pos;
        while (types[k] === T_COMMA) {
            k++;
        }
        if (((VALUE_START >>> types[k]) & 1) === 0) {
            break;
        }
        if (k > state.pos) {
            state.pos = k;
            state.errorRecovery = false;
        }
        const val = parseValue(state, ARRAY_FOLLOW_ELEM, innerFullFollow);
        if (val) {
            values.push(val);
        }
        syncLoopBack(state, ARRAY_FOLLOW_ELEM, innerFullFollow);
    }

    while (types[state.pos] === T_COMMA) {
        state.pos++;
        state.errorRecovery = false;
    }
    matchClose(state, T_RBRACKET, immediateFollow, fullFollow);

    return values.length > 0 ? `[${values.join(',')}]` : null;
}

function parseValue(state, immediateFollow, fullFollow) {
    const t = state.types[state.pos];
    if (t === T_STRING) {
        const text = state.texts[state.pos++];
        state.errorRecovery = false;
        return text === '""' ? null : text;
    }
    if (t === T_NUMBER || t === T_TRUE || t === T_FALSE || t === T_NULL) {
        state.errorRecovery = false;
        return state.texts[state.pos++];
    }
    if (t === T_LBRACE) {
        return parseObj(state, immediateFollow, fullFollow, false);
    }
    if (t === T_LBRACKET) {
        return parseArray(state, immediateFollow, fullFollow);
    }
    return null;
}

export function Process(input) {
    if (typeof input !== 'string') {
        return input;
    }

    try {
        const {types, texts} = tokenize(input);
        const state = {types, texts, pos: 0, errorRecovery: false};
        const result = parseObj(state, 1 << T_EOF, 1 << T_EOF, true);
        return result || '{}';
    } catch {
        return input;
    }
}
