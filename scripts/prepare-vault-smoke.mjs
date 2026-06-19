#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { basename, dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pluginId = "slexkit";
const releaseAssets = ["main.js", "manifest.json", "styles.css"];
const smokeNoteName = "SlexKit Smoke.md";

function usage() {
  console.log("Usage:");
  console.log("  node scripts/prepare-vault-smoke.mjs --vault /path/to/vault [--enable] [--open] [--register-vault]");
  console.log("  node scripts/prepare-vault-smoke.mjs --vault /path/to/vault --unregister-vault");
  console.log("");
  console.log("Options:");
  console.log("  --vault   Obsidian vault folder to prepare.");
  console.log("  --enable  Add slexkit to .obsidian/community-plugins.json.");
  console.log(`  --open             Ask the system Obsidian URI handler to open "${smokeNoteName}".`);
  console.log("                     If Obsidian stays on another vault, open the folder manually.");
  console.log("  --register-vault   Add the vault to Obsidian's global vault registry before --open.");
  console.log("                     This is opt-in and creates a timestamped backup first.");
  console.log("  --unregister-vault Remove this vault path from Obsidian's global vault registry and exit.");
  console.log("  --obsidian-config  Override the Obsidian registry path for testing.");
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function readJsonIfExists(path, fallback) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
}

function defaultObsidianConfigPath() {
  if (process.platform === "win32" && process.env.APPDATA) {
    return resolve(process.env.APPDATA, "obsidian", "obsidian.json");
  }
  if (process.platform === "darwin" && process.env.HOME) {
    return resolve(process.env.HOME, "Library", "Application Support", "obsidian", "obsidian.json");
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? (process.env.HOME ? resolve(process.env.HOME, ".config") : undefined);
  if (!configHome) throw new Error("Cannot determine Obsidian config path. Pass --obsidian-config.");
  return resolve(configHome, "obsidian", "obsidian.json");
}

function samePath(left, right) {
  const leftPath = resolve(left);
  const rightPath = resolve(right);
  if (process.platform === "win32") return leftPath.toLowerCase() === rightPath.toLowerCase();
  return leftPath === rightPath;
}

function backupPath(path) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${path}.bak-${stamp}`;
}

function registerVault(vaultPath, configPath) {
  const config = readJsonIfExists(configPath, { vaults: {} });
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }
  if (!config.vaults) config.vaults = {};
  if (typeof config.vaults !== "object" || Array.isArray(config.vaults)) {
    throw new Error(`${configPath} must contain a vaults object`);
  }

  const now = Date.now();
  let vaultId = Object.keys(config.vaults).find((id) => {
    const entry = config.vaults[id];
    return entry && typeof entry.path === "string" && samePath(entry.path, vaultPath);
  });
  const created = !vaultId;
  if (!vaultId) {
    do {
      vaultId = randomBytes(8).toString("hex");
    } while (config.vaults[vaultId]);
  }

  config.vaults[vaultId] = { ...config.vaults[vaultId], path: vaultPath, ts: now, open: true };

  mkdirSync(dirname(configPath), { recursive: true });
  const backup = existsSync(configPath) ? backupPath(configPath) : undefined;
  if (backup) copyFileSync(configPath, backup);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { backup, created, vaultId };
}

function unregisterVault(vaultPath, configPath) {
  if (!existsSync(configPath)) return { backup: undefined, removedIds: [] };
  const config = readJsonIfExists(configPath, { vaults: {} });
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${configPath} must contain a JSON object`);
  }
  if (!config.vaults || typeof config.vaults !== "object" || Array.isArray(config.vaults)) {
    throw new Error(`${configPath} must contain a vaults object`);
  }

  const removedIds = [];
  for (const [vaultId, entry] of Object.entries(config.vaults)) {
    if (entry && typeof entry.path === "string" && samePath(entry.path, vaultPath)) {
      delete config.vaults[vaultId];
      removedIds.push(vaultId);
    }
  }

  if (!removedIds.length) return { backup: undefined, removedIds };
  const backup = backupPath(configPath);
  copyFileSync(configPath, backup);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return { backup, removedIds };
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

function openObsidianUri(uri) {
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

function smokeNoteUri(notePath, registeredVault) {
  if (registeredVault) {
    return `obsidian://open?vault=${encodeURIComponent(registeredVault.vaultId)}&file=${encodeURIComponent(smokeNoteName)}`;
  }
  return `obsidian://open?path=${encodeURIComponent(notePath)}`;
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

const vaultPath = resolve(vaultArg);
const shouldRegisterVault = process.argv.includes("--register-vault");
const shouldUnregisterVault = process.argv.includes("--unregister-vault");
const shouldTouchVaultRegistry = shouldRegisterVault || shouldUnregisterVault;
const obsidianConfigPath = shouldTouchVaultRegistry ? getArg("--obsidian-config") ?? defaultObsidianConfigPath() : undefined;

if (shouldUnregisterVault) {
  const unregisteredVault = unregisterVault(vaultPath, obsidianConfigPath);
  console.log(`Obsidian registry: ${obsidianConfigPath}`);
  if (unregisteredVault.removedIds.length) {
    console.log(`Removed vault id(s): ${unregisteredVault.removedIds.join(", ")}`);
    console.log(`Registry backup: ${unregisteredVault.backup}`);
  } else {
    console.log("No matching vault registration found.");
  }
  process.exit(0);
}

ensureReleaseAssets();

const obsidianDir = resolve(vaultPath, ".obsidian");
const pluginDir = resolve(obsidianDir, "plugins", pluginId);
mkdirSync(pluginDir, { recursive: true });

for (const asset of releaseAssets) {
  copyFileSync(resolve(root, asset), resolve(pluginDir, asset));
}

const notePath = writeSmokeNote(vaultPath);
if (process.argv.includes("--enable")) enablePlugin(obsidianDir);

const registeredVault = shouldRegisterVault ? registerVault(vaultPath, obsidianConfigPath) : undefined;
const openedUri = process.argv.includes("--open") ? openObsidianUri(smokeNoteUri(notePath, registeredVault)) : undefined;

console.log(`Prepared ${pluginId} in vault: ${vaultPath}`);
console.log(`Plugin folder: ${pluginDir}`);
console.log(`Smoke note: ${notePath}`);
if (registeredVault) {
  console.log(`Registered Obsidian vault id: ${registeredVault.vaultId}${registeredVault.created ? " (new)" : " (existing)"}`);
  console.log(`Obsidian registry: ${obsidianConfigPath}`);
  if (registeredVault.backup) console.log(`Registry backup: ${registeredVault.backup}`);
}
if (openedUri) {
  console.log(`Opened Obsidian URI: ${openedUri}`);
  if (registeredVault) {
    console.log("If Obsidian was already running, it may not see the new vault registry entry until restart.");
  }
  console.log(`If Obsidian did not open "${smokeNoteName}", use "Open folder as vault" and select:`);
  console.log(`  ${vaultPath}`);
}
console.log("");
console.log("Manual verification:");
console.log(`1. Open vault "${basename(vaultPath)}" in Obsidian. If --open did not open "${smokeNoteName}", use "Open folder as vault" and select the path above.`);
console.log("2. Enable SlexKit if --enable was not used.");
console.log(`3. Open "${smokeNoteName}" in reading mode.`);
console.log("4. Confirm the card renders, shows Ready, and the +1 button increments the counter.");
