#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ComprehensiveCleanupChecker = require("../lib/checker");
const { loadConfig } = require("../lib/config");

function printHelp() {
  // Keep this lightweight; the checker prints richer help when it runs.
  console.log("sweep");
  console.log("");
  console.log("Usage:");
  console.log(
    "  sweep                             # Analyze current directory",
  );
  console.log(
    "  sweep .                           # Analyze current directory",
  );
  console.log(
    "  sweep <path>                      # Analyze a project by path",
  );
  console.log(
    "  sweep <app-name>                  # Analyze apps/<app-name> (monorepo)",
  );
  console.log(
    "  sweep all                         # Analyze all apps in apps/",
  );
  console.log("");
  console.log("Options:");
  console.log(
    "  -C, --cwd <dir>                    # Base directory for resolving <path> and config",
  );
  console.log(
    "  -j, --json                          # Output report as JSON to stdout",
  );
  console.log(
    "  --knip                              # Enable Knip (unused deps/exports) analysis",
  );
  console.log("  -h, --help                         # Show help");
  console.log("  -v, --version                      # Show version");
}

function parseArgs(argv) {
  const result = {
    cwd: process.cwd(),
    target: ".",
    help: false,
    version: false,
    json: false,
    knip: false,
  };

  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      result.help = true;
      continue;
    }
    if (arg === "-v" || arg === "--version") {
      result.version = true;
      continue;
    }
    if (arg === "-j" || arg === "--json") {
      result.json = true;
      continue;
    }
    if (arg === "--knip") {
      result.knip = true;
      continue;
    }
    if (arg === "-C" || arg === "--cwd") {
      const next = argv[i + 1];
      if (!next) {
        throw new Error("Missing value for --cwd");
      }
      result.cwd = path.resolve(process.cwd(), next);
      i += 1;
      continue;
    }
    if (arg && arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    }
    positionals.push(arg);
  }

  if (positionals.length > 1) {
    throw new Error(
      'Too many arguments. Pass a single <path>, <app-name>, or "all".',
    );
  }
  if (positionals.length === 1) {
    result.target = positionals[0];
  }

  return result;
}

async function main() {
  const pkg = require("../package.json");
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    console.error("");
    printHelp();
    process.exit(1);
  }

  if (args.help) {
    printHelp();
    process.exit(0);
  }
  if (args.version) {
    console.log(pkg.version);
    process.exit(0);
  }

  const baseCwd = path.resolve(args.cwd || process.cwd());

  // Default behavior: treat "no args" as "analyze this directory".
  const rawTarget = args.target || ".";
  const target = String(rawTarget).trim() || ".";

  // If the target resolves to an existing directory, treat it as a project path.
  // Otherwise, treat it as an app name under appsDir (monorepo).
  let appName;
  let rootDirForConfig;
  let appDirOverride;

  if (target.toLowerCase() === "all") {
    appName = "all";
    rootDirForConfig = baseCwd;
  } else if (target === "." || target === "./") {
    rootDirForConfig = baseCwd;
    appDirOverride = baseCwd;
    appName = path.basename(baseCwd) || "current";
  } else {
    const candidateDir = path.resolve(baseCwd, target);
    if (
      fs.existsSync(candidateDir) &&
      fs.statSync(candidateDir).isDirectory()
    ) {
      rootDirForConfig = candidateDir;
      appDirOverride = candidateDir;
      appName = path.basename(candidateDir) || "current";
    } else {
      rootDirForConfig = baseCwd;
      appName = target;
    }
  }

  const config = loadConfig(rootDirForConfig);
  const rootDir = config.rootDir || rootDirForConfig;
  if (args.knip) {
    config.knip = config.knip || {};
    config.knip.enabled = true;
  }

  const checker = new ComprehensiveCleanupChecker({
    appName,
    rootDir,
    appDir: appDirOverride,
    config,
    outputJson: args.json,
  });

  try {
    await checker.run();
  } catch (error) {
    console.error(`Unexpected error: ${error.message}`);
    process.exit(1);
  }
}

main();
