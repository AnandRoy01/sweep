const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);

const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  bright: "\x1b[1m",
};

class ComprehensiveCleanupChecker {
  constructor(options = {}) {
    const { appName, rootDir, config, appDir, outputJson } = options;
    this.config = config || {};
    this.rootDir = path.resolve(rootDir || process.cwd());
    this.appName =
      appName === undefined || appName === null ? "" : String(appName).trim();

    this.appsDir = path.join(this.rootDir, this.config.appsDir || "apps");
    if (appDir) {
      this.appDir = path.resolve(appDir);
      if (!this.appName) {
        this.appName = path.basename(this.appDir) || "current";
      }
    } else if (
      this.appName &&
      this.appName.toLowerCase() !== "all" &&
      this.appName !== "."
    ) {
      this.appDir = path.join(this.appsDir, this.appName);
    } else {
      this.appDir = this.rootDir;
      if (this.appName === ".")
        this.appName = path.basename(this.appDir) || "current";
    }
    this.assetsDir = path.join(
      this.appDir,
      this.config.assetsDir || "src/assets",
    );
    this.srcDir = path.join(this.appDir, this.config.srcDir || "src");
    this.scanDir = this.config.scanDir
      ? path.resolve(this.appDir, this.config.scanDir)
      : this.srcDir;

    this.assetExtensions = this.config.assetExtensions || [
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
    ];
    this.sourceExtensions = this.config.sourceExtensions || [
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
    ];
    this.excludeDirs = new Set(
      this.config.excludeDirs || [
        "node_modules",
        ".git",
        "dist",
        "build",
        "coverage",
      ],
    );
    this.outputJson = Boolean(outputJson);

    this.assetFiles = [];
    this.sourceFiles = [];
    this.unusedAssets = [];
    this.knipResults = {
      files: [],
      dependencies: [],
      devDependencies: [],
      exports: [],
      types: [],
      error: null,
    };
    this.aggregatedUnusedData = {};
    this.unusedAssetsReportJson =
      (this.config.report && this.config.report.jsonOutput) ||
      "unused-assets-report.json";
    this.whitelistMatchers = {
      exactPaths: new Set(),
      exactBasenames: new Set(),
      regexMatchers: [],
    };
    this.whitelistResultCache = new Map();
    this.invalidWhitelistPatterns = [];
    this.pathNormalizationWarnings = new Set();

    if (this.appName) {
      this.compileWhitelistMatchers();
    }
  }

  getAllWhitelistPatterns() {
    const whitelist = this.config.whitelist || {};
    const globalPatterns = whitelist.patterns || [];
    const productPatterns =
      (whitelist.products && whitelist.products[this.appName]) || [];
    return [...globalPatterns, ...productPatterns];
  }

  resetWhitelistMatchers() {
    this.whitelistMatchers = {
      exactPaths: new Set(),
      exactBasenames: new Set(),
      regexMatchers: [],
    };
    this.whitelistResultCache.clear();
    this.invalidWhitelistPatterns = [];
  }

  compileWhitelistMatchers() {
    this.resetWhitelistMatchers();
    const allPatterns = this.getAllWhitelistPatterns();

    for (const pattern of allPatterns) {
      if (
        !pattern ||
        (typeof pattern === "string" && pattern.trim().startsWith("//"))
      )
        continue;
      const normalizedPattern = String(pattern).trim().replace(/\\/g, "/");
      this.processWhitelistPattern(normalizedPattern);
    }
  }

  processWhitelistPattern(normalizedPattern) {
    const isRegexPattern =
      normalizedPattern.startsWith("regex:") ||
      /^\/(.*)\/([dgimsuvy]*)$/.test(normalizedPattern);
    const hasGlobChars = /[*?]/.test(normalizedPattern);
    const isFolderPattern = normalizedPattern.endsWith("/");
    const hasPathSeparator = normalizedPattern.includes("/");

    if (!isRegexPattern && !hasGlobChars && !isFolderPattern) {
      if (hasPathSeparator) {
        this.whitelistMatchers.exactPaths.add(normalizedPattern);
      } else {
        this.whitelistMatchers.exactBasenames.add(normalizedPattern);
      }
      return;
    }

    try {
      const compiledRegex =
        ComprehensiveCleanupChecker.buildWhitelistRegex(normalizedPattern);
      if (!compiledRegex) return;
      this.whitelistMatchers.regexMatchers.push({
        sourcePattern: normalizedPattern,
        regex: compiledRegex,
      });
    } catch (error) {
      this.invalidWhitelistPatterns.push({
        pattern: normalizedPattern,
        reason: error.message,
      });
    }
  }

  showUsage() {
    console.log(`${colors.cyan}${colors.bright}Usage:${colors.reset}`);
    console.log("  sweep");
    console.log("  sweep .");
    console.log("  sweep <path>");
    console.log(
      `  sweep <app-name>                  # resolves to ${path.join(this.config.appsDir || "apps", "<app-name>")}`,
    );
    console.log("  sweep all");
    console.log("  npx sweep");
    console.log("");
    console.log(`${colors.cyan}${colors.bright}Description:${colors.reset}`);
    console.log(`  Finds unused assets, files, dependencies, and exports.`);
    console.log(`  Use 'all' to analyze all apps in the apps directory.`);
    console.log(`  If <path> exists, it is treated as a project directory.`);
    console.log("");
    console.log(`${colors.cyan}${colors.bright}Configuration:${colors.reset}`);
    console.log(`  - sweep.config.js`);
    console.log(`  - package.json "sweep" field`);
    console.log("");
    if (fs.existsSync(this.appsDir)) {
      try {
        const apps = fs
          .readdirSync(this.appsDir)
          .filter((item) => {
            const itemPath = path.join(this.appsDir, item);
            return fs.statSync(itemPath).isDirectory() && !item.startsWith(".");
          })
          .sort();
        console.log(
          `${colors.cyan}${colors.bright}Available apps:${colors.reset}`,
        );
        apps.forEach((app) => console.log(`  - ${app}`));
      } catch {
        console.log("  Could not list apps");
      }
    }
  }

  getAllApps() {
    try {
      return fs
        .readdirSync(this.appsDir)
        .filter((item) => {
          const itemPath = path.join(this.appsDir, item);
          const srcPath = path.join(itemPath, this.config.srcDir || "src");
          return (
            fs.statSync(itemPath).isDirectory() &&
            !item.startsWith(".") &&
            fs.existsSync(srcPath)
          );
        })
        .sort();
    } catch {
      return [];
    }
  }

  validateApp() {
    if (!fs.existsSync(this.appDir)) {
      console.error(
        `${colors.red}Error: App '${this.appName}' not found${colors.reset}`,
      );
      return false;
    }
    if (!fs.existsSync(this.srcDir)) {
      console.error(
        `${colors.red}Error: src directory not found for '${this.appName}'${colors.reset}`,
      );
      return false;
    }
    if (this.invalidWhitelistPatterns.length > 0) {
      console.error(
        `${colors.red}Error: Invalid whitelist pattern(s):${colors.reset}`,
      );
      this.invalidWhitelistPatterns.forEach(({ pattern, reason }) => {
        console.error(`${colors.red}  - ${pattern} (${reason})${colors.reset}`);
      });
      return false;
    }
    if (!fs.existsSync(this.assetsDir)) {
      console.warn(
        `${colors.yellow}Note: No assets directory found. Scanning src folder.${colors.reset}`,
      );
    }
    return true;
  }

  getAllFiles(directory, extensions, results = []) {
    try {
      const files = fs.readdirSync(directory);
      for (const file of files) {
        const filePath = path.join(directory, file);
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          if (!this.excludeDirs.has(file)) {
            this.getAllFiles(filePath, extensions, results);
          }
        } else {
          const ext = path.extname(file).toLowerCase();
          if (extensions.includes(ext)) {
            results.push(filePath);
          }
        }
      }
    } catch (error) {
      console.warn(
        `${colors.yellow}Warning: Could not read ${directory}: ${error.message}${colors.reset}`,
      );
    }
    return results;
  }

  collectAssetFiles() {
    console.log(
      `${colors.blue}Collecting asset files from: ${this.scanDir}${colors.reset}`,
    );
    this.assetFiles = this.getAllFiles(this.scanDir, this.assetExtensions);
    console.log(
      `Found ${colors.bright}${this.assetFiles.length}${colors.reset} asset files`,
    );
  }

  collectSourceFiles() {
    console.log(
      `${colors.blue}Collecting source files from: ${this.srcDir}${colors.reset}`,
    );
    this.sourceFiles = this.getAllFiles(this.srcDir, this.sourceExtensions);
    console.log(
      `Found ${colors.bright}${this.sourceFiles.length}${colors.reset} source files`,
    );
  }

  static getFileSize(filePath) {
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  static formatFileSize(bytes) {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
  }

  normalizePathForWhitelist(filePath) {
    if (!filePath || typeof filePath !== "string") return "";
    const normalizedInputPath = filePath.replace(/\\/g, "/");
    if (path.isAbsolute(filePath)) {
      const relativePath = path
        .relative(this.appDir, filePath)
        .replace(/\\/g, "/");
      const isOutsideApp =
        relativePath.startsWith("../") ||
        relativePath === ".." ||
        path.isAbsolute(relativePath);
      if (isOutsideApp) {
        if (!this.pathNormalizationWarnings.has(filePath)) {
          this.pathNormalizationWarnings.add(filePath);
          console.warn(
            `${colors.yellow}Warning: Ignoring path outside app: ${filePath}${colors.reset}`,
          );
        }
        return "";
      }
      return relativePath;
    }
    return normalizedInputPath.startsWith("./")
      ? normalizedInputPath.slice(2)
      : normalizedInputPath;
  }

  static buildWhitelistRegex(pattern) {
    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) return null;
    if (trimmedPattern.startsWith("regex:")) {
      const regexBody = trimmedPattern.slice(6);
      ComprehensiveCleanupChecker.validateRegexSafety(regexBody);
      return new RegExp(regexBody);
    }
    const regexLiteralMatch = trimmedPattern.match(/^\/(.*)\/([dgimsuvy]*)$/);
    if (regexLiteralMatch) {
      const [, regexBody, regexFlags] = regexLiteralMatch;
      ComprehensiveCleanupChecker.validateRegexSafety(regexBody);
      return new RegExp(regexBody, regexFlags);
    }
    const folderAwarePattern = trimmedPattern.endsWith("/")
      ? `${trimmedPattern}**`
      : trimmedPattern;
    const escapedPattern =
      ComprehensiveCleanupChecker.globToRegex(folderAwarePattern);
    return new RegExp(`^${escapedPattern}$`);
  }

  static escapeRegexChar(char) {
    return /[|\\{}()[\]^$+*?.-]/.test(char) ? `\\${char}` : char;
  }

  static globToRegex(globPattern) {
    let regexPattern = "";
    for (let i = 0; i < globPattern.length; i += 1) {
      const char = globPattern[i];
      const nextChar = globPattern[i + 1];
      if (char === "*") {
        regexPattern += nextChar === "*" ? ".*" : "[^/]*";
        if (nextChar === "*") i += 1;
      } else if (char === "?") {
        regexPattern += "[^/]";
      } else {
        regexPattern += ComprehensiveCleanupChecker.escapeRegexChar(char);
      }
    }
    return regexPattern;
  }

  static validateRegexSafety(regexBody) {
    if (!regexBody || regexBody.length > 300) {
      throw new Error("Regex pattern is empty or too long (>300 characters)");
    }
    const dangerousPatterns = [
      /\((?:[^)(]|\([^)(]*\))*[+*](?:[^)(]|\([^)(]*\))*\)[+*]/,
      /\(\.\*\)\+|\(\.\+\)\+/,
      /\([^)]*\|[^)]*\)[+*]\+/,
      /\\\d+/,
      /\(\?<=[^)]+\)|\(\?<![^)]+\)/,
    ];
    if (dangerousPatterns.some((p) => p.test(regexBody))) {
      throw new Error(
        "Regex pattern rejected: potential catastrophic backtracking",
      );
    }
  }

  isWhitelisted(filePath) {
    if (
      this.whitelistMatchers.exactPaths.size === 0 &&
      this.whitelistMatchers.exactBasenames.size === 0 &&
      this.whitelistMatchers.regexMatchers.length === 0
    )
      return false;

    const normalizedPath = this.normalizePathForWhitelist(filePath);
    if (!normalizedPath) return false;
    if (this.whitelistResultCache.has(normalizedPath)) {
      return this.whitelistResultCache.get(normalizedPath);
    }

    const basename = path.basename(filePath);
    if (this.whitelistMatchers.exactPaths.has(normalizedPath)) {
      this.whitelistResultCache.set(normalizedPath, true);
      return true;
    }
    if (this.whitelistMatchers.exactBasenames.has(basename)) {
      this.whitelistResultCache.set(normalizedPath, true);
      return true;
    }
    for (const { regex } of this.whitelistMatchers.regexMatchers) {
      if (regex.test(normalizedPath) || regex.test(basename)) {
        this.whitelistResultCache.set(normalizedPath, true);
        return true;
      }
    }
    this.whitelistResultCache.set(normalizedPath, false);
    return false;
  }

  getSourceFileContents() {
    if (this._sourceContents) return this._sourceContents;
    const contents = new Map();
    for (const sourceFile of this.sourceFiles) {
      try {
        contents.set(sourceFile, fs.readFileSync(sourceFile, "utf8"));
      } catch (error) {
        console.warn(
          `${colors.yellow}Warning: Could not read ${sourceFile}: ${error.message}${colors.reset}`,
        );
      }
    }
    this._sourceContents = contents;
    return contents;
  }

  isAssetUsed(assetPath) {
    const assetName = path.basename(assetPath);
    const assetNameWithoutExt = path.basename(
      assetPath,
      path.extname(assetPath),
    );
    const relativePath = path.relative(this.srcDir, assetPath);
    const normalizedRelativePath = relativePath.replace(/\\/g, "/");

    const searchPatterns = [
      assetName,
      assetNameWithoutExt,
      relativePath,
      normalizedRelativePath,
      `src/${normalizedRelativePath}`,
      `assets/${normalizedRelativePath}`,
      `./assets/${normalizedRelativePath}`,
      `/assets/${normalizedRelativePath}`,
    ];

    const escapedForRegex = assetNameWithoutExt.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const dynamicImportRegex = new RegExp(
      `\\$\\{[^}]*${escapedForRegex}[^}]*\\}`,
      "g",
    );

    for (const [, content] of this.getSourceFileContents()) {
      for (const pattern of searchPatterns) {
        if (content.includes(pattern)) return true;
      }
      if (dynamicImportRegex.test(content)) return true;
    }
    return false;
  }

  checkUnusedAssets() {
    console.log(`${colors.blue}Checking for unused assets...${colors.reset}`);
    let whitelistedCount = 0;
    const whitelistedFiles = [];

    for (const assetFile of this.assetFiles) {
      if (this.isWhitelisted(assetFile)) {
        whitelistedCount += 1;
        whitelistedFiles.push(path.relative(this.appDir, assetFile));
        continue;
      }
      if (!this.isAssetUsed(assetFile)) {
        const size = ComprehensiveCleanupChecker.getFileSize(assetFile);
        const relativePath = path.relative(this.rootDir, assetFile);
        this.unusedAssets.push({
          path: relativePath,
          fullPath: assetFile,
          size,
          formattedSize: ComprehensiveCleanupChecker.formatFileSize(size),
        });
      }
    }

    if (whitelistedCount > 0) {
      console.log(
        `${colors.yellow}ℹ️  Skipped ${whitelistedCount} whitelisted asset(s):${colors.reset}`,
      );
      whitelistedFiles.forEach((f) =>
        console.log(`${colors.yellow}   - ${f}${colors.reset}`),
      );
    }
  }

  applyWhitelistToKnipResults() {
    if (!this.knipResults || this.knipResults.error) return;
    const filterKnipPathItems = (items) => {
      if (!Array.isArray(items)) return [];
      return items.filter((item) => {
        if (typeof item === "string") return !this.isWhitelisted(item);
        if (item && typeof item === "object" && item.file)
          return !this.isWhitelisted(item.file);
        return true;
      });
    };
    this.knipResults.files = filterKnipPathItems(this.knipResults.files);
    this.knipResults.exports = filterKnipPathItems(this.knipResults.exports);
    this.knipResults.types = filterKnipPathItems(this.knipResults.types || []);
  }

  async runKnipAnalysis() {
    const knipConfig = this.config.knip || {};
    if (knipConfig.enabled === false) return;

    const packageJsonPath = path.join(this.appDir, "package.json");
    if (!fs.existsSync(packageJsonPath)) {
      this.knipResults = {
        files: [],
        dependencies: [],
        devDependencies: [],
        exports: [],
        types: [],
        error: "No package.json found",
      };
      return;
    }

    this.knipResults = {
      files: [],
      dependencies: [],
      devDependencies: [],
      exports: [],
      types: [],
      error: null,
    };

    const knipCwd = knipConfig.cwd
      ? path.resolve(this.appDir, knipConfig.cwd)
      : this.appDir;
    const commands = knipConfig.commands || [
      "pnpm dlx knip --reporter json --no-exit-code",
      "npx knip --reporter json --no-exit-code",
    ];

    for (const command of commands) {
      try {
        console.log(`${colors.blue}Trying: ${command}${colors.reset}`);
        const { stdout, stderr } = await execAsync(command, {
          cwd: knipCwd,
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 10,
          timeout: 60000,
          shell: true,
        });
        if (stderr && stderr.trim()) {
          console.log(
            `${colors.yellow}Knip stderr: ${stderr.trim()}${colors.reset}`,
          );
        }
        if (stdout && stdout.trim()) {
          const result = ComprehensiveCleanupChecker.parseKnipOutput(stdout);
          if (result) {
            this.knipResults = result;
            this.applyWhitelistToKnipResults();
            console.log(
              `${colors.green}✅ Knip analysis completed${colors.reset}`,
            );
            return;
          }
        }
        console.log(
          `${colors.green}✅ Knip found no unused files${colors.reset}`,
        );
        return;
      } catch (commandError) {
        console.warn(
          `${colors.yellow}Command "${command}" failed: ${commandError.message}${colors.reset}`,
        );
      }
    }

    this.knipResults.error = "All Knip execution attempts failed";
    console.warn(
      `${colors.yellow}Continuing with assets-only analysis.${colors.reset}`,
    );
  }

  static filterSrcFiles(items) {
    if (!items || !Array.isArray(items)) return [];
    return items.filter((item) => {
      if (typeof item === "string")
        return item.startsWith("src/") || item.includes("/src/");
      if (item.file)
        return item.file.startsWith("src/") || item.file.includes("/src/");
      return true;
    });
  }

  static findJsonStartIndex(lines) {
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i].trim();
      if (line.startsWith("{") || line.startsWith("[")) return i;
    }
    return -1;
  }

  static parseKnipOutput(stdout) {
    try {
      if (!stdout || typeof stdout !== "string") return null;
      const lines = stdout.split("\n");
      const jsonStart = ComprehensiveCleanupChecker.findJsonStartIndex(lines);
      if (jsonStart === -1) return null;
      const jsonOutput = lines.slice(jsonStart).join("\n").trim();
      const knipData = JSON.parse(jsonOutput);
      if (!knipData || typeof knipData !== "object") return null;
      return {
        files: ComprehensiveCleanupChecker.filterSrcFiles(knipData.files || []),
        dependencies: knipData.dependencies || [],
        devDependencies: knipData.devDependencies || [],
        exports: ComprehensiveCleanupChecker.filterSrcFiles(
          knipData.exports || [],
        ),
        types: ComprehensiveCleanupChecker.filterSrcFiles(knipData.types || []),
        error: null,
      };
    } catch {
      return null;
    }
  }

  generateReport() {
    console.log(`\n${"=".repeat(80)}`);
    console.log(
      `${colors.cyan}${colors.bright}CLEANUP REPORT: ${this.appName.toUpperCase()}${colors.reset}`,
    );
    console.log("=".repeat(80));
    this.generateAssetsReport();
    this.generateKnipReport();
    this.generateCombinedSummary();
  }

  generateAssetsReport() {
    console.log(
      `\n${colors.cyan}${colors.bright}📁 UNUSED ASSETS${colors.reset}`,
    );
    console.log("-".repeat(50));
    if (this.unusedAssets.length === 0) {
      console.log(`${colors.green}✅ No unused assets found!${colors.reset}`);
      return;
    }
    this.unusedAssets.sort((a, b) => b.size - a.size);
    let totalSize = 0;
    this.unusedAssets.forEach((asset, i) => {
      totalSize += asset.size;
      console.log(`${colors.bright}${i + 1}.${colors.reset} ${asset.path}`);
      console.log(
        `   Size: ${colors.yellow}${asset.formattedSize}${colors.reset}`,
      );
    });
    console.log(
      `Total: ${this.unusedAssets.length} assets | ${ComprehensiveCleanupChecker.formatFileSize(totalSize)}`,
    );
  }

  generateKnipReport() {
    console.log(
      `\n${colors.cyan}${colors.bright}🔍 KNIP CODE ANALYSIS${colors.reset}`,
    );
    console.log("-".repeat(50));
    if (!this.knipResults || this.knipResults.error) {
      console.log(
        `${colors.yellow}⚠️  Knip: ${this.knipResults?.error || "Unknown"}${colors.reset}`,
      );
      return;
    }
    const hasUnused =
      this.knipResults.files.length > 0 ||
      this.knipResults.dependencies.length > 0 ||
      this.knipResults.devDependencies?.length > 0 ||
      this.knipResults.exports.length > 0 ||
      (this.knipResults.types?.length || 0) > 0;
    if (!hasUnused) {
      console.log(
        `${colors.green}✅ No unused files, deps, or exports${colors.reset}`,
      );
      return;
    }
    ["files", "dependencies", "devDependencies", "exports", "types"].forEach(
      (key) => {
        const items = this.knipResults[key];
        if (items && items.length > 0) {
          console.log(
            `\n${colors.magenta}${key} (${items.length}):${colors.reset}`,
          );
          items.slice(0, 20).forEach((item, i) => {
            const str =
              typeof item === "string"
                ? item
                : item.file || JSON.stringify(item);
            console.log(`  ${i + 1}. ${str}`);
          });
          if (items.length > 20)
            console.log(`  ... and ${items.length - 20} more`);
        }
      },
    );
  }

  generateCombinedSummary() {
    const total =
      this.unusedAssets.length +
      (this.knipResults?.files?.length || 0) +
      (this.knipResults?.dependencies?.length || 0) +
      (this.knipResults?.devDependencies?.length || 0) +
      (this.knipResults?.exports?.length || 0) +
      (this.knipResults?.types?.length || 0);
    if (total === 0) {
      console.log(`\n${colors.green}🎉 No cleanup needed!${colors.reset}`);
    }
  }

  async runForSingleApp() {
    this.assetFiles = [];
    this.sourceFiles = [];
    this._sourceContents = null;
    this.unusedAssets = [];
    this.knipResults = {
      files: [],
      dependencies: [],
      devDependencies: [],
      exports: [],
      types: [],
      error: null,
    };
    if (!this.validateApp()) return false;

    try {
      await this.runKnipAnalysis();
      this.collectAssetFiles();
      this.collectSourceFiles();
      if (this.assetFiles.length > 0) this.checkUnusedAssets();
      this.storeAppData(this.appName);
      if (!this.outputJson) this.generateReport();
      return true;
    } catch (error) {
      console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
      return false;
    }
  }

  storeAppData(appName) {
    const totalAssetSize = this.unusedAssets.reduce((s, a) => s + a.size, 0);
    this.aggregatedUnusedData[appName] = {
      timestamp: new Date().toISOString(),
      unused_assets: {
        count: this.unusedAssets.length,
        total_size_bytes: totalAssetSize,
        total_size_formatted:
          ComprehensiveCleanupChecker.formatFileSize(totalAssetSize),
        files: this.unusedAssets.map((a) => ({
          path: path.relative(this.appDir, a.fullPath),
          size_bytes: a.size,
          size_formatted: a.formattedSize,
        })),
      },
      unused_files: {
        count: this.knipResults?.files?.length || 0,
        files: this.knipResults?.files || [],
      },
      unused_dependencies: {
        count:
          (this.knipResults?.dependencies?.length || 0) +
          (this.knipResults?.devDependencies?.length || 0),
        dependencies: this.knipResults?.dependencies || [],
        devDependencies: this.knipResults?.devDependencies || [],
      },
      unused_exports: {
        count:
          (this.knipResults?.exports?.length || 0) +
          (this.knipResults?.types?.length || 0),
        exports: this.knipResults?.exports || [],
        types: this.knipResults?.types || [],
      },
      knip_analysis_status: this.config.knip?.enabled
        ? (this.knipResults?.error ? "failed" : "success")
        : "skipped",
      knip_error: this.knipResults?.error || null,
    };
  }

  getReportJson() {
    return {
      timestamp: new Date().toISOString(),
      total_apps_analyzed: Object.keys(this.aggregatedUnusedData).length,
      apps_data: this.aggregatedUnusedData,
    };
  }

  saveJsonReport() {
    if (this.config.report && this.config.report.saveReport === false) return;
    const reportPath = path.resolve(this.rootDir, this.unusedAssetsReportJson);
    fs.writeFileSync(
      reportPath,
      JSON.stringify(this.getReportJson(), null, 2),
    );
    if (!this.outputJson) {
      console.log(
        `${colors.green}✅ JSON report saved: ${this.unusedAssetsReportJson}${colors.reset}`,
      );
    }
  }

  generateAggregatedSummary() {
    let totalAssets = 0;
    let totalFiles = 0;
    let totalDeps = 0;
    let totalExports = 0;
    let totalSize = 0;
    Object.values(this.aggregatedUnusedData).forEach((data) => {
      totalAssets += data.unused_assets.count;
      totalFiles += data.unused_files.count;
      totalDeps += data.unused_dependencies.count;
      totalExports += data.unused_exports.count;
      totalSize += data.unused_assets.total_size_bytes;
    });
    console.log(
      `\nTotal: ${totalAssets} assets, ${totalFiles} files, ${totalDeps} deps | ${ComprehensiveCleanupChecker.formatFileSize(totalSize)}`,
    );
  }

  async runForAllApps() {
    const apps = this.getAllApps();
    if (apps.length === 0) {
      console.error(`${colors.red}No valid apps found${colors.reset}`);
      process.exit(1);
    }
    let failCount = 0;
    for (const app of apps) {
      this.appName = app;
      this.appDir = path.join(this.appsDir, app);
      this.assetsDir = path.join(
        this.appDir,
        this.config.assetsDir || "src/assets",
      );
      this.srcDir = path.join(this.appDir, this.config.srcDir || "src");
      this.scanDir = this.srcDir;
      this.compileWhitelistMatchers();
      const success = await this.runForSingleApp();
      if (success) {
        this.storeAppData(app);
      } else {
        failCount += 1;
      }
    }
    if (!this.outputJson) this.generateAggregatedSummary();
    if (!this.outputJson) this.saveJsonReport();

    if (this.outputJson) {
      process.stdout.write(
        JSON.stringify(this.getReportJson(), null, 2) + "\n",
      );
    }

    process.exit(failCount > 0 ? 1 : 0);
  }

  async run() {
    if (!this.appName) {
      this.showUsage();
      process.exit(1);
    }

    const _log = console.log;
    const _warn = console.warn;
    if (this.outputJson) {
      console.log = () => {};
      console.warn = () => {};
    }

    try {
      if (this.appName.toLowerCase() === "all") {
        await this.runForAllApps();
      } else {
        if (!this.outputJson) {
          _log(
            `${colors.cyan}🔍 Running cleanup analysis: ${this.appName}${colors.reset}\n`,
          );
        }
        const success = await this.runForSingleApp();
        if (success && this.outputJson) {
          process.stdout.write(
            JSON.stringify(this.getReportJson(), null, 2) + "\n",
          );
        }
        process.exit(success ? 0 : 1);
      }
    } finally {
      if (this.outputJson) {
        console.log = _log;
        console.warn = _warn;
      }
    }
  }
}

module.exports = ComprehensiveCleanupChecker;
