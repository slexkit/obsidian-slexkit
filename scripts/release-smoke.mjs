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
const mainJs = readFileSync(resolve(root, "main.js"), "utf8");
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
if (/file:\/\/[^"'`]*\/node_modules\/slexkit\/dist\/slexkit\.js/.test(mainJs)) {
  throw new Error("main.js contains a machine-specific bundled runtime URL");
}
if (!mainJs.includes("data:text/javascript;base64,")) {
  throw new Error("main.js does not embed the explicit opaque-frame runtime URL");
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
globalThis.Window = dom.window.Window;
globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
globalThis.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
globalThis.ResizeObserver = class {observe(){} unobserve(){} disconnect(){}};
dom.window.matchMedia = query => ({media:query,matches:false,addEventListener(){},removeEventListener(){}});
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

// jsdom deliberately does not run the opaque iframe. Acknowledge the protocol
// to check packaged host wiring only; execution is covered by real browsers
// and the independent desktop vault acceptance.
const wiredFrames = new WeakSet();
const wireFrame = (frame) => {
  if (wiredFrames.has(frame) || !frame.contentWindow) return;
  wiredFrames.add(frame);
  const guest = frame.contentWindow;
  guest.postMessage = (message) => {
    const kind = message.kind === "slexkit-bootstrap-init" ? "ready" :
      ["commit", "reset", "snapshot", "dispose"].includes(message.kind) ? "result" : null;
    if (!kind) return;
    queueMicrotask(() => window.dispatchEvent(new window.MessageEvent("message", {
      source: guest,
      data: { channel: "slexkit-html-v1", token: message.token, kind,
        epoch: message.epoch,
        requestId: message.requestId ?? "ready", revision: message.revision ?? 0, ok: true },
    })));
  };
  const load = new window.Event("load");
  frame.addEventListener("load", event => { if (event !== load) event.stopImmediatePropagation(); }, true);
  frame.dispatchEvent(load);
};
const frameObserver = new window.MutationObserver(() => {
  document.querySelectorAll("iframe.slexkit-html-frame").forEach(wireFrame);
});
frameObserver.observe(document.body, { childList: true, subtree: true });

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
      MarkdownView: class {},
      Plugin: class {
        constructor(app) {this.app=app;}
        registerEvent() {}
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

  const plugin = new PluginConstructor({workspace:{on(){return {};},getLeavesOfType(){return [];}}}, {});
  await plugin.onload();
  if (processors.length !== 1 || processors[0].language !== "slex") {
    throw new Error("SlexKit processor was not registered");
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  container.empty = () => container.replaceChildren();
  container.addClass = (className) => container.classList.add(className);

  let child;
  processors[0].processor(
    `<slex-card title="Release smoke" data-key="release">
      <p>Release smoke rendered</p>
    </slex-card>`,
    container,
    {
      sourcePath: "Smoke.md",
      addChild(nextChild) {
        child = nextChild;
        child.onload();
      },
    },
  );

  await new Promise(resolve=>setTimeout(resolve,50));
  if (!container.classList.contains("slexkit-obsidian-block")) {
    throw new Error("processor did not mark the container");
  }
  if (!container.querySelector("iframe.slexkit-html-frame")) {
    throw new Error("processor did not create an isolated SlexKit frame");
  }

  child?.onunload();

  const crossDocMarkdown = readFileSync(resolve(root, "fixtures", "slexkit-smoke.md"), "utf8");
  const crossDocBlocks = [...crossDocMarkdown.matchAll(/^(`{3,}|~{3,})slex\r?\n([\s\S]*?)^\1\s*$/gm)].map((match) => match[2]);
  if (crossDocBlocks.length !== 3) {
    throw new Error(`expected 3 cross-doc smoke fences, found ${crossDocBlocks.length}`);
  }

  const crossDocRoot = document.createElement("main");
  document.body.appendChild(crossDocRoot);
  const crossDocContainers = crossDocBlocks.map(() => {
    const el = document.createElement("div");
    el.empty = () => el.replaceChildren();
    el.addClass = (className) => el.classList.add(className);
    crossDocRoot.appendChild(el);
    return el;
  });
  const crossDocChildren = [];
  for (const [index, source] of crossDocBlocks.entries()) {
    processors[0].processor(source, crossDocContainers[index], {
      sourcePath: "CrossDocStateLab.md",
      containerEl: crossDocRoot,
      getSectionInfo: () => ({lineStart:index*20,lineEnd:index*20+19}),
      addChild(nextChild) {
        crossDocChildren.push(nextChild);
        nextChild.onload();
      },
    });
  }

  await new Promise((resolveDelay) => setTimeout(resolveDelay, 50));
  if (crossDocContainers.some((el) => !el.querySelector("iframe.slexkit-html-frame"))) {
    throw new Error("cross-fence smoke did not create one isolated frame per HTML fence");
  }

  for (const nextChild of crossDocChildren) nextChild.onunload();
  plugin.onunload();
} finally {
  frameObserver.disconnect();
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
