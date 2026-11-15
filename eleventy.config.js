import { HtmlBasePlugin } from "@11ty/eleventy";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import markdownItAttrs from "markdown-it-attrs";
import markdownItFootnote from "markdown-it-footnote";
import markdownItImageFigures from "markdown-it-image-figures";
import site from "./src/_data/site.json" with { type: "json" };

const pad = (n) => String(n).padStart(2, "0");
// Dates in front matter are the WordPress local times; 11ty parses them as UTC,
// so formatting in UTC reproduces the original wall-clock values.
const asDate = (d) => (d instanceof Date ? d : new Date(d));

export default function (eleventyConfig) {
  // "production" (FTP deploy), "test" (GitHub Pages) or unset (local). Templates see it too.
  eleventyConfig.addGlobalData("ELEVENTY_ENV", process.env.ELEVENTY_ENV || "");
  if (process.env.ELEVENTY_ENV === "production") {
    eleventyConfig.addPassthroughCopy("src/.htaccess");
  }
    // Imported WordPress HTML is plain HTML: never run it through a template engine.
  eleventyConfig.setTemplateFormats(["njk", "html", "md"]);

  // ---------- links and images ----------
  // Write plain root-relative paths (/wp-content/…, /arkiv/…). HtmlBasePlugin adds the
  // pathPrefix (if one is ever set) to every href/src in the generated HTML.
  eleventyConfig.addPlugin(HtmlBasePlugin);

  // Every <img> in the output (Markdown images included) gets width/height, lazy loading
  // and responsive WebP + original-format versions. An explicit width (e.g. {width=150})
  // is kept as the output width. Generated files go to /img/.
  // SKIP_IMAGES=1 skips this (faster while writing; images are then served unprocessed).
  if (process.env.SKIP_IMAGES !== "1") {
    eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
      formats: ["webp", "auto"],
      widths: [640, 1280],
      failOnError: false,
      htmlOptions: {
        imgAttributes: { loading: "lazy", decoding: "async", sizes: "(max-width: 680px) 100vw, 640px" },
      },
    });
  }

  // Markdown images:  ![alt](/wp-content/uploads/x.jpg "Caption"){.alignleft width=150}
  // - a standalone image becomes <figure>, its title becomes <figcaption>
  // - {…} adds classes/attributes (markdown-it-attrs); classes are copied to the <figure>
  //
  // Bare web addresses and e-mails become links automatically (markdown-it's linkify):
  //   https://example.dk/side   www.example.dk   navn@example.dk
  // Bare domains ("example.dk") are deliberately NOT linked: linkify's fuzzy matching would
  // also turn amounts and abbreviations like "7.000.kr" or "1.th" into links.
  // The one exception is the site's own domain: familien-lawaetz.dk (optionally with a path).
  eleventyConfig.amendLibrary("md", (md) => {
    md.set({ linkify: true });
    md.linkify
      .set({ fuzzyLink: false })
      .add("www.", {
        validate(text, pos, self) {
          self.wwwRe ||= new RegExp("^" + self.re.src_host_port_strict + self.re.src_path, "i");
          const m = text.slice(pos).match(self.wwwRe);
          return m ? m[0].length : 0;
        },
        normalize(match) {
          match.url = "https://" + match.url;
        },
      })
      // linkify needs a non-empty tail after the prefix, so the prefix stops before "dk".
      .add("familien-lawaetz.", {
        validate(text, pos, self) {
          self.siteRe ||= new RegExp("^dk(?![\\w-])(?:" + self.re.src_path + ")?", "i");
          const m = text.slice(pos).match(self.siteRe);
          return m ? m[0].length : 0;
        },
        normalize(match) {
          match.url = "https://" + match.url;
        },
      });
    md.use(markdownItAttrs);
    md.use(markdownItImageFigures, { figcaption: "title", copyAttrs: "class" });
  });

  // ---------- footnotes (markdown-it-footnote) ----------
  // In Markdown: text[^1] … and at the end:  [^1]: Footnote text.   Inline: text^[Footnote text.]
  eleventyConfig.amendLibrary("md", (md) => {
    md.use(markdownItFootnote);
    const r = md.renderer.rules;
    // 11ty passes the page data as markdown-it `env`. Prefix ids with the page's wpId so several
    // posts rendered on one page (front page, archives) never share footnote ids.
    r.footnote_anchor_name = (tokens, idx, options, env) => {
      const n = tokens[idx].meta.id + 1;
      const doc = env?.wpId ?? env?.page?.fileSlug;
      return doc ? `-${doc}-${n}` : String(n);
    };
    r.footnote_caption = (tokens, idx) => {
      const { id, subId } = tokens[idx].meta;
      return String(id + 1) + (subId > 0 ? `:${subId}` : "");
    };
    r.footnote_block_open = () =>
      '<section class="footnotes" role="doc-endnotes" aria-label="Fodnoter">\n<h2 class="footnotes-title">Fodnoter</h2>\n<ol class="footnotes-list">\n';
    r.footnote_anchor = (tokens, idx, options, env, slf) => {
      let id = slf.rules.footnote_anchor_name(tokens, idx, options, env, slf);
      const { subId } = tokens[idx].meta;
      if (subId > 0) id += `:${subId}`;
      const n = tokens[idx].meta.id + 1;
      return ` <a href="#fnref${id}" class="footnote-backref" role="doc-backlink" aria-label="Tilbage til henvisning ${n}">↩︎</a>`;
    };
  });

  eleventyConfig.addPassthroughCopy("src/css");
  // Self-hosted Source Serif 4 (OFL), Latin subset incl. æøå — no requests to Google Fonts
  eleventyConfig.addPassthroughCopy({
    "node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-*.woff2": "fonts",
  });
  eleventyConfig.addPassthroughCopy("src/wp-content");
  eleventyConfig.addPassthroughCopy("src/pics");
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // ---------- collections ----------
  eleventyConfig.addCollection("wpPages", (api) => api.getFilteredByGlob("src/content/pages/**/*.{md,html}"));
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("src/content/posts/*.{md,html}").sort((a, b) => b.date - a.date)
  );

  // ---------- filters ----------
  eleventyConfig.addFilter("wpTime", (d) => {
    d = asDate(d);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  });
  // "15. oktober 2026" (UTC, matching how 11ty parses the WordPress dates)
  const daFormat = new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  eleventyConfig.addFilter("daDate", (d) => {
    if (!(d instanceof Date)) d = new Date(String(d).slice(0, 19) + "Z");
    return daFormat.format(d);
  });

  // ---------- sitemap ----------
  // Pages for sitemap.xml: every HTML page except those with `sitemap: false` in front matter.
  eleventyConfig.addFilter("sitemapItems", (items) =>
    items
      .filter((i) => i.url && i.outputPath?.endsWith(".html") && i.data.sitemap !== false)
      .sort((a, b) => (a.url === "/" ? -1 : b.url === "/" ? 1 : a.url.localeCompare(b.url)))
  );
  // W3C date (YYYY-MM-DD) for <lastmod>; WordPress dates are local times without offset.
  eleventyConfig.addFilter("sitemapDate", (d) => {
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const m = String(d).match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  });
  eleventyConfig.addFilter("head", (arr, n) => arr.slice(0, n));

  // Page tree in the same order as WordPress' wp_page_menu (menu_order, then title).
  let navCache;
  eleventyConfig.addFilter("navTree", (pages) => {
    if (navCache) return navCache;
    const items = pages.map((p) => ({
      id: p.data.wpId,
      parent: p.data.parent || 0,
      order: p.data.menuOrder || 0,
      title: p.data.title,
      navTitle: p.data.navTitle || p.data.title, // short label for the top menu
      url: p.url,
      children: [],
    }));
    const byId = new Map(items.map((i) => [i.id, i]));
    const roots = [];
    for (const i of items) (byId.get(i.parent)?.children ?? roots).push(i);
    const sort = (list) => {
      list.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "da"));
      list.forEach((i) => sort(i.children));
      return list;
    };
    navCache = sort(roots);
    return navCache;
  });
  eleventyConfig.on("eleventy.before", () => (navCache = undefined));

  // Top-level section (from navTree) that contains the page, e.g. "Arkiv" for /arkiv/carl-lawaetz-fortaeller/
  eleventyConfig.addFilter("sectionFor", (tree, url) => tree.find((s) => url.startsWith(s.url)) || null);
  // Breadcrumb trail: the pages above the current one, top-level first
  eleventyConfig.addFilter("ancestorsOf", (tree, url) => {
    const walk = (items, trail) => {
      for (const i of items) {
        if (i.url === url) return trail;
        const found = walk(i.children, [...trail, i]);
        if (found) return found;
      }
      return null;
    };
    return walk(tree, []) || [];
  });

  eleventyConfig.addFilter("commentsFor", (comments, id) => comments.filter((c) => c.post === id));
  eleventyConfig.addFilter("categoriesFor", (cats, ids = []) => cats.filter((c) => ids.includes(c.id)));
  eleventyConfig.addFilter("postsInCategory", (posts, id) => posts.filter((p) => (p.data.categories || []).includes(id)));

  // ---------- feed (same URL as WordPress: /feed/) ----------
  eleventyConfig.addPlugin(feedPlugin, {
    type: "rss",
    outputPath: "/feed/index.xml",
    collection: { name: "posts", limit: 10 },
    metadata: {
      language: "da",
      title: site.title,
      base: site.url + "/",
      author: { name: site.title },
    },
  });

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    htmlTemplateEngine: false,
    markdownTemplateEngine: "njk",
  };
}
