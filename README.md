# Nishant Garg Portfolio

This repository uses a local-first Eleventy build workflow so pages stay easy to maintain, Google Analytics is injected consistently, and blog/project child content can be authored from dedicated root folders.

## Stack

- HTML/CSS/JavaScript
- Eleventy static site generator
- Font Awesome and Google Fonts

## Folder Guide

- `index.html`, `about.html`, `blogs.html`, `projects.html`, `contact.html`, `skills.html`: deploy-ready root HTML for GitHub Pages.
- `src/page-sources/`: editable Eleventy source pages (for example `blogs-listing.njk`, `projects-listing.njk`) that generate root and folder listing pages.
- `blogs/`: root-level blog source files (`*.md`).
- `projects/`: root-level project source markdown (`*.md`) and generated project child pages such as `projects/project-detail-1.html`.
- `src/project-sources/`: editable source templates for detailed project child pages.
- `src/_includes/layouts/`: reusable layouts for generated markdown content pages.
- `_site/`: build output used for local verification before commit.

## Google Analytics Rule

- GA4 ID: `G-P7JTD0D9B1`.
- The Google tag is injected at build time immediately after the opening `<head>` element on every generated HTML page.
- Do not manually paste the GA snippet into individual pages.

## Local Workflow

1. Install dependencies:

	```bash
	npm install
	```

2. Build the site:

	```bash
	npm run build
	```

3. Validate GA placement and duplicate prevention:

	```bash
	npm run validate:ga
	```

4. Run local preview:

	```bash
	npm run dev
	```

## Weekly Blogging Flow

1. Add a markdown file to `blogs/`.
2. Provide front matter fields: `title`, `date`, `excerpt`, `category`, `readTime`, `permalink`.
3. Write content in markdown.
4. For images, use existing asset paths like `images/...`.
5. For videos, use either `<video>` (self-hosted) or iframe embeds.
6. Build and validate before committing.

## Root-Commit Release Flow

1. Work in `feature-ga`.
2. Edit templates in `src/page-sources/` and content in `blogs/` or `projects/`.
3. Run local tests (`npm run build`, `npm run validate:ga`, `npm run dev`).
4. Sync generated root pages with `npm run sync:root`.
5. Commit source and root HTML updates after verification.
6. Open PR and merge to `main` once approved.