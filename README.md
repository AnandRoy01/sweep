# sweep

CLI to find unused assets, files, dependencies, and exports in frontend apps. Works with monorepos and single-app setups, with extensive configuration for whitelisting and customization.

## Install

```bash
npm install -g sweep
# or
pnpm add -g sweep
# or run without installing
npx sweep
```

## Usage

```bash
# Single repo (most common)
npx sweep
# or
sweep .

# Analyze a project by path (works great when you're in a parent folder)
npx sweep ../my-frontend
npx sweep ./packages/web

# Monorepo (apps/ convention)
sweep <app-name>   # resolves to apps/<app-name>
sweep all          # analyze all apps in apps/

# Output as JSON (for piping, CI, or programmatic use)
sweep --json
sweep --json > report.json

# Enable Knip (unused deps, exports) – optional, off by default
sweep --knip
```

## Configuration

Configuration is loaded in this order (later overrides earlier):

1. **Default values**
2. **`package.json`** – `"sweep"` field
3. **Config file** – one of:
   - `sweep.config.js`
   - `sweep.config.cjs`
   - `sweep.config.mjs`
   - `sweep.config.json`
   - `.sweep.js`
   - `.sweep.json`

### Config Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rootDir` | `string` | `process.cwd()` | Project root |
| `appsDir` | `string` | `'apps'` | Monorepo apps directory |
| `assetsDir` | `string` | `'src/assets'` | Assets directory per app |
| `srcDir` | `string` | `'src'` | Source directory per app |
| `scanDir` | `string` | `srcDir` | Directory to scan for assets |
| `assetExtensions` | `string[]` | See below | Asset file extensions |
| `sourceExtensions` | `string[]` | `['.js', '.jsx', '.ts', '.tsx']` | Source file extensions |
| `excludeDirs` | `string[]` | `['node_modules', '.git', ...]` | Directories to skip |
| `whitelist` | `object` | `{}` | Whitelist patterns (see below) |
| `knip.enabled` | `boolean` | `false` | Enable Knip (unused deps/exports). Or use `--knip` flag. |
| `knip.commands` | `string[]` | `['pnpm dlx knip ...', 'npx knip ...']` | Knip commands to try |
| `report.jsonOutput` | `string` | `'unused-assets-report.json'` | JSON report path |
| `report.saveReport` | `boolean` | `true` | Save JSON report |

### Whitelist

Patterns exclude files from being flagged as unused.

**Global patterns** (all apps):

```js
whitelist: {
  patterns: [
    'src/assets/logo.png',        // Exact path
    'src/assets/images/*',        // All in folder
    'src/assets/icons/**',        // Folder + subfolders
    '*/legacy/*',                 // Any legacy folder
    '*.svg',                      // All SVG files
    'regex:^src/assets/icons/.*\\.svg$',  // Regex
  ],
}
```

**Per-app patterns**:

```js
whitelist: {
  products: {
    'my-app': ['src/assets/placeholder.svg'],
    toolkit: ['src/assets/third-party/**'],
  },
}
```

**Pattern types**:

- **Exact path**: `src/assets/logo.png`
- **Glob**: `src/assets/images/*`, `src/assets/icons/**`
- **Regex**: `regex:^src/assets/icons/.*\\.svg$` or `/^src\/assets\/icons\/.*\.svg$/`

### Example package.json

```json
{
  "sweep": {
    "whitelist": {
      "patterns": ["src/assets/logo.svg"],
      "products": {
        "app-a": ["src/assets/legacy/*"]
      }
    },
    "assetExtensions": [".jpg", ".png", ".svg", ".webp"]
  }
}
```

### Example config file

See `sweep.config.example.js` for a full example. Copy it to `sweep.config.js` and adjust.

## Monorepo structure

Expected layout for `sweep all`:

```
project-root/
├── apps/
│   ├── app-a/
│   │   ├── src/
│   │   │   ├── assets/   # scanned for assets
│   │   │   └── *.tsx    # scanned for references
│   │   └── package.json # for Knip
│   └── app-b/
│       └── ...
└── sweep.config.js
```

Customize `appsDir`, `srcDir`, and `assetsDir` if your layout differs.

## Output

- **Console**: Summary of unused assets (and Knip results when `--knip` or `knip.enabled` is used)
- **JSON report** (when `report.saveReport` is true): `unused-assets-report.json`
- **`--json`**: Print JSON report to stdout only (no console summary). Use for piping or CI:
  ```bash
  sweep --json > report.json
  sweep --json | jq '.apps_data'
  ```

## Publishing

To publish this package to npm:

1. Initialize as a git repo: `git init`
2. Update `package.json` with your `repository` URL and `author`.
3. Ensure the package name `sweep` is available on npm (or use a scoped name like `@your-org/sweep`).
4. Run:
   ```bash
   npm login
   npm publish
   ```

## License

MIT
