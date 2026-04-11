/**
 * Example configuration for unused-sweep
 * Copy to unused-sweep.config.js and customize
 *
 * Config precedence (lowest to highest):
 * 1. Defaults
 * 2. package.json "unused-sweep" or "unusedSweep" field
 * 3. unused-sweep.config.js (legacy: sweep.config.js is still supported)
 */

module.exports = {
  rootDir: process.cwd(),
  appsDir: "apps",
  assetsDir: "src/assets",
  srcDir: "src",
  scanDir: null,
  assetExtensions: [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".svg",
    ".webp",
    ".ico",
    ".bmp",
    ".mp4",
    ".webm",
    ".mov",
    ".avi",
    ".mp3",
    ".wav",
    ".ogg",
    ".pdf",
    ".doc",
    ".docx",
    ".json",
    ".xml",
    ".csv",
  ],
  sourceExtensions: [".js", ".jsx", ".ts", ".tsx"],
  excludeDirs: ["node_modules", ".git", "dist", "build", "coverage"],
  whitelist: {
    patterns: [],
    products: {
      "my-app": ["src/assets/placeholder.svg"],
      toolkit: ["src/assets/third-party/**"],
    },
  },
  knip: {
    enabled: false,
    cwd: null,
    commands: [
      "pnpm dlx knip --reporter json --no-exit-code",
      "npx knip --reporter json --no-exit-code",
    ],
  },
  report: {
    jsonOutput: "unused-assets-report.json",
    saveReport: true,
  },
};
