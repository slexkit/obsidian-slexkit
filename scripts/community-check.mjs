#!/usr/bin/env node
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repo = "slexkit/obsidian-slexkit";
const communityPluginsUrl =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json";
const removedPluginsUrl =
  "https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins-removed.json";

const requiredManifestKeys = ["id", "name", "description", "author", "version", "minAppVersion", "isDesktopOnly"];
const allowedManifestKeys = [...requiredManifestKeys, "authorUrl", "fundingUrl", "helpUrl"];
const requiredRootAssets = ["main.js", "manifest.json", "styles.css", "versions.json"];
const requiredReleaseAssets = ["main.js", "manifest.json", "styles.css", "versions.json"];
const forbiddenCssPatterns = [
  ["!important", /!important/],
  [":has()", /:has\(/],
  ["display: contents", /display\s*:\s*contents/],
  ["text-decoration", /text-decoration/],
  ["scrollbar CSS", /scrollbar-(?:width|color|gutter)|::-webkit-scrollbar/],
  ["clip-path", /clip-path/],
  ["-webkit-mask", /-webkit-mask/],
  ["system font keywords", /\bsystem-ui\b|-apple-system|BlinkMacSystemFont/],
];

const errors = [];
const warnings = [];

function pass(message) {
  console.log(`PASS ${message}`);
}

function fail(message) {
  errors.push(message);
  console.error(`FAIL ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.warn(`WARN ${message}`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function readText(path) {
  return readFileSync(resolve(root, path), "utf8");
}

async function fetchJson(url) {
  const response = await fetchWithRetry(url, "application/json");
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetchWithRetry(url, "text/plain, application/octet-stream");
  if (!response.ok) throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  return response.text();
}

async function fetchWithRetry(url, accept) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await fetch(url, {
        headers: {
          "User-Agent": "slexkit-community-check",
          Accept: accept,
        },
      });
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
    }
  }
  throw lastError;
}

function checkManifest(manifest, rootPackage) {
  for (const key of requiredManifestKeys) {
    if (!Object.hasOwn(manifest, key)) fail(`manifest.json is missing required key: ${key}`);
  }
  for (const key of Object.keys(manifest)) {
    if (!allowedManifestKeys.includes(key)) fail(`manifest.json has invalid key: ${key}`);
  }
  if (manifest.version !== rootPackage.version) {
    fail(`manifest version ${manifest.version} does not match package version ${rootPackage.version}`);
  }
  if (!/^[0-9.]+$/.test(manifest.version)) fail("manifest version must contain only numbers and dots");
  if (!/^[a-z0-9-_]+$/.test(manifest.id)) fail("manifest id must be lowercase alphanumeric, dash, or underscore");
  if (/obsidian/i.test(manifest.id)) fail("manifest id must not include Obsidian");
  if (/plugin$/i.test(manifest.id)) fail("manifest id must not end with plugin");
  if (/obsidian/i.test(manifest.name)) fail("manifest name must not include Obsidian");
  if (/plugin$/i.test(manifest.name)) fail("manifest name must not end with Plugin");
  if (/obsidian/i.test(manifest.description)) fail("manifest description must not include Obsidian");
  if (!/[.?!)]$/.test(manifest.description)) fail("manifest description must end with . ? ! or )");
  if (manifest.description.length > 250) fail("manifest description must be 250 characters or fewer");
  if (manifest.description.toLowerCase().includes("this plugin")) {
    warn("manifest description should avoid phrases like 'this plugin'");
  }
  if (manifest.isDesktopOnly !== false) {
    warn("manifest isDesktopOnly is not false; make sure Node/Electron APIs are desktop-only if used");
  }
  pass("manifest fields match community directory constraints");
}

function checkRootAssets(manifest, versions, styles) {
  for (const asset of requiredRootAssets) {
    try {
      const info = statSync(resolve(root, asset));
      if (!info.isFile() || info.size <= 0) fail(`${asset} is missing or empty`);
    } catch {
      fail(`${asset} is missing`);
    }
  }
  if (versions[manifest.version] !== manifest.minAppVersion) {
    fail(`versions.json is missing ${manifest.version}: ${manifest.minAppVersion}`);
  }
  for (const [label, pattern] of forbiddenCssPatterns) {
    if (pattern.test(styles)) fail(`styles.css contains Obsidian lint risk: ${label}`);
  }
  pass("root release assets and CSS lint-risk guard passed");
}

function checkReadme(readme) {
  const required = [
    "## Install from Community Plugins",
    "## Install with BRAT",
    "## Manual Install",
    "https://github.com/slexkit/obsidian-slexkit",
    ".obsidian/plugins/slexkit/",
    "main.js",
    "manifest.json",
    "styles.css",
    "trusted runtime",
  ];
  for (const text of required) {
    if (!readme.includes(text)) fail(`README.md is missing expected submission/install text: ${text}`);
  }
  pass("README install and boundary sections are present");
}

async function checkCommunityDirectory(manifest) {
  const [plugins, removed] = await Promise.all([fetchJson(communityPluginsUrl), fetchJson(removedPluginsUrl)]);
  const conflicts = plugins.filter(
    (plugin) => plugin.id === manifest.id || plugin.name === manifest.name || plugin.repo === repo,
  );
  const removedConflicts = removed.filter((plugin) => plugin.id === manifest.id || plugin.name === manifest.name);
  if (conflicts.length) fail(`community-plugins.json already contains this id/name/repo: ${JSON.stringify(conflicts)}`);
  else pass("community-plugins.json has no id/name/repo conflict");
  if (removedConflicts.length) warn(`community-plugins-removed.json has a historical id/name match: ${JSON.stringify(removedConflicts)}`);
  else pass("community-plugins-removed.json has no id/name conflict");
}

async function checkGitHubRelease(manifest) {
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/tags/${manifest.version}`);
  if (release.draft) fail(`GitHub release ${manifest.version} is a draft`);
  if (release.prerelease) fail(`GitHub release ${manifest.version} is a prerelease`);
  const assets = new Map((release.assets ?? []).map((asset) => [asset.name, asset]));
  for (const asset of requiredReleaseAssets) {
    if (!assets.has(asset)) fail(`GitHub release ${manifest.version} is missing asset: ${asset}`);
  }
  const releaseManifestAsset = assets.get("manifest.json");
  const releaseStylesAsset = assets.get("styles.css");
  if (releaseManifestAsset?.browser_download_url) {
    const releaseManifest = JSON.parse(await fetchText(releaseManifestAsset.browser_download_url));
    if (releaseManifest.version !== manifest.version) {
      fail(`release manifest version ${releaseManifest.version} does not match root manifest ${manifest.version}`);
    }
    if (releaseManifest.description !== manifest.description) {
      fail("release manifest description does not match root manifest");
    }
  }
  if (releaseStylesAsset?.browser_download_url) {
    const releaseStyles = await fetchText(releaseStylesAsset.browser_download_url);
    for (const [label, pattern] of forbiddenCssPatterns) {
      if (pattern.test(releaseStyles)) fail(`release styles.css contains Obsidian lint risk: ${label}`);
    }
  }
  pass(`GitHub release ${manifest.version} has required assets and synced metadata`);
}

async function checkNpm(rootPackage) {
  try {
    const data = await fetchJson(`https://registry.npmjs.org/${encodeURIComponent(rootPackage.name)}`);
    const versions = Object.keys(data.versions ?? {});
    if (!versions.includes(rootPackage.version)) {
      warn(`${rootPackage.name}@${rootPackage.version} is not published to npm; GitHub release install is still valid`);
    } else {
      pass(`${rootPackage.name}@${rootPackage.version} is published to npm`);
    }
  } catch (error) {
    warn(`npm registry check skipped: ${error.message}`);
  }
}

async function main() {
  const rootPackage = readJson("package.json");
  const manifest = readJson("manifest.json");
  const versions = readJson("versions.json");
  const styles = readText("styles.css");
  const readme = readText("README.md");

  checkManifest(manifest, rootPackage);
  checkRootAssets(manifest, versions, styles);
  checkReadme(readme);
  await checkCommunityDirectory(manifest);
  await checkGitHubRelease(manifest);
  await checkNpm(rootPackage);

  const communityEntry = {
    id: manifest.id,
    name: manifest.name,
    author: manifest.author,
    description: manifest.description,
    repo,
  };

  console.log("\ncommunity-plugins.json entry:");
  console.log(JSON.stringify(communityEntry, null, 2));
  console.log("\nManual submission confirmations still needed:");
  console.log("- Test the plugin in Obsidian desktop reading mode with a real vault.");
  console.log("- Confirm whether mobile testing is required before submission.");
  console.log("- Review current Developer policies and Plugin guidelines before opening the PR.");
  console.log("- Ensure maintainers can edit the PR branch if submitting through a fork.");

  if (warnings.length) console.warn(`\n${warnings.length} warning(s).`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s).`);
    process.exit(1);
  }
  console.log("\nCommunity submission preflight passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
