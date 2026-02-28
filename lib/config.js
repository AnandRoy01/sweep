const fs = require("fs");
const path = require("path");

const CONFIG_FILES = [
  "sweep.config.js",
  "sweep.config.cjs",
  "sweep.config.mjs",
  "sweep.config.json",
  ".sweep.js",
  ".sweep.json",
];

const DEFAULT_CONFIG = {
  rootDir: null,
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
    products: {},
  },
  knip: {
    enabled: false,
    commands: [
      "pnpm dlx knip --reporter json --no-exit-code",
      "npx knip --reporter json --no-exit-code",
      "pnpm dlx knip --reporter json",
      "npx knip --reporter json",
    ],
    cwd: null,
  },
  report: {
    jsonOutput: "unused-assets-report.json",
    saveReport: true,
  },
};

function findConfigFile(cwd) {
  for (const file of CONFIG_FILES) {
    const fullPath = path.resolve(cwd, file);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function loadConfigFile(filePath) {
  const ext = path.extname(filePath);
  if (ext === ".json") {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }
  const mod = require(filePath);
  return typeof mod === "function" ? mod() : mod.default || mod;
}

function loadPackageJsonConfig(cwd) {
  const pkgPath = path.join(cwd, "package.json");
  if (!fs.existsSync(pkgPath)) return {};
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    return pkg.sweep || pkg["find-unused-assets"] || pkg.findUnusedAssets || {};
  } catch {
    return {};
  }
}

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

function loadConfig(cwd) {
  const rootDir = path.resolve(cwd);
  let config = { ...DEFAULT_CONFIG };

  const configFile = findConfigFile(rootDir);
  if (configFile) {
    const fileConfig = loadConfigFile(configFile);
    config = deepMerge(config, fileConfig);
  }

  const pkgConfig = loadPackageJsonConfig(rootDir);
  if (Object.keys(pkgConfig).length > 0) {
    config = deepMerge(config, pkgConfig);
  }

  config.rootDir = config.rootDir || rootDir;
  config.scanDir = config.scanDir || config.srcDir;

  if (config.whitelist && Array.isArray(config.whitelist)) {
    config.whitelist = { patterns: config.whitelist, products: {} };
  }

  return config;
}

module.exports = { loadConfig, DEFAULT_CONFIG, findConfigFile };
