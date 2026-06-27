const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");

const root = process.cwd();
const schemaPath = path.join(root, ".github/bots/schemas/bot4-qa-output.schema.json");
const successPath = path.join(root, ".github/bots/examples/bot4-success.json");
const blockedPath = path.join(root, ".github/bots/examples/bot4-blocked.json");

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateFile(validate, filePath) {
  const data = loadJson(filePath);
  const ok = validate(data);
  return { filePath, ok, errors: validate.errors || [] };
}

const schema = loadJson(schemaPath);
const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

const results = [validateFile(validate, successPath), validateFile(validate, blockedPath)];
const failures = results.filter((r) => !r.ok);

for (const r of results) {
  if (r.ok) {
    console.log(`PASS: ${path.relative(root, r.filePath)}`);
  } else {
    console.log(`FAIL: ${path.relative(root, r.filePath)}`);
    for (const err of r.errors) {
      console.log(`  - ${err.instancePath || "/"}: ${err.message}`);
    }
  }
}

if (failures.length > 0) {
  process.exit(1);
}
