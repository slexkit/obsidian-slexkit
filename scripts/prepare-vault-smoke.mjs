#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { basename, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pluginId = "slexkit";
const releaseAssets = ["main.js", "manifest.json", "styles.css"];
const smokeNoteName = "SlexKit Smoke.md";

function usage() {
  console.log("Usage:");
  console.log("  node scripts/prepare-vault-smoke.mjs --vault /path/to/vault [--enable] [--open]");
  console.log("");
  console.log("Options:");
  console.log("  --vault   Obsidian vault folder to prepare.");
  console.log("  --enable  Add slexkit to .obsidian/community-plugins.json.");
  console.log("  --open    Open the vault with the system Obsidian URI handler after preparation.");
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function ensureReleaseAssets() {
  for (const asset of releaseAssets) {
    const path = resolve(root, asset);
    if (!existsSync(path) || !statSync(path).isFile() || statSync(path).size <= 0) {
      throw new Error(`Missing release asset: ${asset}. Run bun run build first.`);
    }
  }
}

function writeSmokeNote(vaultPath) {
  const notePath = resolve(vaultPath, smokeNoteName);
  const source = `# SlexKit Smoke

This note verifies that the SlexKit plugin renders explicit \`slex\` fences in reading mode.

\`\`\`slex
{
  slex: "0.1",
  namespace: "obsidian_smoke",
  g: { count: 0 },
  layout: {
    "card:status": {
      title: "SlexKit smoke",
      "badge:ready": { label: "Ready", tone: "success" },
      "text:count": { "$text": "'Clicks: ' + g.count" },
      "button:add": {
        label: "+1",
        onclick: "g.count++"
      }
    }
  }
}
\`\`\`

Fallback: SlexKit smoke Ready Clicks: 0.
`;
  writeFileSync(notePath, source, "utf8");
  return notePath;
}

function enablePlugin(obsidianDir) {
  const communityPluginsPath = resolve(obsidianDir, "community-plugins.json");
  const plugins = readJsonIfExists(communityPluginsPath, []);
  if (!Array.isArray(plugins)) throw new Error(`${communityPluginsPath} must contain a JSON array`);
  if (!plugins.includes(pluginId)) plugins.push(pluginId);
  writeFileSync(communityPluginsPath, `${JSON.stringify(plugins, null, 2)}\n`, "utf8");
}

function openVault(vaultPath) {
  const uri = `obsidian://open?path=${encodeURIComponent(vaultPath)}`;
  if (process.platform === "win32") {
    spawn("cmd.exe", ["/d", "/s", "/c", "start", "", uri], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    }).unref();
    return uri;
  }
  if (process.platform === "darwin") {
    spawn("open", [uri], { detached: true, stdio: "ignore" }).unref();
    return uri;
  }
  spawn("xdg-open", [uri], { detached: true, stdio: "ignore" }).unref();
  return uri;
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const vaultArg = getArg("--vault") ?? process.env.OBSIDIAN_VAULT;
if (!vaultArg) {
  usage();
  process.exit(1);
}

ensureReleaseAssets();

const vaultPath = resolve(vaultArg);
const obsidianDir = resolve(vaultPath, ".obsidian");
const pluginDir = resolve(obsidianDir, "plugins", pluginId);
mkdirSync(pluginDir, { recursive: true });

for (const asset of releaseAssets) {
  copyFileSync(resolve(root, asset), resolve(pluginDir, asset));
}

const notePath = writeSmokeNote(vaultPath);
if (process.argv.includes("--enable")) enablePlugin(obsidianDir);
const openedUri = process.argv.includes("--open") ? openVault(vaultPath) : undefined;

console.log(`Prepared ${pluginId} in vault: ${vaultPath}`);
console.log(`Plugin folder: ${pluginDir}`);
console.log(`Smoke note: ${notePath}`);
if (openedUri) console.log(`Opened Obsidian URI: ${openedUri}`);
console.log("");
console.log("Manual verification:");
console.log(`1. Open vault "${basename(vaultPath)}" in Obsidian if --open was not used.`);
console.log("2. Enable SlexKit if --enable was not used.");
console.log(`3. Open "${smokeNoteName}" in reading mode.`);
console.log("4. Confirm the card renders, shows Ready, and the +1 button increments the counter.");
