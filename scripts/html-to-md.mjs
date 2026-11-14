// Converts the imported WordPress HTML content files to Markdown, in place.
//
//   node scripts/html-to-md.mjs [dir]     (default dir: src/content)
//
// - Every *.html file under dir becomes a *.md file with the same front matter; the .html file is removed.
// - Plain content (paragraphs, emphasis, headings, lists, links, line breaks) becomes Markdown.
// - Elements whose look depends on attributes (figures, galleries, captions, tables, centred
//   paragraphs, sized or aligned images, underline, ...) stay as inline HTML, so the rendered page
//   looks the same.
// - Every root-relative link or source (href, src, Markdown links/images) goes through the 11ty
//   `url` filter: /foo/  ->  {{ '/foo/' | url }}

import fs from "node:fs/promises";
import path from "node:path";
import TurndownService from "turndown";

const dir = path.resolve(process.argv[2] || "src/content");

const td = new TurndownService({
  headingStyle: "atx",
  hr: "---",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "_",
  strongDelimiter: "**",
  br: "\\",
});

// Classes that carry no styling of their own; an element with only these is safe to convert.
const NEUTRAL_CLASSES = new Set(["wp-block-paragraph", "wp-block-heading", "wp-block-list"]);
const ALWAYS_KEEP = new Set(["FIGURE", "FIGCAPTION", "DIV", "TABLE", "U", "SUP", "SUB", "SPAN", "IFRAME", "VIDEO", "AUDIO", "SOURCE", "CENTER", "FONT"]);

function hasStylingAttrs(node) {
  if (node.getAttribute("style") || node.getAttribute("align") || node.getAttribute("id")) return true;
  const cls = (node.getAttribute("class") || "").split(/\s+/).filter(Boolean);
  return cls.some((c) => !NEUTRAL_CLASSES.has(c));
}

const EMPHASIS = new Set(["STRONG", "B", "EM", "I"]);
const ALNUM_END = /[\p{L}\p{N}]$/u;
const ALNUM_START = /^[\p{L}\p{N}]/u;

// Bold/italic that Markdown delimiters can't represent reliably.
function awkwardEmphasis(node) {
  const t = node.textContent;
  if (!t.trim() || /^[\s\p{P}]*$/u.test(t)) return true; // empty or punctuation only
  if (/^\s|\s$/.test(t) || node.querySelector("br")) return true; // edge whitespace / line breaks
  const prev = node.previousSibling, next = node.nextSibling;
  if (prev?.nodeType === 3 && ALNUM_END.test(prev.textContent)) return true; // intraword: foo<b>bar</b>
  if (next?.nodeType === 3 && ALNUM_START.test(next.textContent)) return true; // <b>foo</b>bar
  if (EMPHASIS.has(prev?.nodeName) || EMPHASIS.has(next?.nodeName)) return true; // <b>a</b><b>b</b> -> ****
  return false;
}

function keepAsHtml(node) {
  if (ALWAYS_KEEP.has(node.nodeName)) return true;
  // Images: Markdown can't express width/height/class, so keep any image that has them.
  if (node.nodeName === "IMG") return ["width", "height", "class", "style", "title"].some((a) => node.hasAttribute(a));
  // Links with extra attributes (rel="attachment", target, title, ...) or wrapping images.
  if (node.nodeName === "A") {
    const extra = [...node.attributes].some((a) => a.name !== "href");
    return extra || node.querySelector("img") !== null;
  }
  if (EMPHASIS.has(node.nodeName) && awkwardEmphasis(node)) return true;
  return hasStylingAttrs(node);
}

// Registered with addRule (not keep()) so it takes precedence over Turndown's built-in
// paragraph/heading/image/link rules. Kept HTML must not contain blank lines (that would end
// the HTML block in Markdown) or leading indentation (4+ spaces would become a code block).
td.addRule("keepHtml", {
  filter: (node) => keepAsHtml(node),
  replacement: (content, node) => {
    const html = node.outerHTML.replace(/\n\s*\n/g, "\n").replace(/^[ \t]+/gm, "");
    return node.isBlock ? `\n\n${html}\n\n` : html;
  },
});

// Drop empty paragraphs WordPress leaves behind.
td.addRule("emptyParagraph", {
  filter: (node) => node.nodeName === "P" && !node.textContent.trim() && !node.querySelector("img,iframe,video,br"),
  replacement: () => "",
});

// Turndown discards HTML comments; WordPress editors use them to hide content, so preserve them.
function protectComments(html) {
  const comments = [];
  // A plain-text token survives Turndown (an empty placeholder element would be dropped as blank).
  const out = html.replace(/<!--[\s\S]*?-->/g, (c) => `HTMLCOMMENT${comments.push(c) - 1}END`);
  return {
    out,
    restore: (md) =>
      md
        .replace(/HTMLCOMMENT(\d+)END/g, (_, i) => comments[i])
        // A line ending in --> is passed through raw, so a hard break after it would show as "\".
        .replace(/-->\\\n/g, "-->\n\n"),
  };
}

// ---------- url filter ----------

const wrap = (u) => `{{ '${u.replace(/'/g, "%27")}' | url }}`;
function applyUrlFilter(md) {
  return md
    // HTML attributes: href="/x", src="/x"
    .replace(/\b(href|src|poster)="(\/(?!\/)[^"]*)"/g, (_, a, u) => `${a}="${wrap(u)}"`)
    // Markdown links and images: ](/x) or ](/x "title")
    .replace(/\]\((\/(?!\/)[^)\s]*)((?:\s+"[^"]*")?)\)/g, (_, u, t) => `](${wrap(u)}${t})`);
}

// ---------- run ----------

async function* walk(d) {
  for (const e of await fs.readdir(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith(".html")) yield p;
  }
}

let n = 0;
for await (const file of walk(dir)) {
  const src = await fs.readFile(file, "utf8");
  const m = src.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n)([\s\S]*)$/);
  if (!m) { console.warn("skipped (no front matter):", file); continue; }
  const [, fm, body] = m;
  const { out, restore } = protectComments(body);
  let md = applyUrlFilter(restore(td.turndown(out))).replace(/\n{3,}/g, "\n\n").trim();
  // Protect any literal template syntax in the content from Nunjucks.
  if (/\{%|\{#/.test(body) || /\{\{(?! '\/)/.test(md)) md = `{% raw %}\n${md}\n{% endraw %}`;
  await fs.writeFile(file.replace(/\.html$/, ".md"), fm + "\n" + md + "\n");
  await fs.unlink(file);
  n++;
}
console.log(`Converted ${n} files in ${path.relative(process.cwd(), dir) || "."}`);
