# unused-sweep

CLI to find unused assets, files, dependencies, and exports in frontend apps. Works with monorepos and single-app setups, with whitelisting and optional [Knip](https://github.com/webpro/knip) integration.

## Install

```bash
npm install -g unused-sweep
# or
pnpm add -g unused-sweep
# or run without installing
npx unused-sweep
```

## Usage

```bash
# Single repo (most common)
npx unused-sweep
# or, after global install
unused-sweep .

# Analyze a project by path
npx unused-sweep ../my-frontend
npx unused-sweep ./packages/web

# Monorepo (apps/ convention)
unused-sweep <app-name>   # resolves to apps/<app-name>
unused-sweep all          # analyze all apps in apps/

# JSON to stdout (CI, piping)
unused-sweep --json
unused-sweep --json > report.json

# Optional Knip (unused deps / exports)
unused-sweep --knip
```

## Configuration

Loaded in this order (later overrides earlier):

1. **Defaults**
2. **`package.json`** – `"unused-sweep"` or `"unusedSweep"` (legacy: `"sweep"`, `"find-unused-assets"`)
3. **Config file** – first match wins:
   - `unused-sweep.config.js` (and `.cjs`, `.mjs`, `.json`)
   - `.unused-sweep.js` / `.unused-sweep.json`
   - Legacy: `sweep.config.*`, `.sweep.*`

### Config options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rootDir` | `string` | `process.cwd()` | Project root |
| `appsDir` | `string` | `'apps'` | Monorepo apps directory |
| `assetsDir` | `string` | `'src/assets'` | Assets directory per app |
| `srcDir` | `string` | `'src'` | Source directory per app |
| `scanDir` | `string` | `srcDir` | Directory scanned for assets |
| `assetExtensions` | `string[]` | (see defaults) | Asset extensions |
| `sourceExtensions` | `string[]` | `['.js', '.jsx', '.ts', '.tsx']` | Source extensions |
| `excludeDirs` | `string[]` | `['node_modules', '.git', ...]` | Skipped directories |
| `whitelist` | `object` | `{}` | Whitelist patterns |
| `knip.enabled` | `boolean` | `false` | Run Knip; or use `--knip` |
| `knip.commands` | `string[]` | (see defaults) | Knip commands to try |
| `report.jsonOutput` | `string` | `'unused-assets-report.json'` | JSON report path |
| `report.saveReport` | `boolean` | `true` | Write JSON report file |

### Example `package.json`

```json
{
  "unused-sweep": {
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

See `unused-sweep.config.example.js`. Copy to `unused-sweep.config.js` and adjust.

## Monorepo layout

Expected for `unused-sweep all`:

```
project-root/
├── apps/
│   ├── app-a/
│   │   ├── src/
│   │   └── package.json
│   └── app-b/
└── unused-sweep.config.js
```

## Output

- **Console**: summary of unused assets (and Knip when enabled)
- **JSON file** (if `report.saveReport`): `unused-assets-report.json` (or `report.jsonOutput`)
- **`--json`**: print report to stdout only

## Publish (maintainers)

```bash
npm login
npm publish --dry-run
npm publish
```

## License

MIT
