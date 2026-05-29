#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const dryRun = process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const useProvenance = process.env.GITHUB_ACTIONS === "true" || process.argv.includes("--provenance");

function run(command, args, options = {}) {
  const isWindowsCmd = process.platform === "win32" && command.endsWith(".cmd");
  const output = execFileSync(
    isWindowsCmd ? "cmd.exe" : command,
    isWindowsCmd ? ["/d", "/s", "/c", command, ...args] : args,
    {
      cwd: options.cwd ?? root,
      encoding: "utf8",
      stdio: options.stdio ?? "pipe",
      shell: false,
    },
  );
  return String(output ?? "").trim();
}

function packageExists(name, version) {
  try {
    run(npmCommand, ["view", `${name}@${version}`, "version"]);
    return true;
  } catch {
    return false;
  }
}

if (!pkg.name || !pkg.version) {
  throw new Error("package.json must include name and version");
}

const id = `${pkg.name}@${pkg.version}`;
if (packageExists(pkg.name, pkg.version)) {
  console.log(`skip already published: ${id}`);
  process.exit(0);
}

const publishArgs = ["publish"];
if (useProvenance) publishArgs.push("--provenance");
if (pkg.name.startsWith("@")) publishArgs.push("--access", "public");

if (dryRun) {
  console.log(`would publish: ${id}`);
  console.log(`npm ${publishArgs.join(" ")}`);
  process.exit(0);
}

console.log(`publishing: ${id}`);
run(npmCommand, publishArgs, { stdio: "inherit" });
