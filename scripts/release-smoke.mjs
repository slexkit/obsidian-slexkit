#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

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

for (const asset of ["main.js", "manifest.json", "styles.css"]) {
  if (!existsSync(resolve(root, asset))) {
    throw new Error(`missing release asset: ${asset}`);
  }
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
if (manifest.version !== pkg.version) {
  throw new Error(`manifest version ${manifest.version} does not match package version ${pkg.version}`);
}

execFileSync("node", [
  "-e",
  `
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    return {
      MarkdownRenderChild: class { constructor(containerEl) { this.containerEl = containerEl; } },
      Plugin: class { registerMarkdownCodeBlockProcessor() {} },
    };
  }
  return originalLoad.apply(this, arguments);
};
const plugin = require("./main.js");
if (typeof plugin !== "function") throw new Error("plugin constructor missing");
if (plugin.default !== plugin) throw new Error("default export mismatch");
`,
], { cwd: root, stdio: "inherit" });

const packDir = mkdtempSync(join(tmpdir(), "slexkit-obsidian-pack-"));
try {
  const packed = run(npmCommand, ["pack", "--json", "--pack-destination", packDir]);
  const packInfo = JSON.parse(packed)[0];
  if (!packInfo?.filename) throw new Error("npm pack did not produce a tarball");
  console.log(`packed ${packInfo.filename}`);
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
