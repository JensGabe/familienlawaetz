// Defaults for every file under src/content/pages/.
// The URL follows the file's location: pages/arkiv/carl-lawaetz-fortaeller.md → /arkiv/carl-lawaetz-fortaeller/
// A `permalink` or `layout` in a file's front matter overrides these.
export default {
  layout: "layouts/page.njk",
  permalink: (data) => data.page.filePathStem.replace(/^\/content\/pages/, "") + "/",
};
