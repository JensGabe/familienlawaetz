// Defaults for every file under src/content/posts/.
// Posts live at the site root: posts/legatansoegning.md → /legatansoegning/
// A `permalink` or `layout` in a file's front matter overrides these.
import { gitCreated, gitLastModified } from "../../../lib/git-dates.js";

export default {
  layout: "layouts/post.njk",
  permalink: (data) => data.page.filePathStem.replace(/^\/content\/posts/, "") + "/",
  eleventyComputed: {
    date: (data) => data.date || gitCreated(data.page.inputPath) || new Date(),
    modified: (data) => data.modified || gitLastModified(data.page.inputPath) || new Date(),
  },
};
