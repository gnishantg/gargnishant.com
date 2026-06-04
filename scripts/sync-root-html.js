const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SITE_DIR = path.join(ROOT, "_site");

function collectHtmlFiles(dir, relativeRoot = "", files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = path.join(relativeRoot, entry.name);
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      collectHtmlFiles(absolutePath, relativePath, files);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(relativePath);
    }
  }

  return files;
}

if (!fs.existsSync(SITE_DIR)) {
  console.error("_site was not found. Run npm run build first.");
  process.exit(1);
}

const htmlFiles = collectHtmlFiles(SITE_DIR);

for (const relativeHtmlPath of htmlFiles) {
  const sourcePath = path.join(SITE_DIR, relativeHtmlPath);
  const targetPath = path.join(ROOT, relativeHtmlPath);
  const targetDir = path.dirname(targetPath);

  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

console.log(`Synced ${htmlFiles.length} generated HTML files from _site to repository root.`);
