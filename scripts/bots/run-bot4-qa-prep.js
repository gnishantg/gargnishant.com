const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const BOT3_MARKER = "<!-- bot3-seo-output -->";
const BOT4_MARKER = "<!-- bot4-qa-output -->";
const SITE_BASE_URL = "https://gargnishant.com";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--event") args.eventPath = argv[i + 1];
    if (argv[i] === "--output") args.outputPath = argv[i + 1];
    if (argv[i] === "--comment") args.commentPath = argv[i + 1];
  }

  if (!args.eventPath || !args.outputPath || !args.commentPath) {
    throw new Error("Usage: node scripts/bots/run-bot4-qa-prep.js --event <event.json> --output <bot4.json> --comment <comment.md>");
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

function extractJsonAfterMarker(body, marker) {
  const markerIndex = String(body || "").indexOf(marker);
  if (markerIndex === -1) return null;

  const after = String(body).slice(markerIndex + marker.length);
  const candidates = [];

  const jsonFence = after.match(/```json\s*([\s\S]*?)```/i);
  if (jsonFence && jsonFence[1]) candidates.push(jsonFence[1].trim());

  const plainFence = after.match(/```\s*([\s\S]*?)```/i);
  if (plainFence && plainFence[1]) candidates.push(plainFence[1].trim());

  const rawJson = extractFirstJsonObject(after);
  if (rawJson) candidates.push(rawJson.trim());

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next candidate
    }
  }

  return null;
}

function parseFrontMatterFromMarkdown(markdown) {
  const content = String(markdown || "");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { fields: null, body: "", malformed: true };
  }

  const fields = {};
  const lines = match[1].split("\n");
  let currentListKey = null;

  for (const line of lines) {
    if (!line.trim()) continue;

    const listItemMatch = line.match(/^\s*-\s+"?(.*?)"?\s*$/);
    if (listItemMatch && currentListKey) {
      fields[currentListKey] = fields[currentListKey] || [];
      fields[currentListKey].push(listItemMatch[1]);
      continue;
    }

    const keyValueMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!keyValueMatch) {
      currentListKey = null;
      continue;
    }

    const key = keyValueMatch[1];
    const raw = keyValueMatch[2] || "";

    if (raw.trim() === "") {
      currentListKey = key;
      fields[key] = fields[key] || [];
      continue;
    }

    currentListKey = null;
    fields[key] = raw.replace(/^"|"$/g, "").trim();
  }

  const body = content.replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
  return { fields, body, malformed: false };
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFromPermalink(permalink) {
  const match = String(permalink || "").match(/^\/blogs\/([a-z0-9-]+)\/$/);
  return match ? match[1] : "untitled";
}

function unique(items) {
  return [...new Set((items || []).filter(Boolean))];
}

function parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const parts = linkHeader.split(",");
  for (const part of parts) {
    const trimmed = part.trim();
    const match = trimmed.match(/^<([^>]+)>;\s*rel="([^"]+)"$/);
    if (match && match[2] === "next") return match[1];
  }
  return null;
}

async function fetchIssueComments(owner, repo, issueNumber, token) {
  let url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`;
  const comments = [];

  while (url) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "bot4-qa-prep"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch issue comments: ${response.status} ${response.statusText}`);
    }

    const page = await response.json();
    comments.push(...page);
    url = parseNextLink(response.headers.get("link"));
  }

  return comments;
}

async function checkLinks(markdownBody) {
  const warnings = [];
  const text = String(markdownBody || "");
  const links = [...text.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)].map((m) => m[2]);
  const uniqueLinks = unique(links).slice(0, 6);

  for (const link of uniqueLinks) {
    try {
      const response = await fetch(link, {
        method: "HEAD",
        signal: AbortSignal.timeout(4000)
      });
      if (response.status >= 400) {
        warnings.push(`link_non_2xx:${link}`);
      }
    } catch {
      warnings.push(`link_timeout_or_network_error:${link}`);
    }
  }

  return {
    checkedCount: uniqueLinks.length,
    warnings
  };
}

function evaluateReadability(markdownBody, warnings) {
  const paragraphs = String(markdownBody || "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  let longParagraphs = 0;
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean).length;
    if (words > 220) longParagraphs += 1;
  }

  if (longParagraphs > 0) warnings.push(`readability_long_paragraphs:${longParagraphs}`);

  const headingCount = String(markdownBody || "")
    .split("\n")
    .filter((line) => /^#{2,6}\s+/.test(line.trim())).length;

  if (headingCount < 3) warnings.push("structure_low_heading_count");

  return {
    headingCount,
    longParagraphs
  };
}

function evaluateSeoHeuristics(frontMatter, markdownBody, warnings) {
  const seoTitle = String(frontMatter.seoTitle || "");
  const metaDescription = String(frontMatter.metaDescription || "");
  const primaryKeyword = String(frontMatter.primaryKeyword || "").trim();

  if (seoTitle.length < 45 || seoTitle.length > 65) {
    warnings.push("seo_title_outside_target_range");
  }

  if (metaDescription.length < 140 || metaDescription.length > 170) {
    warnings.push("meta_description_outside_target_range");
  }

  if (primaryKeyword) {
    const titleHasKeyword = normalizeText(frontMatter.title).includes(normalizeText(primaryKeyword));
    const first120Words = String(markdownBody || "").split(/\s+/).filter(Boolean).slice(0, 120).join(" ");
    const bodyHasKeyword = normalizeText(first120Words).includes(normalizeText(primaryKeyword));

    if (!titleHasKeyword) warnings.push("seo_primary_keyword_missing_in_title");
    if (!bodyHasKeyword) warnings.push("seo_primary_keyword_missing_in_intro");
  } else {
    warnings.push("seo_primary_keyword_missing");
  }
}

function buildComment(output) {
  let headline = "**Bot 4 Result: BLOCKED**";
  if (output.handoff.prerequisiteMissing) {
    headline = "**Bot 4 Result: WAITING (Bot 3 output missing)**";
  } else if (output.handoff.readyForPr) {
    headline = "**Bot 4 Result: READY for PR update**";
  }

  const warnings = output.handoff.warnings || [];
  const blockers = output.handoff.blockers || [];

  const warningLines = warnings.length > 0
    ? warnings.map((warning) => `- ${warning}`)
    : ["- none"];

  return [
    BOT4_MARKER,
    "",
    headline,
    "",
    `- Blockers: ${blockers.length}`,
    `- Warnings: ${warnings.length}`,
    `- Ready For PR: ${output.handoff.readyForPr}`,
    output.artifact.postFilePath ? `- Blog File: ${output.artifact.postFilePath}` : "- Blog File: n/a",
    output.artifact.branchName ? `- Branch: ${output.artifact.branchName}` : "- Branch: n/a",
    output.artifact.prTitle ? `- PR Title: ${output.artifact.prTitle}` : "- PR Title: n/a",
    "",
    "Warnings:",
    ...warningLines,
    "",
    "```json",
    JSON.stringify(output, null, 2),
    "```",
    ""
  ].join("\n");
}

function createBaseOutput(event) {
  const issueNumber = event?.issue?.number || 0;
  const issueUrl = event?.issue?.html_url || "";

  return {
    meta: {
      sourceIssue: issueUrl,
      issueNumber,
      inputMarker: "bot3-seo-output",
      outputMarker: "bot4-qa-output",
      stage: "bot4_qa_prep",
      language: "en"
    },
    qa: {
      frontMatter: {
        malformed: false,
        missingRequiredFields: [],
        canonicalMatchesPermalink: true
      },
      markdown: {
        missingBody: false,
        headingCount: 0,
        longParagraphs: 0
      },
      links: {
        checkedCount: 0,
        warnings: []
      },
      build: {
        attempted: false,
        passed: false,
        exitCode: null
      },
      accessibility: {
        missingCoverAlt: false
      }
    },
    artifact: {
      postTitle: "",
      slug: "",
      postFilePath: "",
      branchName: "",
      prTitle: "",
      finalMarkdown: ""
    },
    handoff: {
      prerequisiteMissing: false,
      readyForPr: false,
      blockers: [],
      warnings: [],
      notesForHuman: ""
    }
  };
}

async function main() {
  const { eventPath, outputPath, commentPath } = parseArgs(process.argv);
  const root = process.cwd();
  const event = loadJson(eventPath);
  const output = createBaseOutput(event);

  const token = process.env.GITHUB_TOKEN;
  const repository = event?.repository?.full_name || process.env.GITHUB_REPOSITORY || "";
  if (!token || !repository.includes("/")) {
    throw new Error("Missing GITHUB_TOKEN or repository context for Bot 4 runner.");
  }

  const [owner, repo] = repository.split("/");
  const issueNumber = event?.issue?.number;
  if (!issueNumber) {
    throw new Error("Could not determine issue number from event payload.");
  }

  const comments = await fetchIssueComments(owner, repo, issueNumber, token);
  const latestBot3Comment = [...comments]
    .reverse()
    .find((comment) => String(comment.body || "").includes(BOT3_MARKER));

  if (!latestBot3Comment) {
    output.handoff.prerequisiteMissing = true;
    output.handoff.warnings = ["missing_bot3_output_prerequisite"];
    output.handoff.notesForHuman = "Bot 4 skipped because no prior bot3-seo-output comment was found on this issue.";

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.mkdirSync(path.dirname(commentPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    fs.writeFileSync(commentPath, buildComment(output));
    return;
  }

  const bot3 = extractJsonAfterMarker(latestBot3Comment.body, BOT3_MARKER);
  if (!bot3) {
    output.handoff.prerequisiteMissing = true;
    output.handoff.warnings = ["invalid_bot3_output_payload"];
    output.handoff.notesForHuman = "Bot 4 skipped because latest bot3-seo-output comment did not contain valid JSON.";

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.mkdirSync(path.dirname(commentPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    fs.writeFileSync(commentPath, buildComment(output));
    return;
  }

  const warnings = [];
  const blockers = [];

  const draft = bot3?.draft || {};
  const finalMarkdown = String(draft.finalMarkdown || "").trim();
  const parsedFrontMatter = parseFrontMatterFromMarkdown(finalMarkdown);
  const sourceFrontMatter = draft.frontMatter && typeof draft.frontMatter === "object" ? draft.frontMatter : {};
  const frontMatter = parsedFrontMatter.fields && Object.keys(sourceFrontMatter).length === 0
    ? parsedFrontMatter.fields
    : { ...parsedFrontMatter.fields, ...sourceFrontMatter };

  output.artifact.postTitle = String(frontMatter.title || draft.title || "").trim();
  output.artifact.finalMarkdown = finalMarkdown;

  if (parsedFrontMatter.malformed) {
    blockers.push("malformed_frontmatter_or_markdown");
    output.qa.frontMatter.malformed = true;
  }

  const markdownBody = String(draft.markdownBody || parsedFrontMatter.body || "").trim();
  if (!markdownBody) {
    blockers.push("missing_markdown_body");
    output.qa.markdown.missingBody = true;
  }

  const requiredFrontMatter = [
    "title",
    "date",
    "excerpt",
    "category",
    "layout",
    "permalink",
    "activeNav",
    "seoTitle",
    "metaDescription",
    "canonicalUrl",
    "tags"
  ];

  const missingRequired = [];
  for (const field of requiredFrontMatter) {
    const value = frontMatter[field];
    const missing = value === null
      || value === undefined
      || (typeof value === "string" && value.trim() === "")
      || (Array.isArray(value) && value.length === 0);
    if (missing) missingRequired.push(field);
  }

  if (missingRequired.length > 0) {
    blockers.push(...missingRequired.map((field) => `missing_frontmatter_field:${field}`));
  }

  output.qa.frontMatter.missingRequiredFields = missingRequired;

  const permalink = String(frontMatter.permalink || draft.permalink || "").trim();
  const canonicalUrl = String(frontMatter.canonicalUrl || bot3?.seo?.canonicalUrl || "").trim();
  const expectedCanonical = `${SITE_BASE_URL}${permalink}`;
  if (!permalink || !canonicalUrl || canonicalUrl !== expectedCanonical) {
    blockers.push("canonical_permalink_mismatch");
    output.qa.frontMatter.canonicalMatchesPermalink = false;
  }

  if (!String(frontMatter.coverAlt || "").trim()) {
    warnings.push("accessibility_missing_cover_alt");
    output.qa.accessibility.missingCoverAlt = true;
  }

  const readability = evaluateReadability(markdownBody, warnings);
  output.qa.markdown.headingCount = readability.headingCount;
  output.qa.markdown.longParagraphs = readability.longParagraphs;

  evaluateSeoHeuristics(frontMatter, markdownBody, warnings);

  const linkResults = await checkLinks(markdownBody);
  warnings.push(...linkResults.warnings);
  output.qa.links.checkedCount = linkResults.checkedCount;
  output.qa.links.warnings = linkResults.warnings;

  const postDate = String(frontMatter.date || new Date().toISOString().slice(0, 10));
  const slug = String(draft.slug || slugFromPermalink(permalink) || "untitled");
  const issueSafeSlug = slug.replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "") || "untitled";

  output.artifact.slug = issueSafeSlug;
  output.artifact.branchName = `bot4/issue-${issueNumber}-${issueSafeSlug}`;
  output.artifact.prTitle = `Bot4 QA: ${output.artifact.postTitle || issueSafeSlug} (issue #${issueNumber})`;
  output.artifact.postFilePath = `blogs/${postDate}-${issueSafeSlug}.md`;

  if (blockers.length === 0 && finalMarkdown) {
    fs.mkdirSync(path.join(root, "blogs"), { recursive: true });
    const absolutePostPath = path.join(root, output.artifact.postFilePath);
    fs.mkdirSync(path.dirname(absolutePostPath), { recursive: true });
    fs.writeFileSync(absolutePostPath, `${finalMarkdown}\n`);

    output.qa.build.attempted = true;
    const build = spawnSync("npm", ["run", "build"], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe"
    });

    output.qa.build.exitCode = typeof build.status === "number" ? build.status : null;
    output.qa.build.passed = build.status === 0;

    if (build.status !== 0) {
      blockers.push("build_failed");
      warnings.push("build_failed_check_logs");
    }
  }

  output.handoff.blockers = unique(blockers);
  output.handoff.warnings = unique(warnings);
  output.handoff.readyForPr = output.handoff.blockers.length === 0;
  output.handoff.notesForHuman = output.handoff.readyForPr
    ? "Bot 4 checks passed. Branch and PR can be created or updated for human review."
    : "Bot 4 found blockers. Resolve blockers before PR update and rerun marker <!-- bot4-qa-check -->.";

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(commentPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  fs.writeFileSync(commentPath, buildComment(output));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
