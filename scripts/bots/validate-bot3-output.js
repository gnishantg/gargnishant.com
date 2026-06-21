const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const SITE_BASE_URL = "https://gargnishant.com";
const OUTPUT_MARKER = "<!-- bot3-seo-output -->";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--input") args.inputPath = argv[i + 1];
    if (argv[i] === "--override") args.overridePath = argv[i + 1];
    if (argv[i] === "--override-actor") args.overrideActor = argv[i + 1];
    if (argv[i] === "--output") args.outputPath = argv[i + 1];
    if (argv[i] === "--comment") args.commentPath = argv[i + 1];
  }

  if (!args.inputPath || !args.outputPath || !args.commentPath) {
    throw new Error("Usage: node scripts/bots/validate-bot3-output.js --input <bot3.json> [--override <override.json>] [--override-actor <login>] --output <bot3-validated.json> --comment <comment.md>");
  }

  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function ensureArrayOfStrings(value) {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function getPath(obj, dotPath) {
  return dotPath.split(".").reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

function setPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let cursor = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const k = parts[i];
    if (typeof cursor[k] !== "object" || cursor[k] === null) cursor[k] = {};
    cursor = cursor[k];
  }
  cursor[parts[parts.length - 1]] = value;
}

function stringifyValue(value) {
  if (Array.isArray(value)) return JSON.stringify(value);
  if (value === null || value === undefined) return "";
  return String(value);
}

function applyManualOverrides(bot3, overridePayload, overrideActor, warnings, blockers, fixes) {
  if (!overridePayload || typeof overridePayload !== "object") return [];

  const allowedPaths = [
    "seo.seoTitle",
    "seo.metaDescription",
    "seo.tags",
    "seo.primaryKeyword",
    "seo.secondaryKeywords",
    "seo.canonicalUrl",
    "draft.title"
  ];

  const applied = [];

  const walk = (node, prefix = "") => {
    for (const [key, value] of Object.entries(node)) {
      const current = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === "object" && !Array.isArray(value)) {
        walk(value, current);
        continue;
      }

      if (!allowedPaths.includes(current)) {
        blockers.push(`manual_override_field_not_allowed:${current}`);
        continue;
      }

      const previous = getPath(bot3, current);
      setPath(bot3, current, value);
      applied.push({ field: current, previous: stringifyValue(previous), next: stringifyValue(value) });
      fixes.push(`manual_override_applied:${current}`);
    }
  };

  walk(overridePayload);

  if (applied.length > 0) {
    bot3.meta = bot3.meta || {};
    bot3.meta.manualOverride = {
      applied: true,
      actor: String(overrideActor || "unknown"),
      fields: applied.map((x) => x.field),
      appliedAt: new Date().toISOString()
    };
  } else if (overridePayload && Object.keys(overridePayload).length > 0) {
    warnings.push("manual_override_payload_no_effect");
  }

  return applied;
}

function fixSeoTitle(bot3, warnings, fixes) {
  let seoTitle = String(bot3?.seo?.seoTitle || "").trim();
  if (!seoTitle) return;

  const original = seoTitle;
  seoTitle = seoTitle.replace(/\s+/g, " ").replace(/\.{2,}$/g, "").trim();
  if (seoTitle.endsWith(".")) seoTitle = seoTitle.slice(0, -1).trim();

  if (seoTitle.length > 65) {
    const cut = seoTitle.slice(0, 65);
    const trimmed = cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut;
    seoTitle = trimmed.trim();
    fixes.push("seo_title_truncated_to_limit");
  }

  const incompleteEnding = ["for", "to", "with", "and", "or", "of", "in", "on", "at", "from"];
  const lastWord = seoTitle.split(/\s+/).filter(Boolean).pop()?.toLowerCase() || "";
  if (incompleteEnding.includes(lastWord)) {
    warnings.push("seo_title_may_be_incomplete");
  }

  if (seoTitle.length < 45) warnings.push("seo_title_below_target_range");
  if (seoTitle.length > 65) warnings.push("seo_title_above_target_range");

  if (seoTitle !== original) {
    bot3.seo.seoTitle = seoTitle;
    fixes.push("seo_title_auto_fixed");
  }
}

function fixMetaDescription(bot3, warnings, fixes) {
  let text = String(bot3?.seo?.metaDescription || "").trim();
  if (!text) return;

  const original = text;
  text = text.replace(/\s+/g, " ");
  text = text.replace(/\buse using\b/gi, "Using");
  text = text.replace(/\b(\w+)\s+\1\b/gi, "$1");

  if (!/[.!?]$/.test(text)) text = `${text}.`;

  if (text.length > 170) {
    const cut = text.slice(0, 170);
    const trimmed = cut.includes(" ") ? cut.slice(0, cut.lastIndexOf(" ")) : cut;
    text = `${trimmed.trim()}.`.replace(/\.\./g, ".");
    fixes.push("meta_description_truncated_to_limit");
  }

  if (text.length < 140) warnings.push("meta_description_below_target_range");
  if (text.length > 170) warnings.push("meta_description_above_target_range");

  if (text !== original) {
    bot3.seo.metaDescription = text;
    fixes.push("meta_description_auto_fixed");
  }
}

function validateRequiredFields(bot3, blockers) {
  const required = {
    "seo.seoTitle": getPath(bot3, "seo.seoTitle"),
    "seo.metaDescription": getPath(bot3, "seo.metaDescription"),
    "seo.canonicalUrl": getPath(bot3, "seo.canonicalUrl"),
    "seo.tags": getPath(bot3, "seo.tags"),
    "seo.primaryKeyword": getPath(bot3, "seo.primaryKeyword"),
    "seo.secondaryKeywords": getPath(bot3, "seo.secondaryKeywords"),
    "draft.permalink": getPath(bot3, "draft.permalink")
  };

  for (const [field, value] of Object.entries(required)) {
    const missing = value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
    if (missing) blockers.push(`missing_required_field:${field}`);
  }
}

function validateCanonical(bot3, blockers) {
  const canonical = String(bot3?.seo?.canonicalUrl || "");
  const permalink = String(bot3?.draft?.permalink || "");
  const expected = `${SITE_BASE_URL}${permalink}`;

  if (!canonical.startsWith(SITE_BASE_URL)) blockers.push("invalid_canonical_base");
  if (canonical !== expected) blockers.push("canonical_mismatch_permalink");

  try {
    // eslint-disable-next-line no-new
    new URL(canonical);
  } catch {
    blockers.push("canonical_not_valid_url");
  }
}

function validateKeywordPlacement(bot3, warnings, blockers) {
  const keyword = String(bot3?.seo?.primaryKeyword || "").trim();
  const title = String(bot3?.draft?.title || "");
  const markdownBody = String(bot3?.draft?.markdownBody || "");
  const metaDescription = String(bot3?.seo?.metaDescription || "");

  const inTitle = containsAllKeywordTerms(title, keyword);
  const inBodyTop = containsAllKeywordTerms(firstNWords(markdownBody, 100), keyword);
  const inHeadings = containsAllKeywordTerms(headingsText(markdownBody), keyword);
  const inMeta = containsAllKeywordTerms(metaDescription, keyword);

  if (!inTitle) warnings.push("keyword_missing_in_title");
  if (!inBodyTop) warnings.push("keyword_missing_in_first_100_words");
  if (!inHeadings) warnings.push("keyword_missing_in_headings");
  if (!inMeta) warnings.push("keyword_missing_in_meta_description");

  if (!inTitle && !inBodyTop && !inHeadings && !inMeta) {
    blockers.push("keyword_missing_everywhere");
  }
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

function rebuildFinalMarkdown(bot3) {
  const frontMatter = {
    title: String(bot3?.draft?.title || "").trim(),
    date: String(getPath(bot3, "draft.date") || getPath(bot3, "seo.updated") || new Date().toISOString().slice(0, 10)),
    excerpt: String(getPath(bot3, "draft.excerpt") || ""),
    category: String(getPath(bot3, "draft.category") || "how-to"),
    layout: String(getPath(bot3, "draft.layout") || "layouts/content-page.njk"),
    permalink: String(getPath(bot3, "draft.permalink") || ""),
    activeNav: String(getPath(bot3, "draft.activeNav") || "blogs"),
    image: String(getPath(bot3, "draft.image") || ""),
    ogImage: String(getPath(bot3, "draft.ogImage") || getPath(bot3, "draft.image") || ""),
    coverAlt: String(getPath(bot3, "draft.coverAlt") || ""),
    readTime: String(getPath(bot3, "draft.readTime") || "2 min read"),
    seoTitle: String(getPath(bot3, "seo.seoTitle") || ""),
    metaDescription: String(getPath(bot3, "seo.metaDescription") || ""),
    canonicalUrl: String(getPath(bot3, "seo.canonicalUrl") || ""),
    tags: ensureArrayOfStrings(getPath(bot3, "seo.tags")),
    updated: String(getPath(bot3, "seo.updated") || new Date().toISOString().slice(0, 10)),
    primaryKeyword: String(getPath(bot3, "seo.primaryKeyword") || ""),
    secondaryKeywords: ensureArrayOfStrings(getPath(bot3, "seo.secondaryKeywords"))
  };

  const markdownBody = String(getPath(bot3, "draft.markdownBody") || "");
  bot3.draft.finalMarkdown = `${buildFrontMatterBlock(frontMatter)}\n\n${markdownBody}`;
}

function buildComment(bot3Output, fixesApplied) {
  const ready = bot3Output?.handoff?.readyForQaBot === true;
  const headline = ready ? "**Bot 3 Result: READY for QA review**" : "**Bot 3 Result: BLOCKED (validation failed)**";
  const blockers = (bot3Output?.handoff?.blockers || []).length;
  const warnings = (bot3Output?.handoff?.warnings || []).length;
  const canonical = bot3Output?.seo?.canonicalUrl || "N/A";

  return [
    OUTPUT_MARKER,
    "",
    headline,
    "",
    `- Blockers: ${blockers}`,
    `- Warnings: ${warnings}`,
    `- Auto-fixes applied: ${fixesApplied.length}`,
    `- Canonical: ${canonical}`,
    "",
    "```json",
    JSON.stringify(bot3Output, null, 2),
    "```",
    ""
  ].join("\n");
}

function main() {
  const { inputPath, overridePath, overrideActor, outputPath, commentPath } = parseArgs(process.argv);
  const root = process.cwd();

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const schemaPath = path.join(root, ".github/bots/schemas/bot3-seo-refiner-output.schema.json");
  const validateBot3 = ajv.compile(loadJson(schemaPath));

  const bot3 = loadJson(inputPath);

  if (!validateBot3(bot3)) {
    const errors = (validateBot3.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ");
    throw new Error(`Input Bot 3 payload failed schema validation: ${errors}`);
  }

  const warnings = [...(bot3?.guards?.warnings || []), ...(bot3?.handoff?.warnings || [])];
  const blockers = [];
  const fixes = [];

  if (overridePath && fs.existsSync(overridePath)) {
    const overrides = loadJson(overridePath);
    applyManualOverrides(bot3, overrides, overrideActor, warnings, blockers, fixes);
  }

  bot3.seo = bot3.seo || {};
  bot3.draft = bot3.draft || {};
  bot3.guards = bot3.guards || {};

  if (Array.isArray(bot3.seo.tags)) {
    bot3.seo.tags = unique(ensureArrayOfStrings(bot3.seo.tags));
  }
  if (Array.isArray(bot3.seo.secondaryKeywords)) {
    bot3.seo.secondaryKeywords = unique(ensureArrayOfStrings(bot3.seo.secondaryKeywords));
  }

  fixSeoTitle(bot3, warnings, fixes);
  fixMetaDescription(bot3, warnings, fixes);

  validateRequiredFields(bot3, blockers);
  validateCanonical(bot3, blockers);
  validateKeywordPlacement(bot3, warnings, blockers);

  bot3.guards.warnings = unique(warnings);
  bot3.handoff = bot3.handoff || {};
  bot3.handoff.blockers = unique(blockers);
  bot3.handoff.warnings = unique(warnings);
  bot3.handoff.readyForQaBot = blockers.length === 0;
  bot3.handoff.notesForQaBot = blockers.length === 0
    ? "Validated by Stage 2 validator; READY for QA review."
    : "Blocked by Stage 2 validator; fix blockers or apply valid manual override and re-run validator.";

  bot3.meta = bot3.meta || {};
  bot3.meta.validator = {
    stage: "stage2_validator",
    validatedAt: new Date().toISOString(),
    autoFixes: unique(fixes),
    blockers: unique(blockers),
    warnings: unique(warnings)
  };

  rebuildFinalMarkdown(bot3);

  if (!validateBot3(bot3)) {
    const errors = (validateBot3.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ");
    throw new Error(`Validated Bot 3 payload failed schema validation: ${errors}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(commentPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bot3, null, 2));
  fs.writeFileSync(commentPath, buildComment(bot3, unique(fixes)));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
