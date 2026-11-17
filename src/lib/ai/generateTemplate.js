// -------------------------------------------------------------------------------------------------
// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License (MIT). See LICENSE in the repo root for license information.
// -------------------------------------------------------------------------------------------------

// One provider call plus the two prompt builders used by the generate loop.
// This module never touches the converter. The decide-whether-it-renders step
// lives in the generate route so tests can stub the provider in isolation.

// Build the prompt for the very first provider call: propose a Liquid template
// from the raw HL7v2 message.
export function buildInitialPrompt(message, prompt) {
    return [
        "Propose an HL7v2-to-FHIR Liquid template.",
        prompt ? "Guidance: " + prompt : "",
        "Raw message:",
        message,
    ].filter((part) => part !== "").join("\n");
}

// Build the fix prompt sent after a converter render error: include the
// current template text and the converter error message.
export function buildFixPrompt(currentTemplate, errorMessage, unusedSegmentsText) {
    return [
        "The following Liquid template does not render for the message.",
        "Fix it and return the full updated template text only.",
        "",
        "Current template:",
        currentTemplate,
        "",
        "Converter error:",
        errorMessage,
    ].filter((part) => part !== "").join("\n") +
        (unusedSegmentsText ? "\n\nUnused segments (context, not required to be empty):\n" + unusedSegmentsText : "");
}

// The provider call. Accepts a single flat object and returns template text,
// or throws an error whose message the route places in the 400 envelope.
// Tests replace this module and never set a real API key.
export async function callExternalAI({ provider, model, apiKey, baseUrl, temperature, prompt }) {
    if (!baseUrl) {
        throw new Error(`AI provider '${provider}' is not configured.`);
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            temperature,
            messages: [{ role: "user", content: prompt }],
        }),
    });

    if (!response.ok) {
        throw new Error(`AI provider request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const content =
        data && Array.isArray(data.choices) && data.choices.length > 0
            ? data.choices[0].message.content
            : "";

    return typeof content === "string" ? content.replace(/^```liquid\n?|```$/g, "").trim() : "";
}
