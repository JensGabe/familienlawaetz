import path from "node:path";
import { HtmlBasePlugin } from "@11ty/eleventy";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import markdownItAttrs from "markdown-it-attrs";
import markdownItFootnote from "markdown-it-footnote";
import markdownItImageFigures from "markdown-it-image-figures";
import { gitCreated, resetGitDates } from "./lib/git-dates.js";
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
  // is kept as the output width. Generated files go to /img/, named after the source path:
  //   src/wp-content/uploads/2013/01/kaaludkloster.jpg → /img/2013-01-kaaludkloster-640.webp
  //   src/pics/foo.jpg                                 → /img/pics-foo-640.webp
  // SKIP_IMAGES=1 skips this (faster while writing; images are then served unprocessed).
  if (process.env.SKIP_IMAGES !== "1") {
    eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
      formats: ["webp", "auto"],
      widths: [640, 1280],
      filenameFormat: (id, src, width, format) => {
        if (/^https?:/.test(src)) return; // remote image: default <hash>-<width> name
        const name = path.relative("src", src)
          .split(path.sep).join("/")
          .replace(/^wp-content\/uploads\//, "")
          .replace(/\.[^./]+$/, "")
          .replaceAll("/", "-");
        return `${name}-${width}.${format}`;
      },
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
    // Every image links to itself (click to see it full size), unless it is already inside a link:
    //   ![alt](/x-768x1024.jpg)              → links to /x-768x1024.jpg
    //   [![alt](/x-768x1024.jpg)](/x.jpg)    → keeps its own link (here: the full-size original)
    //   ![alt](/logo.png){.nolink}           → no link
    // Runs after markdown-it-attrs (so {…} is already on the image) and before image-figures
    // (so a standalone linked image still becomes <figure><a><img></a></figure>).
    md.core.ruler.after("curly_attributes", "image_autolink", (state) => {
      for (const block of state.tokens) {
        if (block.type !== "inline" || !block.children) continue;
        const out = [];
        let inLink = 0;
        for (const t of block.children) {
          if (t.type === "link_open") inLink++;
          if (t.type === "link_close") inLink--;
          if (t.type !== "image" || inLink) { out.push(t); continue; }
          const cls = (t.attrGet("class") || "").split(/\s+/).filter(Boolean);
          if (cls.includes("nolink")) {
            const rest = cls.filter((c) => c !== "nolink").join(" ");
            if (rest) t.attrSet("class", rest);
            else t.attrs = t.attrs.filter(([k]) => k !== "class");
            out.push(t);
            continue;
          }
          const open = new state.Token("link_open", "a", 1);
          open.attrSet("href", t.attrGet("src"));
          out.push(open, t, new state.Token("link_close", "a", -1));
        }
        block.children = out;
      }
    });
    md.use(markdownItImageFigures, { figcaption: "title", copyAttrs: "class" });
  });

  // ---------- footnotes (markdown-it-footnote) ----------
  // In Markdown: text[^1] … and at the end:  [^1]: Footnote text.   Inline: text^[Footnote text.]
  eleventyConfig.amendLibrary("md", (md) => {
    md.use(markdownItFootnote);
    const r = md.renderer.rules;
    // 11ty passes the page data as markdown-it `env`. Prefix ids with the file name so several
    // posts rendered on one page (front page) never share footnote ids.
    r.footnote_anchor_name = (tokens, idx, options, env) => {
      const n = tokens[idx].meta.id + 1;
      const doc = env?.page?.fileSlug;
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
  // `hide: true` in front matter: the page is still built and reachable by its URL, but it is left out
  // of the menu, section navigation, front page, latest posts, RSS feed, sitemap and search.
  // SHOW_HIDDEN=1 (npm run start:all / build:all) ignores `hide`, to preview the site with everything in it.
  const showHidden = process.env.SHOW_HIDDEN === "1";
  eleventyConfig.addGlobalData("showHidden", showHidden);
  const isHidden = (data) => Boolean(data.hide) && !showHidden;
  const visible = (items) => items.filter((p) => !isHidden(p.data));
  eleventyConfig.addCollection("pages", (api) => visible(api.getFilteredByGlob("src/content/pages/**/*.{md,html}")));
  eleventyConfig.addCollection("posts", (api) =>
    visible(api.getFilteredByGlob("src/content/posts/*.{md,html}")).sort((a, b) => b.date - a.date)
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
  // Pages for sitemap.xml: every HTML page except those with `sitemap: false` or `hide: true`.
  eleventyConfig.addFilter("sitemapItems", (items) =>
    items
      .filter((i) => i.url && i.outputPath?.endsWith(".html") && i.data.sitemap !== false && !isHidden(i.data))
      .sort((a, b) => (a.url === "/" ? -1 : b.url === "/" ? 1 : a.url.localeCompare(b.url)))
  );
  // W3C date (YYYY-MM-DD) for <lastmod>; WordPress dates are local times without offset.
  eleventyConfig.addFilter("sitemapDate", (d) => {
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    const m = String(d).match(/^\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  });
  // Git dates (lib/git-dates.js). `date: "git Created"` is the content data files' default when front matter has
  // no `date`; resolved here (eleventyComputed can't set `date`), with the current date for an uncommitted file.
  eleventyConfig.on("eleventy.before", resetGitDates);
  eleventyConfig.addDateParsing(function (date) {
    if (typeof date === "string" && date.toLowerCase() === "git created") {
      return new Date(gitCreated(this.page.inputPath) ?? Date.now());
    }
  });
  eleventyConfig.addFilter("head", (arr, n) => arr.slice(0, n));

  // Page tree from the folder structure: /arkiv/carl-lawaetz-fortaeller/ is a child of /arkiv/.
  // Order within a level: pages with a `navOrder` in front matter first (ascending),
  // then the rest by `date`, newest first. Pages below a hidden page are left out too.
  const parentUrl = (url) => url.replace(/[^/]+\/$/, "");
  let navCache;
  eleventyConfig.addFilter("navTree", (pages) => {
    if (navCache) return navCache;
    const items = pages.map((p) => ({
      order: p.data.navOrder,
      date: p.date,
      title: p.data.title,
      navTitle: p.data.navTitle || p.data.title, // short label for the top menu
      url: p.url,
      children: [],
    }));
    const byUrl = new Map(items.map((i) => [i.url, i]));
    const roots = [];
    for (const i of items) {
      const parent = parentUrl(i.url);
      if (parent === "/") roots.push(i);
      else byUrl.get(parent)?.children.push(i); // no parent in the list: it is hidden
    }
    const hasOrder = (i) => typeof i.order === "number";
    const sort = (list) => {
      list.sort((a, b) =>
        hasOrder(a) && hasOrder(b) ? a.order - b.order
        : hasOrder(a) ? -1
        : hasOrder(b) ? 1
        : b.date - a.date);
      list.forEach((i) => sort(i.children));
      return list;
    };
    navCache = sort(roots);
    return navCache;
  });
  eleventyConfig.on("eleventy.before", () => (navCache = undefined));

  // Top-level section (from navTree) that contains the page, e.g. "Arkiv" for /arkiv/carl-lawaetz-fortaeller/
  eleventyConfig.addFilter("sectionFor", (tree, url) => tree.find((s) => url.startsWith(s.url)) || null);
  // On a post and on the front page (isHome): the posts as a section of their own ("Nyt fra familien", newest
  // first), shaped like a navTree section so it gets the same section menu as pages. Null on anything else.
  eleventyConfig.addFilter("postsSection", (posts, page, isHome) => {
    if (!isHome && !page.inputPath.replaceAll("\\", "/").includes("/content/posts/")) return null;
    const title = "Nyt fra familien";
    return { url: "/", title, navTitle: title, children: posts.map((p) => ({ url: p.url, title: p.data.title, children: [] })) };
  });
  // Breadcrumb trail: the pages above the current one, top-level first.
  // A hidden page isn't in the tree, so its trail is that of the nearest visible page above it.
  eleventyConfig.addFilter("ancestorsOf", (tree, url) => {
    const pathTo = (target, items = tree, trail = []) => {
      for (const i of items) {
        if (i.url === target) return [...trail, i];
        const found = pathTo(target, i.children, [...trail, i]);
        if (found) return found;
      }
      return null;
    };
    const trailTo = (u) => (u === "/" ? [] : pathTo(u) ?? trailTo(parentUrl(u)));
    return pathTo(url)?.slice(0, -1) ?? trailTo(parentUrl(url));
  });

  // ---------- search index (Pagefind) ----------
  // Rebuilt after every build, also with `npm start`, so /soeg/ works in the dev server too.
  // Only the text inside data-pagefind-body (the article in page.njk / post.njk) is indexed.
  eleventyConfig.on("eleventy.after", async ({ directories }) => {
    const pagefind = await import("pagefind");
    const { index } = await pagefind.createIndex();
    const { errors } = await index.addDirectory({ path: directories.output });
    await index.writeFiles({ outputPath: path.join(directories.output, "pagefind") });
    await pagefind.close();
    if (errors.length) console.error("[pagefind]", errors.join("\n"));
  });

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
