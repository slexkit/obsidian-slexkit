#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM } from "jsdom";

const root = resolve(import.meta.dirname, "..");
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const require = createRequire(import.meta.url);

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

for (const asset of ["main.js", "manifest.json", "styles.css", "versions.json"]) {
  if (!existsSync(resolve(root, asset))) {
    throw new Error(`missing release asset: ${asset}`);
  }
}

const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
const versions = JSON.parse(readFileSync(resolve(root, "versions.json"), "utf8"));
const styles = readFileSync(resolve(root, "styles.css"), "utf8");
if (manifest.version !== pkg.version) {
  throw new Error(`manifest version ${manifest.version} does not match package version ${pkg.version}`);
}
if (versions[manifest.version] !== manifest.minAppVersion) {
  throw new Error(`versions.json is missing ${manifest.version}: ${manifest.minAppVersion}`);
}
if (/\bobsidian\b/i.test(manifest.description || "")) {
  throw new Error("manifest description must not include the word Obsidian");
}

const forbiddenCssPatterns = [
  ["!important", /!important/],
  [":has()", /:has\(/],
  ["display: contents", /display\s*:\s*contents/],
  ["text-decoration", /text-decoration/],
  ["scrollbar CSS", /scrollbar-(?:width|color|gutter)|::-webkit-scrollbar/],
  ["clip-path", /clip-path/],
  ["-webkit-mask", /-webkit-mask/],
  ["system font keywords", /\bsystem-ui\b|-apple-system|BlinkMacSystemFont/],
  ["global :root selector", /(^|[}\n,{]\s*):root\b/m],
  ["global body selector", /(^|[}\n\s,{>+~]\s*)body(?:[.\[:#\s,{]|$)/m],
  ["web mobile navigation styles", /#mobileNav\b|data-mobile-nav/],
  ["runtime source preview styles", /\.slexkit-source-(?:toolbar|button)\b|\.slexkit-preview\b/],
  ["non-host SlexKit theme bootstrap", /\.slexkit-theme-(?:uno|flowbite)\b/],
];

for (const [label, pattern] of forbiddenCssPatterns) {
  if (pattern.test(styles)) {
    throw new Error(`styles.css contains Obsidian lint risk: ${label}`);
  }
}

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://obsidian.local/",
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLMediaElement = dom.window.HTMLMediaElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
globalThis.HTMLButtonElement = dom.window.HTMLButtonElement;
globalThis.SVGElement = dom.window.SVGElement;
globalThis.Node = dom.window.Node;
globalThis.Text = dom.window.Text;
globalThis.Comment = dom.window.Comment;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.MutationObserver = dom.window.MutationObserver;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.requestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

const processors = [];
const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "obsidian") {
    return {
      MarkdownRenderChild: class {
        constructor(containerEl) {
          this.containerEl = containerEl;
        }
      },
      Plugin: class {
        registerMarkdownCodeBlockProcessor(language, processor) {
          processors.push({ language, processor });
        }
      },
    };
  }
  return originalLoad.apply(this, arguments);
};

try {
  const PluginConstructor = require(resolve(root, "main.js"));
  if (typeof PluginConstructor !== "function") throw new Error("plugin constructor missing");

  const plugin = new PluginConstructor({}, {});
  await plugin.onload();
  if (processors.length !== 1 || processors[0].language !== "slex") {
    throw new Error("SlexKit processor was not registered");
  }

  const container = document.createElement("div");
  container.empty = () => container.replaceChildren();
  container.addClass = (className) => container.classList.add(className);

  let child;
  processors[0].processor(
    `{
      namespace: "release_smoke",
      layout: {
        "text:message": { text: "Release smoke rendered" }
      }
    }`,
    container,
    {
      sourcePath: "Smoke.md",
      addChild(nextChild) {
        child = nextChild;
        child.onload();
      },
    },
  );

  if (!container.classList.contains("slexkit-obsidian-block")) {
    throw new Error("processor did not mark the container");
  }
  if (!container.textContent.includes("Release smoke rendered")) {
    throw new Error("processor did not render SlexKit content");
  }

  child?.onunload();

  const crossDocMarkdown = readFileSync(resolve(root, "fixtures", "slexkit-smoke.md"), "utf8");
  const crossDocBlocks = [...crossDocMarkdown.matchAll(/^```slex\r?\n([\s\S]*?)```/gm)].map((match) => match[1]);
  if (crossDocBlocks.length !== 3) {
    throw new Error(`expected 3 cross-doc smoke fences, found ${crossDocBlocks.length}`);
  }

  const crossDocContainers = crossDocBlocks.map(() => {
    const el = document.createElement("div");
    el.empty = () => el.replaceChildren();
    el.addClass = (className) => el.classList.add(className);
    document.body.appendChild(el);
    return el;
  });
  const crossDocChildren = [];
  for (const [index, source] of crossDocBlocks.entries()) {
    processors[0].processor(source, crossDocContainers[index], {
      sourcePath: "CrossDocStateLab.md",
      addChild(nextChild) {
        crossDocChildren.push(nextChild);
        nextChild.onload();
      },
    });
  }

  await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  const initialCrossDocText = crossDocContainers.map((el) => el.textContent).join(" ");
  if (!initialCrossDocText.includes("样式 blue 16px") || !initialCrossDocText.includes("已同步 blue")) {
    throw new Error("cross-doc smoke did not render initial shared blue state");
  }

  const colorSelect = crossDocContainers[0].querySelector(".slex-select");
  const colorTrigger = colorSelect?.querySelector(".slex-select-trigger");
  colorTrigger?.click();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
  const greenOption = [...crossDocContainers[0].querySelectorAll('[role="option"]')].find((node) =>
    node.textContent?.includes("绿色"),
  );
  if (!(greenOption instanceof HTMLElement)) {
    throw new Error("cross-doc smoke green option not found");
  }
  greenOption.click();
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));

  const updatedCrossDocText = crossDocContainers.map((el) => el.textContent).join(" ");
  if (!updatedCrossDocText.includes("样式 green 16px") || !updatedCrossDocText.includes("已同步 green")) {
    throw new Error("cross-doc smoke did not propagate shared namespace state after select change");
  }

  for (const nextChild of crossDocChildren) nextChild.onunload();
  plugin.onunload();
} finally {
  Module._load = originalLoad;
  dom.window.close();
}

const packDir = mkdtempSync(join(tmpdir(), "slexkit-obsidian-pack-"));
try {
  const packed = run(npmCommand, ["pack", "--json", "--pack-destination", packDir]);
  const packInfo = JSON.parse(packed)[0];
  if (!packInfo?.filename) throw new Error("npm pack did not produce a tarball");
  console.log(`packed ${packInfo.filename}`);
} finally {
  rmSync(packDir, { recursive: true, force: true });
}
