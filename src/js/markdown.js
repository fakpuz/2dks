function escapeHtml(value) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function renderInline(text, options = {}) {
    let html = escapeHtml(text);

    html = html.replace(/!\[\[([^\]]+)\]\]/g, (_, target) => {
        if (!options.resolveEmbed) {
            return `<span class="md-embed-missing">${target}</span>`;
        }
        return options.resolveEmbed(target);
    });
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    html = html.replace(/_([^_]+)_/g, "<em>$1</em>");
    html = html.replace(/~~([^~]+)~~/g, "<s>$1</s>");
    html = html.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
    html = html.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '<span class="md-wikilink" data-target="$1">$2</span>');
    html = html.replace(/\[\[([^\]]+)\]\]/g, '<span class="md-wikilink" data-target="$1">$1</span>');

    return html;
}

function flushList(listType, items, html) {
    if (items.length === 0) return;
    html.push(`<${listType}>${items.join("")}</${listType}>`);
    items.length = 0;
}

export function renderMarkdown(markdown = "", options = {}) {
    const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
    const html = [];
    const unorderedItems = [];
    const orderedItems = [];
    let inCodeBlock = false;
    let codeLines = [];

    const flushCodeBlock = () => {
        if (!inCodeBlock) return;
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        inCodeBlock = false;
        codeLines = [];
    };

    for (const line of lines) {
        if (line.startsWith("```")) {
            if (inCodeBlock) flushCodeBlock();
            else {
                flushList("ul", unorderedItems, html);
                flushList("ol", orderedItems, html);
                inCodeBlock = true;
                codeLines = [];
            }
            continue;
        }

        if (inCodeBlock) {
            codeLines.push(line);
            continue;
        }

        if (!line.trim()) {
            flushList("ul", unorderedItems, html);
            flushList("ol", orderedItems, html);
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            flushList("ul", unorderedItems, html);
            flushList("ol", orderedItems, html);
            const level = headingMatch[1].length;
            html.push(`<h${level}>${renderInline(headingMatch[2], options)}</h${level}>`);
            continue;
        }

        const hrMatch = line.match(/^---+$/);
        if (hrMatch) {
            flushList("ul", unorderedItems, html);
            flushList("ol", orderedItems, html);
            html.push("<hr>");
            continue;
        }

        const blockquoteMatch = line.match(/^>\s?(.*)$/);
        if (blockquoteMatch) {
            flushList("ul", unorderedItems, html);
            flushList("ol", orderedItems, html);
            html.push(`<blockquote><p>${renderInline(blockquoteMatch[1], options)}</p></blockquote>`);
            continue;
        }

        const taskMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
            flushList("ol", orderedItems, html);
            unorderedItems.push(
                `<li class="task-item"><input type="checkbox" disabled ${taskMatch[1].toLowerCase() === "x" ? "checked" : ""}><span>${renderInline(taskMatch[2], options)}</span></li>`
            );
            continue;
        }

        const unorderedMatch = line.match(/^\s*[-*]\s+(.*)$/);
        if (unorderedMatch) {
            flushList("ol", orderedItems, html);
            unorderedItems.push(`<li>${renderInline(unorderedMatch[1], options)}</li>`);
            continue;
        }

        const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
        if (orderedMatch) {
            flushList("ul", unorderedItems, html);
            orderedItems.push(`<li>${renderInline(orderedMatch[1], options)}</li>`);
            continue;
        }

        flushList("ul", unorderedItems, html);
        flushList("ol", orderedItems, html);
        html.push(`<p>${renderInline(line, options)}</p>`);
    }

    flushCodeBlock();
    flushList("ul", unorderedItems, html);
    flushList("ol", orderedItems, html);

    return html.join("");
}
