// Defaults for every file under src/content/posts/.
// Posts live at the site root: posts/legatansoegning.md → /legatansoegning/
// A `permalink` or `layout` in a file's front matter overrides these.
export default {
  layout: "layouts/post.njk",
  permalink: (data) => data.page.filePathStem.replace(/^\/content\/posts/, "") + "/",
};
