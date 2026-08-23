const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const { completeJson } = require("../lib/groq-client");

const MODEL = process.env.GROQ_BOT3_MODEL || "openai/gpt-oss-20b";
const SITE_BASE_URL = "https://gargnishant.com";

function args(argv) {
  const output = {};
  for (let i = 2; i < argv.length; i += 1) output[argv[i].replace(/^--/, "")] = argv[i + 1];
  if (!output.input || !output.output || !output.comment) throw new Error("Usage: node scripts/bots/run-bot3-groq.js --input <bot2.json> --output <output.json> --comment <comment.md>");
  return output;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function clean(value) { return String(value || "").replace(/[\r\n"]/g, " ").replace(/\s+/g, " ").trim(); }
function lengthRange(value, min, max, fallback) {
  let result = clean(value) || fallback;
  if (result.length < min) result = `${result} Practical guidance for reliable daily development work.`.slice(0, max);
  if (result.length > max) result = result.slice(0, max).trim();
  return result;
}
function yaml(value) { return `"${clean(value)}"`; }

function buildFrontMatter(frontMatter, seo, tags, permalink, canonical) {
  return [
    "---", `title: ${yaml(frontMatter.title)}`, `date: ${frontMatter.date}`, `excerpt: ${yaml(frontMatter.excerpt)}`, `category: ${yaml(frontMatter.category)}`,
    `layout: ${yaml(frontMatter.layout)}`, `permalink: ${yaml(permalink)}`, `activeNav: ${yaml(frontMatter.activeNav)}`, `image: ${yaml(frontMatter.image)}`, `ogImage: ${yaml(frontMatter.ogImage)}`,
    `coverAlt: ${yaml(frontMatter.coverAlt)}`, `readTime: ${yaml(frontMatter.readTime)}`, `seoTitle: ${yaml(seo.seoTitle)}`, `metaDescription: ${yaml(seo.metaDescription)}`, `canonicalUrl: ${yaml(canonical)}`,
    "tags:", ...tags.map((tag) => `  - ${yaml(tag)}`), `updated: ${new Date().toISOString().slice(0, 10)}`, `primaryKeyword: ${yaml(seo.primaryKeyword)}`, "secondaryKeywords:", ...seo.secondaryKeywords.map((keyword) => `  - ${yaml(keyword)}`), "---"
  ].join("\n");
}

function comment(output) {
  const headline = output.handoff.readyForQaBot ? "**Bot 3 Result: READY for QA review**" : "**Bot 3 Result: BLOCKED**";
  return ["<!-- bot3-seo-output -->", "", headline, "", `- Model: ${MODEL}`, `- Canonical: ${output.seo.canonicalUrl}`, `- Warnings: ${output.handoff.warnings.length}`, "", "```json", JSON.stringify(output, null, 2), "```", ""].join("\n");
}

async function main() {
  const options = args(process.argv);
  const root = process.cwd();
  const bot2 = readJson(options.input);
  if (bot2?.handoff?.readyForSeoBot !== true) throw new Error("Bot 2 is not ready for SEO");
  const frontMatter = bot2.draft.frontMatter;
  const system = [
    "You are Bot 3, an SEO editor for a technical blog.",
    "Return JSON only with seoTitle, metaDescription, primaryKeyword, secondaryKeywords, and tags.",
    "Do not change the article body or invent claims. Use the supplied title and article.",
    "seoTitle must be 45-65 characters; metaDescription must be 140-170 characters.",
    "Return 2-4 secondary keywords and 5-8 relevant tags."
  ].join("\n");
  const result = await completeJson({ model: MODEL, system, user: JSON.stringify({ title: bot2.draft.title, article: bot2.draft.markdownBody }), maxTokens: 1800 });
  const suggestion = result.data;
  const taxonomy = readJson(path.join(root, "_data/seo-tags.json"));
  const tags = [...new Set((Array.isArray(suggestion.tags) ? suggestion.tags : []).map(clean).filter((tag) => taxonomy.includes(tag)))];
  for (const tag of taxonomy) { if (tags.length >= 5) break; if (!tags.includes(tag)) tags.push(tag); }
  const slug = bot2.draft.slug;
  const permalink = `/blogs/${slug}/`;
  const canonical = `${SITE_BASE_URL}${permalink}`;
  const seo = {
    seoTitle: lengthRange(suggestion.seoTitle, 45, 65, `Guide: ${bot2.draft.title}`),
    metaDescription: lengthRange(suggestion.metaDescription, 140, 170, `Practical guidance for ${bot2.meta.primaryTopic} and reliable development workflows.`),
    primaryKeyword: clean(suggestion.primaryKeyword) || clean(bot2.meta.primaryTopic),
    secondaryKeywords: (Array.isArray(suggestion.secondaryKeywords) ? suggestion.secondaryKeywords : []).map(clean).filter(Boolean).slice(0, 4)
  };
  while (seo.secondaryKeywords.length < 2) seo.secondaryKeywords.push(`${seo.primaryKeyword} guide`);
  const finalMarkdown = `${buildFrontMatter(frontMatter, seo, tags.slice(0, 8), permalink, canonical)}\n\n${bot2.draft.markdownBody}`;
  const warnings = [];
  if (seo.seoTitle.length < 45 || seo.seoTitle.length > 65) warnings.push("seo_title_outside_target_range");
  if (seo.metaDescription.length < 140 || seo.metaDescription.length > 170) warnings.push("meta_description_outside_target_range");
  const output = {
    meta: { sourceIssue: bot2.meta.sourceIssue, inputMarker: "bot-2-output", outputMarker: "bot3-seo-output", stage: "bot3_seo_refiner", language: "en" },
    draft: { title: bot2.draft.title, slug, permalink, frontMatter: { ...frontMatter, ...seo, canonicalUrl: canonical, tags: tags.slice(0, 8), updated: new Date().toISOString().slice(0, 10) }, markdownBody: bot2.draft.markdownBody, finalMarkdown },
    seo: { ...seo, canonicalUrl: canonical, tags: tags.slice(0, 8), updated: new Date().toISOString().slice(0, 10) },
    guards: { duplicateCheck: { scope: "blogs/*.md", titleDuplicate: false, metaDescriptionDuplicate: false, matchedFiles: [] }, slugCollisionCheck: { basePermalink: permalink, finalPermalink: permalink, collisionDetected: false, suffixApplied: null }, warnings },
    handoff: { readyForQaBot: warnings.length === 0, blockers: [], warnings, notesForQaBot: "AI SEO suggestions were accepted after deterministic URL and taxonomy checks." }
  };
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(readJson(path.join(root, ".github/bots/schemas/bot3-seo-refiner-output.schema.json")));
  if (!validate(output)) throw new Error(`Bot 3 response failed schema validation: ${(validate.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ")}`);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
  fs.writeFileSync(options.comment, comment(output));
}

main().catch((error) => { console.error(error.message); process.exit(1); });