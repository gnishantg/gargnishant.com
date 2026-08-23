const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const { completeJson } = require("../lib/groq-client");

const MODEL = process.env.GROQ_BOT1_MODEL || "openai/gpt-oss-20b";
const MARKER = "<!-- bot-1-output -->";

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--event") args.eventPath = argv[i + 1];
    if (argv[i] === "--output") args.outputPath = argv[i + 1];
    if (argv[i] === "--comment") args.commentPath = argv[i + 1];
  }
  if (!args.eventPath || !args.outputPath || !args.commentPath) {
    throw new Error("Usage: node scripts/bots/run-bot1-ingestion.js --event <event.json> --output <output.json> --comment <comment.md>");
  }
  return args;
}

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function issueInput(event) {
  const issue = event?.issue || {};
  const body = String(issue.body || "").slice(0, 10000);
  const links = [...body.matchAll(/https?:\/\/[^\s)]+/g)].map((match) => match[0]).slice(0, 5);
  return {
    number: issue.number || 0,
    url: issue.html_url || "",
    title: issue.title || "",
    body,
    linkedSources: links
  };
}

function buildComment(output) {
  const headline = output.handoff.readyForWriterBot ? "**Bot 1 Result: READY for writing**" : "**Bot 1 Result: BLOCKED**";
  return [MARKER, "", headline, "", `- Model: ${MODEL}`, `- Input characters: ${output.meta.inputSizeChars}`, `- Ready for Bot 2: ${output.handoff.readyForWriterBot}`, "", "```json", JSON.stringify(output, null, 2), "```", ""].join("\n");
}

function validationErrors(validate, output) {
  return (validate(output), validate.errors || [])
    .map((error) => `${error.instancePath || "/"}: ${error.message}`)
    .join("; ");
}

async function main() {
  const { eventPath, outputPath, commentPath } = parseArgs(process.argv);
  const root = process.cwd();
  const event = loadJson(eventPath);
  const input = issueInput(event);
  const system = [
    "You are Bot 1, an evidence-preserving blog intake analyst.",
    "Return JSON only. Do not write the blog article.",
    "Use only facts present in the supplied issue. Missing information must be Unknown.",
    "Each confident value must include a confidence integer from 0 to 100.",
    "Evidence quotes must be exact or near-exact excerpts from the issue body and identify their source.",
    "Set readyForWriterBot false when the primary topic, evidence, or major fields are missing or low confidence.",
    "The top-level JSON object must contain exactly these sections: meta, preprocessing, classification, extraction, and handoff.",
    "Include every required nested field from the Bot1IngestionOutput schema in .github/bots/schemas/bot1-ingestion-output.schema.json."
  ].join("\n");
  const user = JSON.stringify({ issue: input, sourcePriority: ["attachments", "issue body", "chat link"] });
  const result = await completeJson({ model: MODEL, system, user, maxTokens: 1200 });
  let output = result.data;
  output.meta = {
    ...(output.meta || {}),
    sourceIssue: input.url,
    labelMatched: "write-blog",
    language: "en",
    inputSizeChars: input.body.length,
    sourcePriority: ["attachments", "issue body", "chat link"],
    attachmentsUsed: output.meta?.attachmentsUsed || [],
    chatLinkFetchStatus: output.meta?.chatLinkFetchStatus || { status: "skipped", url: "", reason: "No chat link fetch performed by Bot 1" }
  };
  output.meta.model = MODEL;

  const schema = loadJson(path.join(root, ".github/bots/schemas/bot1-ingestion-output.schema.json"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  if (!validate(output)) {
    const errors = validationErrors(validate, output);
    const repairSystem = `${system}\nYour previous response failed validation. Return a complete corrected object, not a partial patch. Do not omit any top-level section or required nested field.`;
    const repairUser = JSON.stringify({ issue: input, invalidResponse: output, validationErrors: errors });
    output = (await completeJson({ model: MODEL, system: repairSystem, user: repairUser, maxTokens: 1400, attempts: 1 })).data;
    output.meta = {
      ...(output.meta || {}),
      sourceIssue: input.url,
      labelMatched: "write-blog",
      language: "en",
      inputSizeChars: input.body.length,
      sourcePriority: ["attachments", "issue body", "chat link"],
      attachmentsUsed: output.meta?.attachmentsUsed || [],
      chatLinkFetchStatus: output.meta?.chatLinkFetchStatus || { status: "skipped", url: "", reason: "No chat link fetch performed by Bot 1" }
    };
    output.meta.model = MODEL;
    if (!validate(output)) {
      throw new Error(`Bot 1 response failed schema validation after repair: ${validationErrors(validate, output)}`);
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(commentPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  fs.writeFileSync(commentPath, buildComment(output));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});