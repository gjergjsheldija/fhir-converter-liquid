// One provider call plus the two prompt builders used by the generate loop.
// This module never touches the converter. The decide-whether-it-renders step
// lives in the generate route so tests can stub the provider in isolation.

import {dispatchProviderChat} from "./providerClients.js";

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
export async function callExternalAI({ provider, apiFormat, model, apiKey, baseUrl, temperature, prompt }) {
    return dispatchProviderChat({
        provider,
        apiFormat,
        model,
        apiKey,
        baseUrl,
        temperature,
        prompt
    });
}
