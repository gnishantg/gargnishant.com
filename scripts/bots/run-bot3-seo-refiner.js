const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const BOT2_MARKER = "<!-- bot-2-output -->";
const SITE_BASE_URL = "https://gargnishant.com";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--event") args.eventPath = argv[i + 1];
    if (argv[i] === "--input") args.inputPath = argv[i + 1];
    if (argv[i] === "--output") args.outputPath = argv[i + 1];
    if (argv[i] === "--comment") args.commentPath = argv[i + 1];
  }
  if (!args.outputPath || !args.commentPath || (!args.eventPath && !args.inputPath)) {
    throw new Error("Usage: node scripts/bots/run-bot3-seo-refiner.js (--event <event.json> | --input <bot2.json>) --output <bot3.json> --comment <comment.md>");
  }
  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function extractFirstJsonObject(text) {
  const input = String(text || "").trim();
  if (!input) return null;
  const start = input.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth += 1;
    if (ch === "}") depth -= 1;

    if (depth === 0) {
      return input.slice(start, i + 1);
    }
  }

  return null;
}

function extractJsonBlock(commentBody, marker) {
  const markerIndex = commentBody.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Marker not found: ${marker}`);
  }

  const afterMarker = commentBody.slice(markerIndex + marker.length);
  const candidates = [];

  const jsonFenceRegex = /```json\s*([\s\S]*?)```/i;
  const jsonFenceMatch = afterMarker.match(jsonFenceRegex);
  if (jsonFenceMatch && jsonFenceMatch[1]) candidates.push(jsonFenceMatch[1].trim());

  const plainFenceRegex = /```\s*([\s\S]*?)```/i;
  const plainFenceMatch = afterMarker.match(plainFenceRegex);
  if (plainFenceMatch && plainFenceMatch[1]) candidates.push(plainFenceMatch[1].trim());

  const rawJson = extractFirstJsonObject(afterMarker);
  if (rawJson) candidates.push(rawJson.trim());

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next format
    }
  }

  throw new Error("Could not find valid JSON after marker. Use fenced or raw JSON.");
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugify(input) {
  return String(input || "untitled")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "untitled";
}

function firstNWords(text, n) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ");
}

function headingsText(markdown) {
  return String(markdown || "")
    .split("\n")
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
    .join(" ");
}

function keywordTerms(keyword) {
  return normalizeText(keyword).split(" ").filter((term) => term.length >= 3);
}

function containsAllKeywordTerms(text, keyword) {
  const terms = keywordTerms(keyword);
  if (terms.length === 0) return true;
  const haystack = normalizeText(text);
  return terms.every((term) => haystack.includes(term));
}

function estimateReadTime(wordCount) {
  const mins = Math.max(1, Math.round(wordCount / 180));
  return `${mins} min read`;
}

function countWords(text) {
  return String(text || "").split(/\s+/).filter(Boolean).length;
}

function parseFrontMatterFields(markdown) {
  const match = String(markdown || "").match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const out = {};
  const block = match[1];
  for (const line of block.split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^"|"$/g, "");
    out[k] = v;
  }
  return out;
}

function getExistingBlogFrontMatter(root) {
  const blogDir = path.join(root, "blogs");
  if (!fs.existsSync(blogDir)) return [];

  const files = fs.readdirSync(blogDir).filter((f) => f.endsWith(".md"));
  const rows = [];

  for (const name of files) {
    const abs = path.join(blogDir, name);
    const content = fs.readFileSync(abs, "utf8");
    const fields = parseFrontMatterFields(content);
    rows.push({
      file: path.relative(root, abs),
      title: String(fields.title || "").trim(),
      metaDescription: String(fields.metaDescription || "").trim(),
      permalink: String(fields.permalink || "").trim()
    });
  }

  return rows;
}

function ensureLengthRange(text, min, max, fallbackPrefix) {
  let out = String(text || "").trim();
  if (!out) out = fallbackPrefix;

  if (out.length < min) {
    const pad = " Learn practical steps, examples, and guardrails to improve outcomes consistently.";
    while (out.length < min) out += pad;
    out = out.slice(0, min);
  }

  if (out.length > max) {
    out = out.slice(0, max).trim();
    if (!/[.!?]$/.test(out)) out += ".";
  }

  return out;
}

function buildTags(primaryTopic, category, taxonomy) {
  const topic = normalizeText(primaryTopic);
  const pool = [];

  if (topic.includes("copilot")) pool.push("github-copilot", "prompt-engineering", "developer-productivity");
  if (topic.includes("workflow")) pool.push("workflow-optimization", "automation");
  if (topic.includes("seo")) pool.push("seo", "content-strategy");
  if (topic.includes("eleventy")) pool.push("eleventy", "static-site");

  if (String(category || "").toLowerCase().includes("how")) pool.push("software-engineering");

  pool.push("ai");

  const valid = [];
  for (const tag of pool) {
    if (taxonomy.includes(tag) && !valid.includes(tag)) {
      valid.push(tag);
    }
  }

  for (const tag of taxonomy) {
    if (valid.length >= 6) break;
    if (!valid.includes(tag)) valid.push(tag);
  }

  return valid.slice(0, 8).length >= 5 ? valid.slice(0, 8) : taxonomy.slice(0, 5);
}

function buildKeywordSet(primaryTopic) {
  const normalized = normalizeText(primaryTopic);
  const terms = normalized.split(" ").filter(Boolean);
  const primary = terms.slice(0, 3).join(" ") || "software engineering";

  const candidates = [
    `${primary} guide`,
    `${primary} best practices`,
    `${primary} workflow`,
    `${primary} tips`
  ];

  return {
    primaryKeyword: primary,
    secondaryKeywords: candidates.slice(0, 3)
  };
}

function buildCanonical(permalink) {
  return `${SITE_BASE_URL}${permalink}`;
}

function resolveSlugCollision(baseSlug, existingPermalinks) {
  const base = `/blogs/${baseSlug}/`;
  if (!existingPermalinks.has(base)) {
    return { slug: baseSlug, permalink: base, collisionDetected: false, suffixApplied: null };
  }

  let n = 2;
  while (existingPermalinks.has(`/blogs/${baseSlug}-${n}/`)) {
    n += 1;
  }

  return {
    slug: `${baseSlug}-${n}`,
    permalink: `/blogs/${baseSlug}-${n}/`,
    collisionDetected: true,
    suffixApplied: n
  };
}

function buildFrontMatterBlock(frontMatter) {
  const tagsYaml = (frontMatter.tags || []).map((t) => `  - \"${t}\"`).join("\n");
  const secondaryYaml = (frontMatter.secondaryKeywords || []).map((k) => `  - \"${k}\"`).join("\n");

  return [
    "---",
    `title: \"${frontMatter.title}\"`,
    `date: ${frontMatter.date}`,
    `excerpt: \"${frontMatter.excerpt}\"`,
    `category: \"${frontMatter.category}\"`,
    `layout: \"${frontMatter.layout}\"`,
    `permalink: \"${frontMatter.permalink}\"`,
    `activeNav: \"${frontMatter.activeNav}\"`,
    `image: \"${frontMatter.image}\"`,
    `ogImage: \"${frontMatter.ogImage}\"`,
    `coverAlt: \"${frontMatter.coverAlt}\"`,
    `readTime: \"${frontMatter.readTime}\"`,
    `seoTitle: \"${frontMatter.seoTitle}\"`,
    `metaDescription: \"${frontMatter.metaDescription}\"`,
    `canonicalUrl: \"${frontMatter.canonicalUrl}\"`,
    "tags:",
    tagsYaml,
    `updated: ${frontMatter.updated ? frontMatter.updated : "null"}`,
    `primaryKeyword: \"${frontMatter.primaryKeyword}\"`,
    "secondaryKeywords:",
    secondaryYaml,
    "---"
  ].join("\n");
}

function buildComment(bot3Output) {
  const ready = bot3Output?.handoff?.readyForQaBot === true;
  const headline = ready ? "**Bot 3 Result: READY for QA review**" : "**Bot 3 Result: BLOCKED**";
  const blockers = (bot3Output?.handoff?.blockers || []).length;
  const warnings = (bot3Output?.handoff?.warnings || []).length;
  const canonical = bot3Output?.seo?.canonicalUrl || "N/A";

  return [
    "<!-- bot3-seo-output -->",
    "",
    headline,
    "",
    `- Blockers: ${blockers}`,
    `- Warnings: ${warnings}`,
    `- Canonical: ${canonical}`,
    "",
    "```json",
    JSON.stringify(bot3Output, null, 2),
    "```",
    ""
  ].join("\n");
}

function buildBlocked(event, bot2, blockers, warnings, notes) {
  const sourceIssue = event?.issue?.html_url || "";
  const baseTitle = bot2?.draft?.title || "";
  const baseSlug = bot2?.draft?.slug || "blocked";
  const basePermalink = bot2?.draft?.frontMatter?.permalink || `/blogs/${baseSlug}/`;
  const body = bot2?.draft?.markdownBody || "";
  const blockedFrontMatter = {
    title: baseTitle,
    date: bot2?.draft?.frontMatter?.date || new Date().toISOString().slice(0, 10),
    excerpt: bot2?.draft?.frontMatter?.excerpt || "",
    category: bot2?.draft?.frontMatter?.category || "how-to",
    layout: bot2?.draft?.frontMatter?.layout || "layouts/content-page.njk",
    permalink: basePermalink,
    activeNav: bot2?.draft?.frontMatter?.activeNav || "blogs",
    image: bot2?.draft?.frontMatter?.image || "",
    ogImage: bot2?.draft?.frontMatter?.ogImage || bot2?.draft?.frontMatter?.image || "",
    coverAlt: bot2?.draft?.frontMatter?.coverAlt || `Cover image for ${baseTitle || "blog"}`,
    readTime: bot2?.draft?.frontMatter?.readTime || "2 min read",
    seoTitle: bot2?.draft?.frontMatter?.seoTitle || "",
    metaDescription: bot2?.draft?.frontMatter?.metaDescription || "",
    canonicalUrl: bot2?.draft?.frontMatter?.canonicalUrl || "",
    tags: bot2?.draft?.frontMatter?.tags || ["ai", "automation", "seo", "content-strategy", "workflow-optimization"],
    updated: bot2?.draft?.frontMatter?.updated || null,
    primaryKeyword: "",
    secondaryKeywords: ["", ""]
  };

  return {
    meta: {
      sourceIssue,
      inputMarker: "bot-2-output",
      outputMarker: "bot3-seo-output",
      stage: "bot3_seo_refiner",
      language: "en"
    },
    draft: {
      title: baseTitle,
      slug: baseSlug,
      permalink: basePermalink,
      frontMatter: blockedFrontMatter,
      markdownBody: body,
      finalMarkdown: ""
    },
    seo: {
      seoTitle: bot2?.draft?.frontMatter?.seoTitle || "",
      metaDescription: bot2?.draft?.frontMatter?.metaDescription || "",
      canonicalUrl: bot2?.draft?.frontMatter?.canonicalUrl || "",
      tags: bot2?.draft?.frontMatter?.tags || ["ai", "automation", "seo", "content-strategy", "workflow-optimization"],
      updated: null,
      primaryKeyword: "",
      secondaryKeywords: ["", ""]
    },
    guards: {
      duplicateCheck: {
        scope: "blogs/*.md",
        titleDuplicate: false,
        metaDescriptionDuplicate: false,
        matchedFiles: []
      },
      slugCollisionCheck: {
        basePermalink,
        finalPermalink: basePermalink,
        collisionDetected: false,
        suffixApplied: null
      },
      warnings
    },
    handoff: {
      readyForQaBot: false,
      blockers,
      warnings,
      notesForQaBot: notes
    }
  };
}

async function main() {
  const { eventPath, inputPath, outputPath, commentPath } = parseArgs(process.argv);
  const root = process.cwd();
  const event = eventPath ? loadJson(eventPath) : {};

  let bot2;
  if (inputPath) {
    bot2 = loadJson(inputPath);
  } else {
    const commentBody = event?.comment?.body || "";
    bot2 = extractJsonBlock(commentBody, BOT2_MARKER);
  }

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const bot2SchemaPath = path.join(root, ".github/bots/schemas/bot2-writer-output.schema.json");
  const bot3SchemaPath = path.join(root, ".github/bots/schemas/bot3-seo-refiner-output.schema.json");

  const validateBot2 = ajv.compile(loadJson(bot2SchemaPath));
  const validateBot3 = ajv.compile(loadJson(bot3SchemaPath));

  if (!validateBot2(bot2)) {
    const errors = (validateBot2.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ");
    throw new Error(`Bot 2 payload failed schema validation: ${errors}`);
  }

  const taxonomyPath = path.join(root, "_data/seo-tags.json");
  const taxonomy = loadJson(taxonomyPath);
  const existing = getExistingBlogFrontMatter(root);

  const baseTitle = bot2?.draft?.title || "Untitled";
  const baseSlug = bot2?.draft?.slug || slugify(baseTitle);
  const basePermalink = bot2?.draft?.frontMatter?.permalink || `/blogs/${baseSlug}/`;
  const existingPermalinks = new Set(existing.map((row) => row.permalink).filter(Boolean));

  const collision = resolveSlugCollision(baseSlug, existingPermalinks);
  const finalPermalink = collision.permalink;
  const canonicalUrl = buildCanonical(finalPermalink);

  const topic = bot2?.meta?.primaryTopic || baseTitle;
  const category = bot2?.draft?.frontMatter?.category || bot2?.meta?.contentType || "unknown";
  const tags = buildTags(topic, category, taxonomy);
  const keywordSet = buildKeywordSet(topic);

  const seoTitle = ensureLengthRange(
    `Guide: ${baseTitle}`,
    45,
    65,
    "Practical SEO Guide"
  );

  const metaDescription = ensureLengthRange(
    `Use ${keywordSet.primaryKeyword} techniques to improve output quality, reduce rework, and build a consistent delivery workflow for daily development tasks.`,
    140,
    170,
    "Practical guide to improve workflow quality."
  );

  const markdownBody = bot2?.draft?.markdownBody || "";

  const titleDup = existing.some((row) => normalizeText(row.title) === normalizeText(baseTitle));
  const descDup = existing.some((row) => normalizeText(row.metaDescription) === normalizeText(metaDescription));
  const matchedFiles = existing
    .filter((row) => normalizeText(row.title) === normalizeText(baseTitle) || normalizeText(row.metaDescription) === normalizeText(metaDescription))
    .map((row) => row.file);

  const warnings = [];
  if (seoTitle.length > 65) warnings.push("seo_title_too_long");
  if (metaDescription.length < 140 || metaDescription.length > 170) warnings.push("meta_description_outside_ideal_range");
  if (titleDup) warnings.push("title_duplicate_detected");
  if (descDup) warnings.push("meta_description_duplicate_detected");
  if (collision.collisionDetected) warnings.push("slug_collision_auto_suffix");

  const image = bot2?.draft?.frontMatter?.image || "";
  const ogImage = bot2?.draft?.frontMatter?.ogImage || image;
  if (image && ogImage && image !== ogImage) warnings.push("image_ogimage_mismatch");

  if (!containsAllKeywordTerms(baseTitle, keywordSet.primaryKeyword)) warnings.push("keyword_missing_in_title");
  if (!containsAllKeywordTerms(firstNWords(markdownBody, 100), keywordSet.primaryKeyword)) warnings.push("keyword_missing_in_first_100_words");
  if (!containsAllKeywordTerms(headingsText(markdownBody), keywordSet.primaryKeyword)) warnings.push("keyword_missing_in_headings");
  if (!containsAllKeywordTerms(metaDescription, keywordSet.primaryKeyword)) warnings.push("keyword_missing_in_meta_description");

  const frontMatter = {
    title: baseTitle,
    date: bot2?.draft?.frontMatter?.date || new Date().toISOString().slice(0, 10),
    excerpt: bot2?.draft?.frontMatter?.excerpt || `Practical guide to ${keywordSet.primaryKeyword}`,
    category,
    layout: "layouts/content-page.njk",
    permalink: finalPermalink,
    activeNav: "blogs",
    image,
    ogImage,
    coverAlt: bot2?.draft?.frontMatter?.coverAlt || `Cover image for ${topic}`,
    readTime: bot2?.draft?.frontMatter?.readTime || estimateReadTime(countWords(markdownBody)),
    seoTitle,
    metaDescription,
    canonicalUrl,
    tags,
    updated: new Date().toISOString().slice(0, 10),
    primaryKeyword: keywordSet.primaryKeyword,
    secondaryKeywords: keywordSet.secondaryKeywords
  };

  const finalMarkdown = `${buildFrontMatterBlock(frontMatter)}\n\n${markdownBody}`;

  const missingFields = [];
  for (const [k, v] of Object.entries({
    seoTitle,
    metaDescription,
    canonicalUrl,
    tags,
    primaryKeyword: keywordSet.primaryKeyword,
    secondaryKeywords: keywordSet.secondaryKeywords
  })) {
    const missing = v === null || v === undefined || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
    if (missing) missingFields.push(k);
  }

  const blockers = [];
  for (const f of missingFields) blockers.push(`missing_required_seo_field:${f}`);
  if (canonicalUrl !== `${SITE_BASE_URL}${finalPermalink}` || !canonicalUrl.startsWith(SITE_BASE_URL)) {
    blockers.push("invalid_canonical_url");
  }

  let bot3Output;
  if (blockers.length > 0) {
    bot3Output = buildBlocked(
      event,
      bot2,
      blockers,
      warnings,
      "Blocked due to missing required SEO fields or invalid canonical URL."
    );
  } else {
    bot3Output = {
      meta: {
        sourceIssue: event?.issue?.html_url || "",
        inputMarker: "bot-2-output",
        outputMarker: "bot3-seo-output",
        stage: "bot3_seo_refiner",
        language: "en"
      },
      draft: {
        title: baseTitle,
        slug: collision.slug,
        permalink: finalPermalink,
        frontMatter,
        markdownBody,
        finalMarkdown
      },
      seo: {
        seoTitle,
        metaDescription,
        canonicalUrl,
        tags,
        updated: frontMatter.updated,
        primaryKeyword: keywordSet.primaryKeyword,
        secondaryKeywords: keywordSet.secondaryKeywords
      },
      guards: {
        duplicateCheck: {
          scope: "blogs/*.md",
          titleDuplicate: titleDup,
          metaDescriptionDuplicate: descDup,
          matchedFiles
        },
        slugCollisionCheck: {
          basePermalink,
          finalPermalink,
          collisionDetected: collision.collisionDetected,
          suffixApplied: collision.suffixApplied
        },
        warnings
      },
      handoff: {
        readyForQaBot: true,
        blockers: [],
        warnings,
        notesForQaBot: "SEO fields finalized; body preserved from Bot 2 output."
      }
    };
  }

  if (!validateBot3(bot3Output)) {
    const errors = (validateBot3.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ");
    throw new Error(`Bot 3 payload failed schema validation: ${errors}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(commentPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bot3Output, null, 2));
  fs.writeFileSync(commentPath, buildComment(bot3Output));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
