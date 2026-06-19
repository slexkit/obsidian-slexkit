#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repo = "slexkit/obsidian-slexkit";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

function usage() {
  console.log("Usage:");
  console.log("  node scripts/apply-community-entry.mjs --print");
  console.log("  node scripts/apply-community-entry.mjs --file /path/to/community-plugins.json");
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function buildEntry() {
  const manifest = readJson("manifest.json");
  return {
    id: manifest.id,
    name: manifest.name,
    author: manifest.author,
    description: manifest.description,
    repo,
  };
}

function assertNoConflict(plugins, entry) {
  const conflict = plugins.find(
    (plugin) => plugin.id === entry.id || plugin.name === entry.name || plugin.repo === entry.repo,
  );
  if (conflict) {
    throw new Error(`community-plugins.json already contains this id/name/repo: ${JSON.stringify(conflict)}`);
  }
}

const entry = buildEntry();

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

if (process.argv.includes("--print")) {
  console.log(JSON.stringify(entry, null, 2));
  process.exit(0);
}

const file = getArg("--file");
if (!file) {
  usage();
  process.exit(1);
}

const plugins = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(plugins)) throw new Error(`${file} must contain a JSON array`);

assertNoConflict(plugins, entry);
plugins.push(entry);
writeFileSync(file, `${JSON.stringify(plugins, null, 2)}\n`, "utf8");
console.log(`Added ${entry.id} to ${file}`);
