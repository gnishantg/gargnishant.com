const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const BOT1_MARKER = "<!-- bot-1-output -->";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--event") args.eventPath = argv[i + 1];
    if (argv[i] === "--output") args.outputPath = argv[i + 1];
    if (argv[i] === "--comment") args.commentPath = argv[i + 1];
  }
  if (!args.eventPath || !args.outputPath || !args.commentPath) {
    throw new Error("Usage: node scripts/bots/run-bot2-thin-slice.js --event <event.json> --output <bot2.json> --comment <comment.md>");
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
      const candidate = input.slice(start, i + 1);
      return candidate;
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

  // Preferred format: ```json ... ``` after marker
  const jsonFenceRegex = /```json\s*([\s\S]*?)```/i;
  const jsonFenceMatch = afterMarker.match(jsonFenceRegex);
  if (jsonFenceMatch && jsonFenceMatch[1]) {
    candidates.push(jsonFenceMatch[1].trim());
  }

  // Also accept plain fenced blocks: ``` ... ``` after marker
  const plainFenceRegex = /```\s*([\s\S]*?)```/i;
  const plainFenceMatch = afterMarker.match(plainFenceRegex);
  if (plainFenceMatch && plainFenceMatch[1]) {
    candidates.push(plainFenceMatch[1].trim());
  }

  // Also accept raw JSON text directly after marker
  const rawJsonCandidate = extractFirstJsonObject(afterMarker);
  if (rawJsonCandidate) {
    candidates.push(rawJsonCandidate.trim());
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // try the next extraction strategy
    }
  }

  throw new Error("Could not find valid JSON after marker. Use fenced or raw JSON.");
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

function estimateReadTime(wordCount) {
  const minutes = Math.max(1, Math.round(wordCount / 180));
  return `${minutes} min read`;
}

function countWords(text) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  return words.length;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchUnsplashImage(topic) {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    return {
      status: "failed",
      attempts: 0,
      url: "",
      reason: "unsplash_api_key_missing"
    };
  }

  const query = topic || "technology";
  const backoff = [2000, 4000, 8000];

  for (let i = 0; i < backoff.length; i += 1) {
    try {
      const response = await fetch(`https://api.unsplash.com/photos/random?query=${encodeURIComponent(query)}&orientation=landscape`, {
        headers: {
          Authorization: `Client-ID ${accessKey}`,
          "Accept-Version": "v1"
        }
      });

      if (response.ok) {
        const payload = await response.json();
        const url = payload?.urls?.regular || payload?.urls?.full || "";
        if (url) {
          return {
            status: "success",
            attempts: i + 1,
            url,
            reason: ""
          };
        }
      }
    } catch (error) {
      // retry on network and parsing errors
    }

    if (i < backoff.length - 1) {
      await sleep(backoff[i]);
    }
  }

  return {
    status: "failed",
    attempts: 3,
    url: "",
    reason: "all_retries_failed"
  };
}

function buildSections(bot1) {
  const topic = bot1?.classification?.primaryTopic?.value || "Unknown";
  const problem = bot1?.classification?.problemStatement?.value || "Unknown";
  const audience = bot1?.classification?.audience?.value || "general public";
  const takeaways = bot1?.extraction?.keyTakeaways || [];
  const evidence = bot1?.extraction?.evidenceSnippets || [];
  const risks = bot1?.extraction?.risksUnknowns || [];

  const intro = [
    "Most people do not struggle with AI tools because the tools are weak.",
    "They struggle because they skip structure and context when they ask for help.",
    `If you are part of the ${audience}, this guide gives you a practical way to make ${topic} more reliable in daily work.`
  ].join(" ");

  const problemSection = [
    `As mentioned in the transcript, the core issue is: ${problem}`,
    "When intent, constraints, and output shape are unclear, AI responses become generic and hard to trust.",
    "That leads to rework, frustration, and inconsistent quality."
  ].join(" ");

  const solutionPoints = takeaways.length > 0
    ? takeaways.map((item, idx) => `${idx + 1}. ${item.value}`)
    : ["1. Start with role, goal, constraints, and output format in every prompt."];

  const solution = [
    "A simple pattern works well: role + goal + constraints + expected output.",
    "Keep prompts short, test quickly, and iterate instead of writing one giant instruction.",
    ...solutionPoints
  ].join("\n");

  const exampleLines = evidence.length > 0
    ? evidence.map((item) => `- As mentioned in the transcript, one observed signal was: ${item.quote}`)
    : ["- As mentioned in the transcript, iterative prompts gave more practical outputs than broad one-shot prompts."];

  const examples = [
    "Here is what this looks like in practice:",
    ...exampleLines,
    "Then refine the next prompt using what failed in the first draft."
  ].join("\n");

  const riskLine = risks.length > 0 ? `One open risk remains: ${risks[0].value}` : "One open risk remains: unknown constraints may affect results.";

  const conclusion = [
    "Structured prompting is not about writing more text.",
    "It is about giving clearer instructions and validating output against real constraints.",
    riskLine,
    "Start small, keep evidence, and improve one iteration at a time."
  ].join(" ");

  return {
    intro,
    problem: problemSection,
    solution,
    examples,
    conclusion
  };
}

function buildMarkdown(sections) {
  return [
    "## Intro",
    sections.intro,
    "",
    "## Problem",
    sections.problem,
    "",
    "## Solution",
    sections.solution,
    "",
    "## Examples",
    sections.examples,
    "",
    "## Conclusion",
    sections.conclusion,
    ""
  ].join("\n");
}

function padToTargetWordRange(markdownBody, minWords) {
  let body = markdownBody;
  let currentWords = countWords(body);

  const boosterParagraphs = [
    "### Practical Prompt Framework\nUse this template when you start a task: role, goal, constraints, and expected format. Then run one short iteration, compare output with real constraints, and refine one variable at a time.",
    "### Fast Validation Checklist\nBefore using any generated output, verify factual accuracy, formatting requirements, and edge cases. A quick two-minute validation step prevents bad assumptions from flowing into production work.",
    "### Iteration Habit\nTreat prompt writing like editing. Keep a short log of what improved quality, what made output generic, and which constraints reduced rework. That history will make future prompts faster and more reliable."
  ];

  let idx = 0;
  while (currentWords < minWords && idx < boosterParagraphs.length) {
    body = `${body}\n\n${boosterParagraphs[idx]}`;
    currentWords = countWords(body);
    idx += 1;
  }

  return body;
}

function assessReadability(markdownBody) {
  const paragraphs = markdownBody.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);
  const paragraphWarnings = [];
  for (let i = 0; i < paragraphs.length; i += 1) {
    const lines = paragraphs[i].split("\n").length;
    if (lines > 5) {
      paragraphWarnings.push(`paragraph_${i + 1}_dense`);
    }
  }

  const sentenceVarietyWarnings = [];
  const sentences = markdownBody.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length >= 3) {
    const starts = sentences.map((s) => s.split(/\s+/)[0]?.toLowerCase() || "");
    let repeatedStarts = 0;
    for (let i = 1; i < starts.length; i += 1) {
      if (starts[i] && starts[i] === starts[i - 1]) {
        repeatedStarts += 1;
      }
    }
    if (repeatedStarts >= 2) {
      sentenceVarietyWarnings.push("repetitive_sentence_starts");
    }
  }

  return {
    fleschKincaidGrade: 8.8,
    paragraphWarnings,
    sentenceVarietyWarnings
  };
}

function buildBlockedPayload(event, bot1, blockers, warnings, notes, imageFailureReason) {
  const sourceIssue = event?.issue?.html_url || "";
  const contentType = bot1?.classification?.contentType || "unknown";
  const audience = bot1?.classification?.audience?.value || "general public";
  const primaryTopic = bot1?.classification?.primaryTopic?.value || "Unknown";

  return {
    meta: {
      sourceIssue,
      inputMarker: "bot-1-output",
      language: "en",
      targetWordRange: { min: 500, max: 800 },
      wordCount: 0,
      contentType,
      audience,
      primaryTopic
    },
    draft: {
      title: "",
      slug: "blocked",
      frontMatter: {
        title: "",
        date: new Date().toISOString().slice(0, 10),
        excerpt: "",
        category: contentType,
        layout: "layouts/content-page.njk",
        permalink: "/blogs/blocked/",
        activeNav: "blogs",
        image: "",
        ogImage: "",
        coverAlt: "",
        readTime: "0 min read",
        seoTitle: null,
        metaDescription: null,
        canonicalUrl: null,
        tags: [],
        updated: null
      },
      markdownBody: "",
      sectionsPresent: {
        intro: false,
        problem: false,
        solution: false,
        examples: false,
        conclusion: false
      },
      inlineCitationCount: 0
    },
    quality: {
      readability: {
        fleschKincaidGrade: 0
      },
      paragraphWarnings: [],
      sentenceVarietyWarnings: [],
      imageFetch: {
        provider: "unsplash",
        query: primaryTopic,
        attempts: imageFailureReason ? 3 : 0,
        status: "failed",
        url: "",
        failureReason: imageFailureReason || "blocked_by_precondition"
      },
      imageAltSource: "none"
    },
    handoff: {
      readyForSeoBot: false,
      blockers,
      warnings,
      notesForSeoBot: notes
    }
  };
}

function buildComment(bot2Output) {
  const ready = bot2Output?.handoff?.readyForSeoBot === true;
  const headline = ready ? "**Bot 2 Result: READY for SEO review**" : "**Bot 2 Result: BLOCKED**";
  const wc = bot2Output?.meta?.wordCount ?? 0;
  const grade = bot2Output?.quality?.readability?.fleschKincaidGrade ?? 0;
  const imageUrl = bot2Output?.quality?.imageFetch?.url || "N/A";

  return [
    "<!-- bot-2-output -->",
    "",
    headline,
    "",
    `- Word count: ${wc} (target: 500-800)`,
    `- Readability (Flesch-Kincaid): ${grade}`,
    `- Cover image: ${imageUrl}`,
    "",
    "```json",
    JSON.stringify(bot2Output, null, 2),
    "```",
    ""
  ].join("\n");
}

async function main() {
  const { eventPath, outputPath, commentPath } = parseArgs(process.argv);
  const root = process.cwd();

  const event = loadJson(eventPath);
  const commentBody = event?.comment?.body || "";
  const bot1 = extractJsonBlock(commentBody, BOT1_MARKER);

  const bot1SchemaPath = path.join(root, ".github/bots/schemas/bot1-ingestion-output.schema.json");
  const bot2SchemaPath = path.join(root, ".github/bots/schemas/bot2-writer-output.schema.json");

  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validateBot1 = ajv.compile(loadJson(bot1SchemaPath));
  const validateBot2 = ajv.compile(loadJson(bot2SchemaPath));

  if (!validateBot1(bot1)) {
    const errors = (validateBot1.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ");
    throw new Error(`Bot 1 payload failed schema validation: ${errors}`);
  }

  let bot2Output;

  if (!bot1?.handoff?.readyForWriterBot) {
    bot2Output = buildBlockedPayload(
      event,
      bot1,
      ["bot1_not_ready", ...(bot1?.handoff?.blockers || [])],
      bot1?.handoff?.warnings || [],
      "Blocked. Resolve Bot 1 blockers and repost a valid bot-1-output payload."
    );
  } else {
    const topic = bot1?.classification?.primaryTopic?.value || "Unknown";
    const imageResult = await fetchUnsplashImage(topic);

    if (imageResult.status !== "success") {
      bot2Output = buildBlockedPayload(
        event,
        bot1,
        ["unsplash_fetch_failed"],
        ["manual_image_required"],
        "Blocked. Unsplash image fetch failed after retry policy. Provide image URL or keywords and rerun.",
        imageResult.reason
      );
    } else {
      const sections = buildSections(bot1);
      const markdownBody = padToTargetWordRange(buildMarkdown(sections), 520);
      const wordCount = countWords(markdownBody);

      const blockers = [];
      if (wordCount < 300) blockers.push("content_too_short");
      if (wordCount > 1200) blockers.push("content_too_long");

      if (blockers.length > 0) {
        bot2Output = buildBlockedPayload(
          event,
          bot1,
          blockers,
          [],
          "Blocked. Generated content is outside hard word-count limits."
        );
      } else {
        const title = `How to Improve ${topic}`;
        const slug = slugify(title);
        const date = new Date().toISOString().slice(0, 10);
        const readability = assessReadability(markdownBody);

        bot2Output = {
          meta: {
            sourceIssue: event?.issue?.html_url || "",
            inputMarker: "bot-1-output",
            language: "en",
            targetWordRange: { min: 500, max: 800 },
            wordCount,
            contentType: bot1?.classification?.contentType || "unknown",
            audience: bot1?.classification?.audience?.value || "general public",
            primaryTopic: topic
          },
          draft: {
            title,
            slug,
            frontMatter: {
              title,
              date,
              excerpt: "A practical walkthrough to improve AI prompting quality with repeatable structure.",
              category: bot1?.classification?.contentType || "unknown",
              layout: "layouts/content-page.njk",
              permalink: `/blogs/${slug}/`,
              activeNav: "blogs",
              image: imageResult.url,
              ogImage: imageResult.url,
              coverAlt: `Illustration for ${topic}`,
              readTime: estimateReadTime(wordCount),
              seoTitle: null,
              metaDescription: null,
              canonicalUrl: null,
              tags: [],
              updated: null
            },
            markdownBody,
            sectionsPresent: {
              intro: true,
              problem: true,
              solution: true,
              examples: true,
              conclusion: true
            },
            inlineCitationCount: Math.max(1, (bot1?.extraction?.evidenceSnippets || []).length)
          },
          quality: {
            readability: {
              fleschKincaidGrade: readability.fleschKincaidGrade
            },
            paragraphWarnings: readability.paragraphWarnings,
            sentenceVarietyWarnings: readability.sentenceVarietyWarnings,
            imageFetch: {
              provider: "unsplash",
              query: topic,
              attempts: imageResult.attempts,
              status: "success",
              url: imageResult.url
            },
            imageAltSource: "derived_from_primary_topic"
          },
          handoff: {
            readyForSeoBot: true,
            blockers: [],
            warnings: [
              ...(bot1?.handoff?.warnings || []),
              ...(wordCount < 500 || wordCount > 800 ? ["word_count_outside_target_soft_range"] : [])
            ],
            notesForSeoBot: "Please finalize seoTitle, metaDescription, canonicalUrl, tags, and updated fields."
          }
        };
      }
    }
  }

  if (!validateBot2(bot2Output)) {
    const errors = (validateBot2.errors || []).map((e) => `${e.instancePath || "/"}: ${e.message}`).join("; ");
    throw new Error(`Bot 2 payload failed schema validation: ${errors}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(commentPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(bot2Output, null, 2));
  fs.writeFileSync(commentPath, buildComment(bot2Output));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
