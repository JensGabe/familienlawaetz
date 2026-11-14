# Familien Lawaetz – 11ty

Static version of https://familien-lawaetz.dk, migrated from WordPress (Twenty Ten theme) to [Eleventy](https://www.11ty.dev/).

## Commands

```bash
npm install
npm start          # dev server with live reload (no search index)
npm run build      # build to _site/ and generate the Pagefind search index
npm run import     # re-import content from the WordPress REST API and convert it to Markdown
npm run convert    # convert any *.html files under src/content to Markdown
```

Deploy by uploading the contents of `_site/` to any static host.

## Structure

| Path | What |
|---|---|
| `src/content/pages/**.md` | WordPress pages. The folder structure mirrors the URL; `parent` + `menuOrder` in front matter drive the menu (same order as WordPress). |
| `src/content/posts/*.md` | WordPress posts (shown on the front page, newest first). |
| `src/_data/site.json` | Site title, tagline, header image, Facebook group link. |
| `src/_data/wp.json` | Categories, tags and approved comments from WordPress. |
| `src/_includes/` | Layouts (Twenty Ten markup) and partials (menu, sidebar, comments). |
| `src/css/` | Twenty Ten + WordPress block CSS, and `site.css` for local additions (responsive layout, mobile menu). |
| `src/wp-content/uploads/`, `src/pics/` | All media, at the same URLs as on the WordPress site. |
| `scripts/import-wp.mjs` | The importer. **Re-running it overwrites `src/content/` and `src/_data/wp.json`**, so edit content either in WordPress or here, not both. |
| `scripts/html-to-md.mjs` | Converts imported HTML to Markdown. Elements whose look depends on attributes (captioned images, galleries, tables, centred text, sized images, underline, links opening in a new tab) are kept as inline HTML. |

### Content and links

Content files are Markdown, pre-processed by Nunjucks. Internal links and media use the 11ty `url` filter
so the site also works under a path prefix:

```md
[Legatbestyrelsen]({{ '/lawaetzer-legatet/legatbestyrelsen/' | url }})
<img src="{{ '/wp-content/uploads/2013/01/kaaludkloster.jpg' | url }}" width="640" height="382" alt="">
```

The templates in `src/_includes/` do the same (`{{ item.url | url }}` etc.).

### Adding content

- **New page:** add a `.md` file under `src/content/pages/` with front matter
  `layout: layouts/page.njk`, `title`, `wpId` (any unique number), `parent` (the `wpId` of the parent page, or 0), `menuOrder`, `permalink`.
- **New post:** add a file under `src/content/posts/` with `layout: layouts/post.njk`, `title`, `date`, `wpId`, `categories: [1]`, `permalink`.

## What changed compared to WordPress

- All URLs are unchanged (pages, posts, `/category/…/`, `/wp-content/uploads/…`). The RSS feed is at `/feed/index.xml`.
- Search uses [Pagefind](https://pagefind.app/) at `/soeg/` (built by `npm run build`).
- Comments are shown read-only; new comments are closed.
- The Facebook widget is a plain link (no Facebook SDK/tracking). Jetpack, CampTix, Wordfence and WPtouch are gone; the layout is now responsive instead.
- Drafts, private pages, unapproved comments and CampTix attendee records were not migrated.
