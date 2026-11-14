import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import site from "./src/_data/site.json" with { type: "json" };

const pad = (n) => String(n).padStart(2, "0");
// Dates in front matter are the WordPress local times; 11ty parses them as UTC,
// so formatting in UTC reproduces the original wall-clock values.
const asDate = (d) => (d instanceof Date ? d : new Date(d));

export default function (eleventyConfig) {
  // Imported WordPress HTML is plain HTML: never run it through a template engine.
  eleventyConfig.setTemplateFormats(["njk", "html", "md"]);

  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/wp-content");
  eleventyConfig.addPassthroughCopy("src/pics");
  eleventyConfig.addPassthroughCopy({ "src/static": "/" });

  // ---------- collections ----------
  eleventyConfig.addCollection("wpPages", (api) => api.getFilteredByGlob("src/content/pages/**/*.{md,html}"));
  eleventyConfig.addCollection("posts", (api) =>
    api.getFilteredByGlob("src/content/posts/*.{md,html}").sort((a, b) => b.date - a.date)
  );

  // ---------- filters ----------
  eleventyConfig.addFilter("wpDate", (d) => {
    d = asDate(d);
    return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
  });
  eleventyConfig.addFilter("wpTime", (d) => {
    d = asDate(d);
    return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  });
  eleventyConfig.addFilter("isoDate", (d) => asDate(d).toISOString());
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

  // Ancestor chain helper (used to mark the current menu branch).
  eleventyConfig.addFilter("isAncestorUrl", (url, pageUrl) => url !== "/" && pageUrl.startsWith(url) && url !== pageUrl);

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
      subtitle: site.description,
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
