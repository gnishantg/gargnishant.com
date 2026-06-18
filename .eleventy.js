const path = require("path");

const GA_MEASUREMENT_ID = "G-P7JTD0D9B1";
const GA_LOADER = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;

function buildGaTagBlock() {
  return [
    "    <!-- Google tag (gtag.js) -->",
    `    <script async src=\"${GA_LOADER}\"></script>`,
    "    <script>",
    "      window.dataLayer = window.dataLayer || [];",
    "      function gtag(){dataLayer.push(arguments);}",
    "      gtag('js', new Date());",
    "      gtag('config', 'G-P7JTD0D9B1');",
    "    </script>"
  ].join("\n");
}

module.exports = function(eleventyConfig) {
  ["css", "js", "images", "assets", "CNAME", "robots.txt"].forEach((item) => {
    eleventyConfig.addPassthroughCopy(item);
  });

  eleventyConfig.addFilter("monthShort", (value) => {
    const date = new Date(value);
    return date.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  });

  eleventyConfig.addFilter("dayNumber", (value) => {
    const date = new Date(value);
    return String(date.getUTCDate()).padStart(2, "0");
  });

  eleventyConfig.addFilter("htmlDateString", (value) => {
    const date = new Date(value);
    return date.toISOString().split("T")[0];
  });

  eleventyConfig.addCollection("blogPosts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("./blogs/*.md")
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection("projectPosts", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("./projects/*.md")
      .sort((a, b) => a.fileSlug.localeCompare(b.fileSlug));
  });

  eleventyConfig.addCollection("projectPages", (collectionApi) => {
    return collectionApi
      .getFilteredByGlob("./src/project-sources/project-detail-*.njk")
      .sort((a, b) => a.fileSlug.localeCompare(b.fileSlug));
  });

  eleventyConfig.addTransform("injectGoogleTag", (content, outputPath) => {
    if (!outputPath || path.extname(outputPath) !== ".html") {
      return content;
    }
    if (outputPath.endsWith("sitemap.xml")) {
      return content;
    }

    if (content.includes(GA_LOADER)) {
      return content;
    }

    return content.replace(/<head(\s[^>]*)?>/i, (headTagMatch) => {
      return `${headTagMatch}\n${buildGaTagBlock()}`;
    });
  });

  return {
    dir: {
      input: ".",
      includes: "src/_includes",
      output: "_site"
    },
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
    templateFormats: ["html", "md", "njk"]
  };
};
