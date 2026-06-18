# Blog Content Folder

Add one Markdown file per blog post in this folder.

## Blog Post Schema

### Required Fields (Must have for publication)

| Field | Type | Constraints | Example |
|-------|------|-----------|---------|
| `title` | string | 50-60 chars max, max 60 chars | "10 DevOps Patterns for Kubernetes Scale" |
| `date` | date | YYYY-MM-DD format | 2026-06-18 |
| `excerpt` | string | 2-3 sentences, < 200 chars | "Learn essential DevOps patterns..." |
| `category` | string | Any string (flexible) | "DevOps", "AI", "Kubernetes" |
| `seoTitle` | string | 50-60 chars, for search results | "DevOps Patterns for Kubernetes" |
| `metaDescription` | string | 150-160 chars, for Google snippet | "Master 10 DevOps patterns for Kubernetes..." |
| `tags` | array | Comma-separated or YAML list | kubernetes, devops, ci/cd |

### Optional Fields (Enhanced SEO, fallback to defaults)

| Field | Type | Fallback | Example |
|-------|------|---------|---------|
| `ogImage` | string | `/images/og-default.png` | "/images/blog-cover-1.png" |
| `canonicalUrl` | string | Blog permalink | "https://original-site.com/post" |
| `coverAlt` | string | Title (if missing) | "Kubernetes cluster diagram" |
| `readTime` | number | Calculated from content | 5 |
| `updated` | date | Original `date` if omitted | 2026-06-20 |
| `image` | string | `ogImage` if omitted | "/images/featured.png" |

## Front Matter Template

```markdown
---
title: "Your Blog Title Here (50-60 chars)"
date: 2026-06-18
excerpt: "2-3 sentence summary of the post content, optimized for search previews."
category: "DevOps"
seoTitle: "SEO-optimized title for search results (50-60 chars)"
metaDescription: "150-160 character description that appears in Google snippet. Include main keywords naturally."
tags: 
  - devops
  - kubernetes
  - ci-cd
ogImage: "/images/blog-cover-post-title.png"
canonicalUrl: ""
coverAlt: "Descriptive alt text for cover image"
readTime: 5
layout: layouts/content-page.njk
activeNav: blogs
permalink: /blogs/{{ page.fileSlug }}/
---

# Main Heading

Your blog content here...
```

## Quality Gate Checklist (Reviewer Bot)

### 🛑 Critical Blockers (Must Fix)
- [ ] Missing any required field (title, date, excerpt, category, seoTitle, metaDescription, tags)
- [ ] Title exceeds 60 characters
- [ ] Meta description outside 150-160 character range
- [ ] Markdown syntax errors or invalid YAML front matter
- [ ] Broken internal links (404 references to `/blogs/`, `/projects/`, etc.)
- [ ] Referenced images missing from `/images/` or missing alt text
- [ ] Duplicate slug/permalink (conflicts with existing post)

### ⚠️  Warnings (Non-blocking but noted)
- [ ] Title shorter than 50 characters (consider expanding)
- [ ] Weak SEO keywords (primary keyword not in title, excerpt, or first paragraph)
- [ ] Missing optional fields: canonicalUrl, coverAlt, updated
- [ ] Missing cover image (ogImage omitted, will use default)
- [ ] Very long paragraphs (>200 words) or poor formatting
- [ ] No internal cross-links to other blog posts or projects
- [ ] Readability score < grade 8 (consider simplifying language)

### ✅ Acceptance Criteria
- All critical blockers resolved
- Title and meta description meet character limits
- All required front matter present and valid
- Blog post is well-structured with proper headings and spacing
- Cover image (or default fallback) will render correctly
- At least 3 tags for categorization
- Ready for merge and deployment

## Build & Deployment Flow

1. **Bot receives GitHub Issue** with raw AI chat transcript
2. **Ingestion Bot** extracts outline, audience, key points
3. **Writer Bot** expands outline to full markdown with front matter
4. **SEO+Media Bot** adds SEO fields, generates/validates cover image
5. **QA Bot** validates against this checklist
6. **Reviewer Bot** posts PR with critical blockers vs warnings
7. **Human review** and merge decision
8. **Deploy** on merge to main (Eleventy rebuild + GitHub Pages)

## File Naming Convention

Use lowercase, hyphen-separated format with ISO date prefix:

```
2026-06-18-blog-title-slug.md
```

This ensures:
- Chronological sorting in folder
- SEO-friendly slug in filename
- Collision prevention
- Readable at a glance
