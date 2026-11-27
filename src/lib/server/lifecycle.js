// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

export function attachGracefulShutdown({
    server,
    workerPool,
    logger,
    onSighup,
    shutdownTimeoutMs = 10000
} = {}) {
    let shuttingDown = false;

    const logInfo = (msg) => {
        if (logger && typeof logger.info === "function") {
            logger.info(msg);
        }
    };

    const logError = (msg) => {
        if (logger && typeof logger.error === "function") {
            logger.error(msg);
        }
    };

    async function handleShutdown(signal) {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;
        logInfo(`Received ${signal}; starting graceful shutdown.`);

        const forceTimer = setTimeout(() => {
            logError(`Graceful shutdown timed out after ${shutdownTimeoutMs}ms; forcing exit.`);
            process.exit(1);
        }, shutdownTimeoutMs);
        if (typeof forceTimer.unref === "function") {
            forceTimer.unref();
        }

        try {
            if (server && typeof server.close === "function") {
                await new Promise((resolve) => {
                    server.close(() => resolve());
                });
            }
            if (workerPool && typeof workerPool.destroy === "function") {
                await workerPool.destroy();
            }
            clearTimeout(forceTimer);
            logInfo("Graceful shutdown complete.");
            process.exit(0);
        } catch (err) {
            clearTimeout(forceTimer);
            logError(`Error during graceful shutdown: ${err && err.message ? err.message : err}`);
            process.exit(1);
        }
    }

    function onSigterm() {
        handleShutdown("SIGTERM");
    }

    function onSigint() {
        handleShutdown("SIGINT");
    }

    async function handleSighup() {
        try {
            if (typeof onSighup === "function") {
                await onSighup();
            }
            logInfo("Received SIGHUP; reloaded customer config and template caches.");
        } catch (err) {
            logError(`Failed to reload caches on SIGHUP: ${err && err.message ? err.message : err}`);
        }
    }

    process.on("SIGTERM", onSigterm);
    process.on("SIGINT", onSigint);
    process.on("SIGHUP", handleSighup);

    return function detach() {
        process.removeListener("SIGTERM", onSigterm);
        process.removeListener("SIGINT", onSigint);
        process.removeListener("SIGHUP", handleSighup);
    };
}

export default attachGracefulShutdown;
