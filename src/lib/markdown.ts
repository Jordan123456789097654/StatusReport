// Minimal, XSS-safe Markdown → HTML for incident updates and post-mortems.
// HTML is escaped first; only a fixed set of constructs is converted afterwards.
export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function inline(s: string): string {
  return s
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md || "").split(/\r?\n/);
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let code = false;
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of lines) {
    if (line.startsWith("```")) {
      closeList();
      out.push(code ? "</code></pre>" : "<pre><code>");
      code = !code;
      continue;
    }
    if (code) {
      out.push(line + "\n");
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (h) {
      closeList();
      const level = h[1].length + 2;
      out.push(`<h${level}>${inline(h[2])}</h${level}>`);
    } else if (ul || ol) {
      const want = ul ? "ul" : "ol";
      if (list !== want) {
        closeList();
        out.push(`<${want}>`);
        list = want;
      }
      out.push(`<li>${inline((ul || ol)![1])}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  if (code) out.push("</code></pre>");
  return out.join("");
}

export const POSTMORTEM_TEMPLATE = `## Summary
What happened, in one or two sentences.

## Impact
- Affected services:
- Duration:
- Customers affected:

## Timeline (UTC)
- 00:00 First alert fired
- 00:05 Incident acknowledged
- 00:30 Fix deployed
- 00:45 Resolved

## Root cause
Describe the underlying technical cause.

## Resolution
How the issue was mitigated and fixed.

## Action items
1. Prevent recurrence:
2. Improve detection:
3. Improve response:
`;
