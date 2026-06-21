const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const root = process.cwd();
const schemaPath = path.join(root, ".github/bots/schemas/bot3-seo-refiner-output.schema.json");
const successPath = path.join(root, ".github/bots/examples/bot3-success.json");
const blockedPath = path.join(root, ".github/bots/examples/bot3-blocked.json");
const tagsPath = path.join(root, "_data/seo-tags.json");
const blogDir = path.join(root, "blogs");
const siteBaseUrl = "https://gargnishant.com";

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function parseFrontMatterFields(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const block = match[1];
  const fields = {};

  for (const line of block.split("\n")) {
    const i = line.indexOf(":");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^"|"$/g, "");
    fields[key] = value;
  }

  return fields;
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function keywordTerms(keyword) {
  return normalizeText(keyword)
    .split(" ")
    .filter((term) => term.length >= 3);
}

function containsAllKeywordTerms(text, keyword) {
  const terms = keywordTerms(keyword);
  if (terms.length === 0) return true;
  const haystack = normalizeText(text);
  return terms.every((term) => haystack.includes(term));
}

function firstNWords(text, n) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  return words.slice(0, n).join(" ");
}

function headingsText(markdown) {
  const lines = String(markdown || "").split("\n");
  return lines
    .filter((line) => /^#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^#{1,6}\s+/, "").trim())
    .join(" ");
}

function getBlogMarkdownFiles() {
  if (!fs.existsSync(blogDir)) return [];
  return fs.readdirSync(blogDir)
    .filter((name) => name.endsWith(".md"))
    .map((name) => path.join(blogDir, name));
}

function findDuplicateMatches(payload) {
  const files = getBlogMarkdownFiles();
  const title = (payload?.draft?.title || "").trim().toLowerCase();
  const metaDescription = (payload?.seo?.metaDescription || "").trim().toLowerCase();
  const permalink = payload?.draft?.permalink || "";

  let titleDuplicate = false;
  let metaDescriptionDuplicate = false;
  const matchedFiles = [];
  let slugCollisionDetected = false;

  for (const filePath of files) {
    const content = readFileSafe(filePath);
    const fields = parseFrontMatterFields(content);

    const fileTitle = (fields.title || "").trim().toLowerCase();
    const fileMeta = (fields.metaDescription || "").trim().toLowerCase();
    const filePermalink = (fields.permalink || "").trim();

    let matched = false;

    if (title && fileTitle && title === fileTitle) {
      titleDuplicate = true;
      matched = true;
    }

    if (metaDescription && fileMeta && metaDescription === fileMeta) {
      metaDescriptionDuplicate = true;
      matched = true;
    }

    if (permalink && filePermalink && permalink === filePermalink) {
      slugCollisionDetected = true;
      matched = true;
    }

    if (matched) {
      matchedFiles.push(path.relative(root, filePath));
    }
  }

  return {
    titleDuplicate,
    metaDescriptionDuplicate,
    matchedFiles,
    slugCollisionDetected
  };
}

function validateDeterministicRules(payload, taxonomy) {
  const blockers = [];
  const warnings = [];

  const requiredSeo = [
    ["seoTitle", payload?.seo?.seoTitle],
    ["metaDescription", payload?.seo?.metaDescription],
    ["canonicalUrl", payload?.seo?.canonicalUrl],
    ["primaryKeyword", payload?.seo?.primaryKeyword],
    ["secondaryKeywords", payload?.seo?.secondaryKeywords],
    ["tags", payload?.seo?.tags]
  ];

  for (const [key, value] of requiredSeo) {
    const missing = value === null || value === undefined || (typeof value === "string" && value.trim() === "") || (Array.isArray(value) && value.length === 0);
    if (missing) {
      blockers.push(`missing_required_seo_field:${key}`);
    }
  }

  const canonicalUrl = payload?.seo?.canonicalUrl || "";
  const permalink = payload?.draft?.permalink || "";
  const expectedCanonical = `${siteBaseUrl}${permalink}`;
  if (!canonicalUrl.startsWith(siteBaseUrl) || canonicalUrl !== expectedCanonical) {
    blockers.push("invalid_canonical_url");
  }

  const titleLen = (payload?.seo?.seoTitle || "").length;
  if (titleLen > 65) {
    warnings.push("seo_title_too_long");
  }

  const descLen = (payload?.seo?.metaDescription || "").length;
  if (descLen < 140 || descLen > 170) {
    warnings.push("meta_description_outside_ideal_range");
  }

  const frontMatter = parseFrontMatterFields(payload?.draft?.finalMarkdown || "");
  const image = frontMatter.image || "";
  const ogImage = frontMatter.ogImage || "";
  if (image && ogImage && image !== ogImage) {
    warnings.push("image_ogimage_mismatch");
  }

  const secondaryKeywords = payload?.seo?.secondaryKeywords || [];
  if (secondaryKeywords.length < 2 || secondaryKeywords.length > 4) {
    blockers.push("secondary_keywords_count_out_of_range");
  }

  const tags = payload?.seo?.tags || [];
  for (const tag of tags) {
    if (!taxonomy.includes(tag)) {
      warnings.push(`tag_outside_taxonomy:${tag}`);
    }
  }

  const dup = findDuplicateMatches(payload);
  if (dup.titleDuplicate) {
    warnings.push("title_duplicate_detected");
  }
  if (dup.metaDescriptionDuplicate) {
    warnings.push("meta_description_duplicate_detected");
  }

  if (dup.slugCollisionDetected) {
    warnings.push("slug_collision_auto_suffix");
  }

  const primaryKeyword = payload?.seo?.primaryKeyword || "";
  const title = payload?.draft?.title || "";
  const first100 = firstNWords(payload?.draft?.markdownBody || "", 100);
  const headingText = headingsText(payload?.draft?.markdownBody || "");
  const metaDescription = payload?.seo?.metaDescription || "";

  if (!containsAllKeywordTerms(title, primaryKeyword)) {
    warnings.push("keyword_missing_in_title");
  }
  if (!containsAllKeywordTerms(first100, primaryKeyword)) {
    warnings.push("keyword_missing_in_first_100_words");
  }
  if (!containsAllKeywordTerms(headingText, primaryKeyword)) {
    warnings.push("keyword_missing_in_headings");
  }
  if (!containsAllKeywordTerms(metaDescription, primaryKeyword)) {
    warnings.push("keyword_missing_in_meta_description");
  }

  return {
    blockers,
    warnings,
    duplicateCheck: {
      scope: "blogs/*.md",
      titleDuplicate: dup.titleDuplicate,
      metaDescriptionDuplicate: dup.metaDescriptionDuplicate,
      matchedFiles: dup.matchedFiles
    },
    slugCollisionDetected: dup.slugCollisionDetected
  };
}

function validateSchema(validate, filePath) {
  const data = loadJson(filePath);
  const ok = validate(data);
  return { filePath, data, ok, errors: validate.errors || [] };
}

function assertPayloadConsistency(result, deterministic) {
  const payload = result.data;
  const issues = [];

  if (payload.guards?.duplicateCheck?.scope !== deterministic.duplicateCheck.scope) {
    issues.push("guards.duplicateCheck.scope mismatch");
  }

  const declaredWarnings = new Set([...(payload.guards?.warnings || []), ...(payload.handoff?.warnings || [])]);
  for (const warning of deterministic.warnings) {
    if (!declaredWarnings.has(warning)) {
      issues.push(`missing_warning:${warning}`);
    }
  }

  const declaredBlockers = new Set(payload.handoff?.blockers || []);
  for (const blocker of deterministic.blockers) {
    if (!declaredBlockers.has(blocker)) {
      issues.push(`missing_blocker:${blocker}`);
    }
  }

  return issues;
}

function main() {
  const schema = loadJson(schemaPath);
  const taxonomy = loadJson(tagsPath);

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const results = [
    validateSchema(validate, successPath),
    validateSchema(validate, blockedPath)
  ];

  let hasFailure = false;

  for (const result of results) {
    const rel = path.relative(root, result.filePath);

    if (!result.ok) {
      hasFailure = true;
      console.log(`FAIL: ${rel}`);
      for (const err of result.errors) {
        console.log(`  - ${err.instancePath || "/"}: ${err.message}`);
      }
      continue;
    }

    const deterministic = validateDeterministicRules(result.data, taxonomy);
    const consistencyIssues = assertPayloadConsistency(result, deterministic);

    if (consistencyIssues.length > 0) {
      hasFailure = true;
      console.log(`FAIL: ${rel}`);
      for (const issue of consistencyIssues) {
        console.log(`  - ${issue}`);
      }
      continue;
    }

    console.log(`PASS: ${rel}`);
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main();
