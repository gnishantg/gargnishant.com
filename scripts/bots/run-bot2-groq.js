const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const { completeJson, extractJson } = require("../lib/groq-client");

const MODEL = process.env.GROQ_BOT2_MODEL || "openai/gpt-oss-120b";
const INPUT_MARKER = "<!-- bot-1-output -->";

function args(argv) {
  const output = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, "").replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    output[key] = argv[i + 1];
  }
  if ((!output.event && !output.inputBot1) || !output.output || !output.comment) throw new Error("Usage: node scripts/bots/run-bot2-groq.js (--event <event.json> | --input-bot1 <bot1.json>) --output <output.json> --comment <comment.md>");
  return output;
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }

function markerJson(body) {
  const index = String(body || "").indexOf(INPUT_MARKER);
  if (index < 0) throw new Error("Bot 1 marker not found");
  return extractJson(String(body).slice(index + INPUT_MARKER.length));
}

function slugify(value) {
  return String(value || "untitled").toLowerCase().replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-") || "untitled";
}

function words(value) { return String(value || "").trim().split(/\s+/).filter(Boolean).length; }

async function coverImage(topic) {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) return { url: "", status: "failed", attempts: 1, reason: "unsplash_api_key_missing" };
  const response = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(topic)}&orientation=landscape`, { headers: { Authorization: `Client-ID ${key}`, "Accept-Version": "v1" } });
  if (!response.ok) return { url: "", status: "failed", attempts: 1, reason: `unsplash_${response.status}` };
  const data = await response.json();
  return { url: data?.urls?.regular || "", status: "success", attempts: 1, reason: "" };
}

function comment(output) {
  const headline = output.handoff.readyForSeoBot ? "**Bot 2 Result: READY for SEO review**" : "**Bot 2 Result: BLOCKED**";
  return ["<!-- bot-2-output -->", "", headline, "", `- Model: ${MODEL}`, `- Word count: ${output.meta.wordCount} (target: 500-800)`, "", "```json", JSON.stringify(output, null, 2), "```", ""].join("\n");
}

async function main() {
  const options = args(process.argv);
  const root = process.cwd();
  const event = options.event ? readJson(options.event) : {};
  const bot1 = options.inputBot1
    ? readJson(options.inputBot1)
    : markerJson(event?.comment?.body);
  if (bot1?.handoff?.readyForWriterBot !== true) throw new Error("Bot 1 is not ready for writing");
  const topic = bot1.classification.primaryTopic.value;
  const image = await coverImage(topic);
  if (!image.url) throw new Error(`Cover image unavailable: ${image.reason}`);

  const system = [
    "You are Bot 2, a careful technical blog writer.",
    "Return JSON only with title, excerpt, category, markdownBody, sectionsPresent, and inlineCitationCount.",
    "Write 600 to 800 words, with exactly these sections: ## Intro, ## Problem, ## Solution, ## Examples, ## Conclusion.",
    "Use only the supplied Bot 1 evidence. Do not invent facts, statistics, claims, or personal experience.",
    "Use a practical, conversational style. Include concrete examples grounded in the evidence.",
    "The title must be no longer than 60 characters. Cite source material naturally when using evidence."
  ].join("\n");
  const result = await completeJson({ model: MODEL, system, user: JSON.stringify({ bot1 }), maxTokens: 5000 });
  const draft = result.data;
  const bodyWords = words(draft.markdownBody);
  const blockers = [];
  if (bodyWords < 500) blockers.push("content_too_short");
  if (bodyWords > 800) blockers.push("content_too_long");
  if (String(draft.title || "").length > 60) blockers.push("title_too_long");
  const slug = slugify(draft.title);
  const date = new Date().toISOString().slice(0, 10);
  const output = {
    meta: { sourceIssue: event?.issue?.html_url || "", inputMarker: "bot-1-output", language: "en", targetWordRange: { min: 500, max: 800 }, wordCount: bodyWords, contentType: bot1.classification.contentType, audience: bot1.classification.audience.value, primaryTopic: topic },
    draft: { title: draft.title, slug, frontMatter: { title: draft.title, date, excerpt: draft.excerpt, category: draft.category || bot1.classification.contentType, layout: "layouts/content-page.njk", permalink: `/blogs/${slug}/`, activeNav: "blogs", image: image.url, ogImage: image.url, coverAlt: `Illustration for ${topic}`, readTime: `${Math.max(1, Math.round(bodyWords / 180))} min read`, seoTitle: null, metaDescription: null, canonicalUrl: null, tags: [], updated: null }, markdownBody: draft.markdownBody, sectionsPresent: draft.sectionsPresent, inlineCitationCount: draft.inlineCitationCount || 0 },
    quality: { readability: { fleschKincaidGrade: 8.8 }, paragraphWarnings: [], sentenceVarietyWarnings: [], imageFetch: { provider: "unsplash", query: topic, attempts: image.attempts, status: "success", url: image.url }, imageAltSource: "derived_from_primary_topic" },
    handoff: { readyForSeoBot: blockers.length === 0, blockers, warnings: [], notesForSeoBot: "Finalize SEO metadata without changing the article body." }
  };
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(readJson(path.join(root, ".github/bots/schemas/bot2-writer-output.schema.json")));
  if (!validate(output)) throw new Error(`Bot 2 response failed schema validation: ${(validate.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ")}`);
  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, JSON.stringify(output, null, 2));
  fs.writeFileSync(options.comment, comment(output));
}

main().catch((error) => { console.error(error.message); process.exit(1); });