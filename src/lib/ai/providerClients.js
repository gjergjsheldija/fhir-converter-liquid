export function stripMarkdownCodeFence(rawText) {
    if (typeof rawText !== "string") {
        return "";
    }
    const trimmed = rawText.trim();
    const fenced = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\r?\n([\s\S]*?)\r?\n?```$/);
    if (fenced) {
        return fenced[1].trim();
    }
    return trimmed.replace(/^```(?:liquid|json)?\r?\n?|```$/g, "").trim();
}

function inferFormat(provider, apiFormat, baseUrl) {
    if (apiFormat === "anthropic" || apiFormat === "google" || apiFormat === "openai") {
        return apiFormat;
    }
    if (provider === "anthropic" || (typeof baseUrl === "string" && baseUrl.includes("api.anthropic.com"))) {
        return "anthropic";
    }
    if (provider === "google" || (typeof baseUrl === "string" && baseUrl.includes("generativelanguage.googleapis.com") && !baseUrl.includes("/openai"))) {
        return "google";
    }
    return "openai";
}

export async function dispatchProviderChat({
    provider,
    apiFormat,
    model,
    apiKey,
    baseUrl,
    temperature,
    prompt
}) {
    const cleanBase = typeof baseUrl === "string" ? baseUrl.replace(/\/+$/, "") : "";
    if (!cleanBase) {
        throw new Error(`AI provider '${provider}' is not configured.`);
    }

    const format = inferFormat(provider, apiFormat, cleanBase);

    if (format === "anthropic") {
        const response = await fetch(`${cleanBase}/messages`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-api-key": apiKey || "",
                "anthropic-version": "2023-06-01"
            },
            body: JSON.stringify({
                model,
                max_tokens: 8192,
                temperature,
                messages: [{role: "user", content: prompt}]
            })
        });
        if (!response.ok) {
            throw new Error(`AI provider request failed with status ${response.status}.`);
        }
        const data = await response.json();
        const text = data && Array.isArray(data.content)
            ? data.content
                .filter((part) => part && part.type === "text" && typeof part.text === "string")
                .map((part) => part.text)
                .join("\n")
            : "";
        return stripMarkdownCodeFence(text);
    }

    if (format === "google") {
        const targetModel = String(model || "gemini-2.5-flash").replace(/^models\//, "");
        const response = await fetch(
            `${cleanBase}/models/${encodeURIComponent(targetModel)}:generateContent`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey || ""
                },
                body: JSON.stringify({
                    contents: [{role: "user", parts: [{text: prompt}]}],
                    generationConfig: {
                        temperature: temperature != null ? temperature : 0
                    }
                })
            }
        );
        if (!response.ok) {
            throw new Error(`AI provider request failed with status ${response.status}.`);
        }
        const data = await response.json();
        const candidate = data && Array.isArray(data.candidates) ? data.candidates[0] : null;
        const parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
            ? candidate.content.parts
            : [];
        const text = parts
            .filter((p) => p && typeof p.text === "string")
            .map((p) => p.text)
            .join("\n");
        return stripMarkdownCodeFence(text);
    }

    const headers = {
        "Content-Type": "application/json"
    };
    if (apiKey) {
        headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${cleanBase}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            temperature,
            messages: [{role: "user", content: prompt}]
        })
    });

    if (!response.ok) {
        throw new Error(`AI provider request failed with status ${response.status}.`);
    }

    const data = await response.json();
    const content =
        data && Array.isArray(data.choices) && data.choices.length > 0 && data.choices[0].message
            ? data.choices[0].message.content
            : "";

    return stripMarkdownCodeFence(content);
}
