# Web UI Summary

Open `http://localhost:2019` for the browser editor. The annotated screenshots below match the current workspace.

![Editor with files, message, template, FHIR result, and the debug drawer](images/full-ui.png)

| Area | What it does |
| --- | --- |
| Files | Samples, this customer's templates, and partials. Partials start collapsed. Menu opens customer, settings, and docs commands |
| Message | A short strip. Show full message expands it. Paste one, or use New sample, Import, and Save sample |
| Template | Liquid editor with coloring and folding. The header icons are New template, Format, Generate, and Save template. Save turns clay when the template has unsaved edits. Includes lists the partials grouped by folder |
| FHIR result | Live bundle. Send posts it to a FHIR server configured in Settings. Validate posts it to `{base}/$validate`. Copy puts it on the clipboard |
| Debug | Bottom drawer: parsed HL7 or parsed CDA, a variable console, diagnostics, expected diff, and validation. Hover a path or a field to see the value |
| New project / Open project | Start or load a local project, or open a GitHub repo read-only |
| Settings | Light, dark, or system theme, timezone, and AI template generation |
| API docs | Swagger UI, also at `/api-docs` |

![Includes grouped by folder](images/includes.png)

![New project](images/new-project.png)

![Settings and AI providers](images/settings.png)

![Dark theme](images/dark-ui.png)

## Usage

1. Select or paste an HL7 v2 message.
2. Open a template. The FHIR bundle updates while you edit when convert-while-typing is on.
3. Use Includes to jump into a partial, or type a missing name to start one.
4. Open Debug to inspect the parsed message, variables, and unused fields.
5. Save writes the template to the built-in runtime tree, or into the open local project. A GitHub project stays read-only.

Generate uses the provider and API key stored in Settings. Keys stay in the browser. Supported providers are OpenAI, Anthropic, Google Gemini, xAI (Grok), Mistral, DeepSeek, Groq, OpenRouter, a local OpenAI-compatible server, and a custom base URL.

C-CDA projects convert. Choose C-CDA in **New project**, including the Microsoft baseline. The message is colored as XML, and the debug drawer shows **Parsed CDA**. Details and screenshots are in [Features](features.md).
