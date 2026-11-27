// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

export default async function (msg) {
    try {
        switch (msg.TestOnly) {
            case 'exit':
                process.exit(2);
                break;
            case 'error':
                throw new Error('random error');
            case 'slow':
                await new Promise((resolve) => setTimeout(resolve, msg.delayMs || 100));
                return 'slow-done';
            case 'msg1':
                return 'b';
            case 'msg2':
                return 'c';
            default:
                return 'unknown msg!';
        }
    } catch (err) {
        return err instanceof Error ? err.message : err;
    }
}
