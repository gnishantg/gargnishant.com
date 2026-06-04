const fs = require("fs");
const path = require("path");

const SITE_DIR = path.join(process.cwd(), "_site");
const GA_URL = "https://www.googletagmanager.com/gtag/js?id=G-P7JTD0D9B1";

function walkHtmlFiles(dir, all = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtmlFiles(fullPath, all);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".html")) {
      all.push(fullPath);
    }
  }
  return all;
}

function countOccurrences(content, needle) {
  return content.split(needle).length - 1;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const gaCount = countOccurrences(content, GA_URL);
  const headPlacementPattern = /<head(\s[^>]*)?>\s*<!-- Google tag \(gtag\.js\) -->\s*<script async src=\"https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-P7JTD0D9B1\"><\/script>/i;

  const issues = [];

  if (gaCount !== 1) {
    issues.push(`expected exactly 1 GA loader, found ${gaCount}`);
  }

  if (!headPlacementPattern.test(content)) {
    issues.push("GA snippet is not placed immediately after <head>");
  }

  return issues;
}

function run() {
  if (!fs.existsSync(SITE_DIR)) {
    console.error("_site was not found. Run npm run build before validation.");
    process.exit(1);
  }

  const htmlFiles = walkHtmlFiles(SITE_DIR);
  const failures = [];

  for (const htmlFile of htmlFiles) {
    const issues = validateFile(htmlFile);
    if (issues.length > 0) {
      failures.push({ htmlFile, issues });
    }
  }

  if (failures.length > 0) {
    console.error("GA validation failed:\n");
    for (const failure of failures) {
      const relPath = path.relative(SITE_DIR, failure.htmlFile);
      console.error(`- ${relPath}`);
      for (const issue of failure.issues) {
        console.error(`  - ${issue}`);
      }
    }
    process.exit(1);
  }

  console.log(`GA validation passed for ${htmlFiles.length} HTML files.`);
}

run();
