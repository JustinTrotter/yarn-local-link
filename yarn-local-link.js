#!/usr/bin/env node

/**
 * yarn-local-link
 *
 * CLI to link a Node.js project (run from its root) to a local library
 * that is normally installed from npm.
 *
 * Usage:
 *   node yarn-local-link.js /path/to/local/library
 *   node yarn-local-link.js /path/to/local/library --build
 *   node yarn-local-link.js --unlink
 *
 * Features:
 * - Auto-detects package name from the local library's package.json
 * - Verifies the package is listed in the project's dependencies/devDependencies
 * - Updates package.json to point at the local path (portal: for Yarn >=2, file: for Yarn Classic)
 * - Clears Yarn cache
 * - Removes node_modules (and .yarn/cache when present)
 * - Runs yarn install to reinstall everything
 * - Supports --unlink to restore the previous package.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKUP_FILE = '.yarn-local-link-backup.json';

function die(msg) {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(msg);
}

function run(cmd, opts = {}) {
  info(`> ${cmd}`);
  try {
    return execSync(cmd, { stdio: 'inherit', ...opts });
  } catch (e) {
    die(`Command failed: ${cmd}`);
  }
}

function getYarnMajor() {
  try {
    const version = execSync('yarn --version', { encoding: 'utf8' }).trim();
    const major = parseInt(version.split('.')[0], 10);
    return Number.isNaN(major) ? 1 : major;
  } catch {
    die('yarn is not available in PATH. Please install Yarn.');
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    die(`Failed to read or parse ${file}: ${e.message}`);
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function findDepKey(pkg, name) {
  const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
  for (const section of sections) {
    if (pkg[section] && Object.prototype.hasOwnProperty.call(pkg[section], name)) {
      return section;
    }
  }
  return null;
}

function unlink() {
  const cwd = process.cwd();
  const backupPath = path.join(cwd, BACKUP_FILE);
  if (!fs.existsSync(backupPath)) {
    die(`No backup found (${BACKUP_FILE}). Nothing to restore.`);
  }
  const original = fs.readFileSync(backupPath, 'utf8');
  fs.writeFileSync(path.join(cwd, 'package.json'), original);
  fs.unlinkSync(backupPath);
  info('Restored original package.json from backup.');

  // Clean and reinstall so the registry version is pulled again
  cleanAndInstall();
  info('Unlinked and reinstalled. The package should now come from the registry.');
}

function cleanAndInstall() {
  const yarnMajor = getYarnMajor();
  info(`Detected Yarn major version: ${yarnMajor}`);

  // Cache clean
  if (yarnMajor >= 2) {
    run('yarn cache clean --all');
  } else {
    run('yarn cache clean');
  }

  // Remove node_modules
  const nm = path.join(process.cwd(), 'node_modules');
  if (fs.existsSync(nm)) {
    info('Removing node_modules...');
    fs.rmSync(nm, { recursive: true, force: true });
  }

  // Remove .yarn/cache if it exists (Berry)
  const cacheDir = path.join(process.cwd(), '.yarn', 'cache');
  if (fs.existsSync(cacheDir)) {
    info('Removing .yarn/cache...');
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }

  // Reinstall
  run('yarn install');
}

function link(libPath, shouldBuild) {
  const cwd = process.cwd();
  const projectPkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(projectPkgPath)) {
    die('No package.json found in the current directory. Run this from the project root.');
  }

  const absLibPath = path.resolve(libPath);
  const libPkgPath = path.join(absLibPath, 'package.json');
  if (!fs.existsSync(libPkgPath)) {
    die(`No package.json found in the library directory: ${absLibPath}`);
  }

  const projectPkg = readJson(projectPkgPath);
  const libPkg = readJson(libPkgPath);

  const packageName = libPkg.name;
  if (!packageName) {
    die('Library package.json has no "name" field.');
  }

  info(`Detected local library package name: ${packageName}`);

  const section = findDepKey(projectPkg, packageName);
  if (!section) {
    die(
      `Package "${packageName}" is not listed in dependencies, devDependencies, peerDependencies, or optionalDependencies of this project.`
    );
  }

  const currentValue = projectPkg[section][packageName];
  info(`Current entry in ${section}: "${currentValue}"`);

  // Backup original package.json if not already backed up
  const backupPath = path.join(cwd, BACKUP_FILE);
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(projectPkgPath, backupPath);
    info(`Backed up original package.json to ${BACKUP_FILE}`);
  }

  // Compute relative path (posix style for package.json)
  let relative = path.relative(cwd, absLibPath);
  relative = relative.split(path.sep).join('/');
  if (!relative.startsWith('.')) {
    relative = './' + relative;
  }

  const yarnMajor = getYarnMajor();
  const protocol = yarnMajor >= 2 ? 'portal:' : 'file:';
  const newValue = `${protocol}${relative}`;

  info(`Updating ${section}["${packageName}"] to "${newValue}"`);
  projectPkg[section][packageName] = newValue;
  writeJson(projectPkgPath, projectPkg);

  if (shouldBuild) {
    info('Building the local library...');
    const hasBuild = libPkg.scripts && libPkg.scripts.build;
    if (hasBuild) {
      run('yarn build', { cwd: absLibPath });
    } else {
      info('No "build" script found in the library; skipping build.');
    }
  }

  // Ensure the library itself has its dependencies installed (especially for portal/file)
  info('Ensuring dependencies are installed in the local library...');
  if (!fs.existsSync(path.join(absLibPath, 'node_modules'))) {
    run('yarn install', { cwd: absLibPath });
  } else {
    info('Library already has node_modules; skipping its install.');
  }

  cleanAndInstall();

  info('');
  info('Success! The project is now linked to the local library.');
  info(`  Package: ${packageName}`);
  info(`  Path:    ${absLibPath}`);
  info(`  Protocol: ${protocol}`);
  info('');
  info('To restore the original registry dependency later, run:');
  info('  node yarn-local-link.js --unlink');
  info('');
  info('Note: With file: (Yarn Classic) changes in the library require re-running this tool or yarn install.');
  info('      With portal: (Yarn Berry) the link is a symlink and source changes are usually picked up immediately.');
}

// --- CLI ---
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage:
  node yarn-local-link.js <path-to-local-library> [--build]
  node yarn-local-link.js --unlink

Options:
  --build    Run "yarn build" in the local library before linking (if a build script exists)
  --unlink   Restore the original package.json and reinstall from the registry
  --help     Show this help
`);
  process.exit(0);
}

if (args.includes('--unlink')) {
  unlink();
} else {
  const libArg = args.find(a => !a.startsWith('--'));
  if (!libArg) {
    die('Please provide the path to the local library directory.\nRun with --help for usage.');
  }
  const shouldBuild = args.includes('--build');
  link(libArg, shouldBuild);
}
