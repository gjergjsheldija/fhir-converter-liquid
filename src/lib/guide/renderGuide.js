import {readFile} from "fs/promises";
import {basename, dirname, join, normalize, relative} from "path";
import {fileURLToPath} from "url";

const docsRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../docs");
const featuresRoot = join(docsRoot, "features");
const imagesRoot = join(docsRoot, "images");

export function guideDocsRoot() {
    return docsRoot;
}

export function guideImagesRoot() {
    return imagesRoot;
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function guideHref(url, sourceFile) {
    if (/^(https?:|mailto:|#)/.test(url)) {
        return url;
    }
    const target = normalize(join(dirname(sourceFile), url));
    const imageName = basename(target);
    if (target.startsWith(imagesRoot + "/") && /^[\w.-]+$/.test(imageName)) {
        return "/guide/images/" + imageName;
    }
    if (target === join(docsRoot, "features.md")) {
        return "/guide";
    }
    if (target.startsWith(featuresRoot + "/") && target.endsWith(".md")) {
        const page = basename(target, ".md");
        if (/^[a-z0-9-]+$/.test(page)) {
            return "/guide/" + page;
        }
    }
    const repoPath = relative(join(docsRoot, ".."), target).split("\\").join("/");
    return "https://github.com/gjergjsheldija/fhir-converter-liquid/blob/main/" + repoPath;
}

function renderInline(text, sourceFile) {
    let html = escapeHtml(text);
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
        const href = guideHref(url, sourceFile);
        return '<img alt="' + escapeHtml(alt) + '" src="' + escapeHtml(href) + '">';
    });
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, url) => {
        const href = guideHref(url, sourceFile);
        return '<a href="' + escapeHtml(href) + '">' + label + "</a>";
    });
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    return html;
}

function renderTable(block, sourceFile) {
    const rows = block.split("\n").filter((line) => line.trim().startsWith("|"));
    if (rows.length < 2) {
        return "<p>" + renderInline(block, sourceFile) + "</p>";
    }
    const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
    const header = cells(rows[0]);
    const body = rows.slice(2).map(cells);
    const head = "<tr>" + header.map((cell) => "<th>" + renderInline(cell, sourceFile) + "</th>").join("") + "</tr>";
    const bodyHtml = body.map((row) => "<tr>" + row.map((cell) => "<td>" + renderInline(cell, sourceFile) + "</td>").join("") + "</tr>").join("");
    return "<table><thead>" + head + "</thead><tbody>" + bodyHtml + "</tbody></table>";
}

function renderBlock(block, sourceFile) {
    if (block.startsWith("|")) {
        return renderTable(block, sourceFile);
    }
    const heading = /^(#{1,3}) (.+)$/.exec(block);
    if (heading) {
        const level = heading[1].length;
        return "<h" + level + ">" + renderInline(heading[2], sourceFile) + "</h" + level + ">";
    }
    const lines = block.split("\n");
    if (lines.every((line) => line.startsWith("- "))) {
        return "<ul>" + lines.map((line) => "<li>" + renderInline(line.slice(2), sourceFile) + "</li>").join("") + "</ul>";
    }
    return "<p>" + lines.map((line) => renderInline(line, sourceFile)).join("<br>") + "</p>";
}

export function renderMarkdown(markdown, sourceFile) {
    const parts = String(markdown).replace(/\r\n/g, "\n").split(/```/);
    let html = "";
    parts.forEach((part, index) => {
        if (index % 2 === 1) {
            const code = part.replace(/^[^\n]*\n/, "");
            html += "<pre><code>" + escapeHtml(code.replace(/\n$/, "")) + "</code></pre>";
            return;
        }
        part.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean).forEach((block) => {
            html += renderBlock(block, sourceFile);
        });
    });
    return html;
}

const THEME_INIT_SCRIPT = "<script>(function(){var c=null,p='paper';try{var r=localStorage.getItem('fhirConverterSettings');var s=r?JSON.parse(r):null;if(s&&typeof s==='object'){if(s.theme==='light'||s.theme==='dark'||s.theme==='system'){c=s.theme;}else if(s.darkMode===true){c='dark';}else{c='light';}if(s.palette==='paper'||s.palette==='slate'||s.palette==='grove'){p=s.palette;}}}catch(e){return;}if(c===null){c='system';}if(c==='system'){c=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=c;document.documentElement.dataset.palette=p;})();</script>";

function pageShell(title, body) {
    return "<!DOCTYPE html><html lang=\"en\" data-theme=\"light\" data-palette=\"paper\">" +
        THEME_INIT_SCRIPT +
        "<head><meta charset=\"utf-8\">" +
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
        "<title>" + escapeHtml(title) + " · FHIR Converter</title>" +
        "<link rel=\"stylesheet\" href=\"/css/guide.css\">" +
        "</head><body><header class=\"guide-bar\">" +
        "<a href=\"/\">Editor</a><a href=\"/guide\">User guide</a>" +
        "</header><main>" + body + "</main></body></html>";
}

export async function renderGuideHtml(page) {
    const sourceFile = page ? join(featuresRoot, page + ".md") : join(docsRoot, "features.md");
    const markdown = await readFile(sourceFile, "utf8");
    const titleMatch = /^# (.+)$/m.exec(markdown);
    const title = titleMatch ? titleMatch[1] : "User guide";
    return pageShell(title, renderMarkdown(markdown, sourceFile));
}
