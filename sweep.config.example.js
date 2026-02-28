/**
 * Example configuration for sweep
 * Copy to sweep.config.js and customize
 *
 * Config precedence (lowest to highest):
 * 1. Defaults
 * 2. package.json "sweep" field
 * 3. sweep.config.js
 */

module.exports = {
  // Root directory of the project (default: process.cwd())
  rootDir: process.cwd(),

  // Monorepo apps directory (relative to rootDir)
  appsDir: "apps",

  // Path to assets directory (relative to each app)
  assetsDir: "src/assets",

  // Path to source directory (relative to each app)
  srcDir: "src",

  // Directory to scan for assets (relative to app, default: same as srcDir)
  scanDir: null,

  // Asset file extensions to scan
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

  // Source file extensions to search for asset references
  sourceExtensions: [".js", ".jsx", ".ts", ".tsx"],

  // Directories to exclude from scanning
  excludeDirs: ["node_modules", ".git", "dist", "build", "coverage"],

  // Whitelist: files/paths to exclude from unused detection
  whitelist: {
    // Global patterns (apply to all apps)
    patterns: [
      // 'src/assets/logo.png',           // Exact file
      // 'src/assets/images/*',           // All in folder
      // 'src/assets/icons/**',           // Folder + subfolders
      // 'regex:^src/assets/icons/.*\\.svg$',  // Regex
      // '*/legacy/*',                    // Any legacy folder
    ],

    // Per-app/product patterns
    products: {
      "my-app": ["src/assets/placeholder.svg"],
      toolkit: ["src/assets/third-party/**"],
    },
  },

  // Knip analysis (optional – disabled by default; or use --knip CLI flag)
  knip: {
    enabled: false,
    cwd: null, // Run from app dir; override if Knip must run elsewhere
    commands: [
      "pnpm dlx knip --reporter json --no-exit-code",
      "npx knip --reporter json --no-exit-code",
    ],
  },

  // Report output
  report: {
    jsonOutput: "unused-assets-report.json",
    saveReport: true,
  },
};
