#!/usr/bin/env node
/**
 * Version bump script for Expo apps
 * Usage: node scripts/bump-version.js [patch|minor|major]
 */

const fs = require('fs');
const { execSync } = require('child_process');

const bumpType = process.argv[2] || 'patch';
if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node bump-version.js [patch|minor|major]');
  process.exit(1);
}

// Read app.json
const appJsonPath = './app.json';
const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

// Parse current version
const currentVersion = appJson.expo.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Bump version
let newVersion;
switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
}

// Update app.json
appJson.expo.version = newVersion;
fs.writeFileSync(appJsonPath, JSON.stringify(appJson, null, 2) + '\n');

console.log(`✅ Version bumped: ${currentVersion} → ${newVersion}`);

// Git commit and tag
try {
  execSync(`git add app.json`);
  execSync(`git commit -m "chore: bump version to ${newVersion}"`);
  execSync(`git tag v${newVersion}`);
  console.log(`✅ Git commit and tag v${newVersion} created`);
  console.log(`\n📦 Run 'git push && git push --tags' to publish`);
} catch (e) {
  console.log('⚠️  Git commit/tag skipped (uncommitted changes or not a git repo)');
}
