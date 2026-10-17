# yarn-local-link

A small, fully local CLI that links a Node.js project to a local copy of one of its npm dependencies (instead of the registry version). It runs entirely on your machine with Node.js and Yarn — no external services required.

It is designed to be run from the **root of the consuming project**.

## Requirements

- Node.js >= 14
- Yarn (Classic 1.x or Berry 2+)

## Installation

### Option 1: Run directly (no install)

```bash
# Clone or download the script, then from your project root:
node /path/to/yarn-local-link.js /path/to/your/local/library
```

### Option 2: Install globally with Yarn or npm

```bash
# From the repo directory
yarn global add .          # or: npm install -g .

# Then from any project root:
yarn-local-link /path/to/your/local/library
```

### Option 3: Use with yarn dlx / npx (after publishing, or from git)

```bash
yarn dlx yarn-local-link /path/to/library
# or
npx yarn-local-link /path/to/library
```

## Usage

```bash
# From your project root
yarn-local-link /path/to/your/local/library

# Optionally build the library first (if it has a "build" script)
yarn-local-link /path/to/your/local/library --build

# Restore the original registry dependency later
yarn-local-link --unlink
```

## What it does

1. Reads the `name` field from the local library’s `package.json`.
2. Confirms that name appears in the project’s `dependencies`, `devDependencies`, etc.
3. Backs up the project’s `package.json` (to `.yarn-local-link-backup.json`).
4. Rewrites the dependency entry to a local protocol:
   - Yarn ≥ 2 → `portal:../relative/path` (symlink + proper dependency resolution)
   - Yarn Classic → `file:../relative/path`
5. Optionally runs `yarn build` inside the library.
6. Ensures the library has its own dependencies installed.
7. Clears the Yarn cache, deletes `node_modules` (and `.yarn/cache` when present), then runs `yarn install`.

## Restoring

```bash
yarn-local-link --unlink
```

This restores the original `package.json` from the backup and reinstalls so the package comes from the registry again.

## Notes

- With `portal:` (Yarn Berry) source changes in the library are usually visible immediately.
- With `file:` (Yarn Classic) the package is copied; re-run the tool (or `yarn install`) after significant changes.
- The tool does not modify `yarn.lock` by hand; `yarn install` updates it as needed.
- Works with scoped package names (`@scope/name`).
- Fully offline / local after you have the script — only uses your local Yarn and Node.

## Example

```text
my-app/                  ← run the CLI here
  package.json           ("my-lib": "^1.2.3")
  ...

../my-lib/               ← point the CLI at this directory
  package.json           ("name": "my-lib")
  ...
```

```bash
cd my-app
yarn-local-link ../my-lib
```

After that, `my-app` uses the local `my-lib` sources.
