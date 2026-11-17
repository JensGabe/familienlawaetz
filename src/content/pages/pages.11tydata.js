// Defaults for every file under src/content/pages/.
// The URL follows the file's location: pages/arkiv/carl-lawaetz-fortaeller.md → /arkiv/carl-lawaetz-fortaeller/
// A `permalink` or `layout` in a file's front matter overrides these.
import { gitCreated, gitLastModified } from "../../../lib/git-dates.js";

export default {
  layout: "layouts/page.njk",
  permalink: (data) => data.page.filePathStem.replace(/^\/content\/pages/, "") + "/",
  eleventyComputed: {
    date: (data) => data.date || gitCreated(data.page.inputPath) || new Date(),
    modified: (data) => data.modified || gitLastModified(data.page.inputPath) || new Date(),
  },
};
