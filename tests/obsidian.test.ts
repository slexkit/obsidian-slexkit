import { describe, expect, it, mock } from "bun:test";
import { readFile } from "node:fs/promises";
import type { SlexKitUpdatableMarkdownRuntimeHost } from "slexkit";
import type { SlexKitMarkdownBlock } from "slexkit";

type MockSection = {
  text: string;
  lineStart: number;
  lineEnd: number;
};

type MockProcessorContext = {
  sourcePath: string;
  containerEl?: HTMLElement;
  getSectionInfo: (el: HTMLElement) => MockSection | null;
  addChild: (child: unknown) => void;
};

type MockProcessor = (
  source: string,
  el: HTMLElement,
  context: MockProcessorContext,
) => void;

class MockMarkdownRenderChild {
  containerEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
}

class MockWorkspaceLeaf {
  view!: MockMarkdownView;
}

class MockMarkdownView {
  containerEl: HTMLElement;
  file: { path: string } | null = null;
  leaf: MockWorkspaceLeaf;
  mode: "source" | "preview" = "source";

  constructor(leaf: MockWorkspaceLeaf) {
    this.leaf = leaf;
    this.containerEl = document.createElement("div");
    leaf.view = this;
  }

  getMode(): "source" | "preview" {
    return this.mode;
  }
}

class MockWorkspace {
  leaves: MockWorkspaceLeaf[] = [];
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>();

  getLeavesOfType(viewType: string): MockWorkspaceLeaf[] {
    return viewType === "markdown" ? [...this.leaves] : [];
  }

  on(name: string, callback: (...args: unknown[]) => void) {
    let listeners = this.listeners.get(name);
    if (!listeners) {
      listeners = new Set();
      this.listeners.set(name, listeners);
    }
    listeners.add(callback);
    return { name, callback };
  }

  trigger(name: string, ...args: unknown[]): void {
    for (const callback of this.listeners.get(name) ?? []) callback(...args);
  }
}

class MockPlugin {
  app: { workspace: MockWorkspace };
  processors: Array<{ language: string; processor: MockProcessor }> = [];
  eventRefs: unknown[] = [];

  constructor(app: { workspace: MockWorkspace }) {
    this.app = app;
  }

  registerMarkdownCodeBlockProcessor(
    language: string,
    processor: MockProcessor,
  ): void {
    this.processors.push({ language, processor });
  }

  registerEvent(eventRef: unknown): void {
    this.eventRefs.push(eventRef);
  }
}

function createTestRuntimeHost(): SlexKitUpdatableMarkdownRuntimeHost {
  const artifacts = new Map<string, Map<string, { block: SlexKitMarkdownBlock; frame: HTMLIFrameElement }>>();
  const host: SlexKitUpdatableMarkdownRuntimeHost = {
    configure() {},
    getMode: () => "secure",
    mountBlock(block) {
      const artifactId = block.artifactId ?? "standalone";
      const blockId = block.blockId ?? "block";
      const blocks = artifacts.get(artifactId) ?? new Map();
      artifacts.set(artifactId, blocks);
      const frame = block.container.ownerDocument.createElement("iframe");
      frame.className = "slexkit-html-frame";
      frame.dataset.source = String(block.source);
      block.container.append(frame);
      blocks.set(blockId, { block, frame });
      return () => frame.remove();
    },
    disposeBlock(container) {
      for (const blocks of artifacts.values()) {
        for (const [id, entry] of blocks) if (entry.block.container === container) {
          entry.frame.remove();
          blocks.delete(id);
        }
      }
    },
    disposeArtifact(artifactId) {
      for (const entry of artifacts.get(artifactId)?.values() ?? []) entry.frame.remove();
      artifacts.delete(artifactId);
    },
    disposeAll() {
      for (const id of [...artifacts.keys()]) host.disposeArtifact(id);
    },
    async updateArtifact(artifactId, nextBlocks, options) {
      if (options.phase === "preview") return;
      const current = artifacts.get(artifactId) ?? new Map();
      artifacts.set(artifactId, current);
      const nextIds = new Set(nextBlocks.map((block) => block.blockId ?? "block"));
      for (const [id, entry] of current) if (!nextIds.has(id)) {
        entry.frame.remove();
        current.delete(id);
      }
      for (const block of nextBlocks) {
        const id = block.blockId ?? "block";
        const existing = current.get(id);
        if (existing) {
          existing.block = block;
          existing.frame.dataset.source = String(block.source);
          if (existing.frame.parentElement !== block.container) block.container.append(existing.frame);
        } else {
          host.mountBlock({ ...block, artifactId, blockId: id });
        }
      }
    },
    async resetArtifact() {},
  };
  return host;
}

function inspectHtml(source: unknown) {
  if (typeof source !== "string") return { ok: false, warnings: [], error: new TypeError("HTML source must be a string.") };
  const rejected = /\son[a-z]+\s*=|<(?:iframe|object|embed|base|meta)\b|(?:javascript|vbscript):/i.test(source);
  return rejected
    ? { ok: false, warnings: [], error: new SyntaxError("Rejected executable HTML construct.") }
    : { ok: true, value: source, warnings: [] };
}

mock.module("slexkit", () => ({
  createSlexKitMarkdownRuntimeHost: createTestRuntimeHost,
  inspectSlexSource: inspectHtml,
}));

mock.module("obsidian", () => ({
  MarkdownRenderChild: MockMarkdownRenderChild,
  MarkdownView: MockMarkdownView,
  Plugin: MockPlugin,
}));

type LoadedPlugin = MockPlugin & {
  onload: () => Promise<void>;
  onunload: () => void;
};

type RenderedFence = {
  child: { onload: () => void; onunload: () => void };
  el: HTMLElement;
};

function createView(
  workspace: MockWorkspace,
  path: string,
  doc: Document = document,
): MockMarkdownView {
  const leaf = new MockWorkspaceLeaf();
  const view = new MockMarkdownView(leaf);
  view.file = { path };
  view.containerEl = doc.createElement("div");
  view.containerEl.className = "workspace-leaf-content";
  doc.body.append(view.containerEl);
  workspace.leaves.push(leaf);
  return view;
}

async function createPlugin(workspace: MockWorkspace): Promise<LoadedPlugin> {
  const { default: SlexKitObsidianPlugin } = await import("../src/main");
  const plugin = new SlexKitObsidianPlugin(
    { workspace } as never,
    {} as never,
  ) as unknown as LoadedPlugin;
  await plugin.onload();
  return plugin;
}

function runtimeHost(plugin: LoadedPlugin): SlexKitUpdatableMarkdownRuntimeHost {
  return (plugin as unknown as {
    runtimeHost: SlexKitUpdatableMarkdownRuntimeHost;
  }).runtimeHost;
}

function renderFence(
  plugin: LoadedPlugin,
  renderRoot: HTMLElement,
  source: string,
  sourcePath: string,
  lineStart: number | null,
): RenderedFence {
  const processor = plugin.processors.find(({ language }) => language === "slex");
  if (!processor) throw new Error("slex processor was not registered");

  const el = renderRoot.ownerDocument.createElement("div");
  renderRoot.append(el);
  let child!: RenderedFence["child"];
  processor.processor(source, el, {
    sourcePath,
    containerEl: renderRoot,
    getSectionInfo: () => lineStart === null
      ? null
      : {
          text: source,
          lineStart,
          lineEnd: lineStart + source.split("\n").length,
        },
    addChild(nextChild) {
      child = nextChild as RenderedFence["child"];
      child.onload();
    },
  });
  return { child, el };
}

async function settleArtifactUpdates(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function inputSource(value: string, label: string): string {
  return `<label data-key="editor"><span>${label}</span><input data-key="value" value="${value}"></label>`;
}

function textSource(text: string): string {
  return `<p data-key="value">${text}</p>`;
}

describe("@slexkit/obsidian view ownership", () => {
  it("cancels an uncommitted frame when Obsidian replaces its section during boot", async () => {
    document.body.replaceChildren();
    const workspace = new MockWorkspace();
    const view = createView(workspace, "Boot.md");
    const plugin = await createPlugin(workspace);
    const host = runtimeHost(plugin);
    const update = host.updateArtifact.bind(host);
    const dispose = host.disposeBlock.bind(host);
    let bootContainer: HTMLElement | undefined;
    let rejectBoot: ((error: Error) => void) | undefined;
    let cancelled = false;
    host.updateArtifact = (artifactId, blocks, options) => {
      if (!bootContainer) {
        bootContainer = blocks[0].container;
        void update(artifactId, blocks, options);
        return new Promise<void>((_resolve, reject) => { rejectBoot = reject; });
      }
      return update(artifactId, blocks, options);
    };
    host.disposeBlock = container => {
      if (container === bootContainer) {
        cancelled = true;
        rejectBoot?.(new Error("Frame removed before boot"));
      }
      dispose(container);
    };
    try {
      const obsolete = renderFence(plugin, view.containerEl, textSource("obsolete"), "Boot.md", 4);
      await settleArtifactUpdates();
      obsolete.child.onunload(); obsolete.el.remove();
      const current = renderFence(plugin, view.containerEl, textSource("current"), "Boot.md", 5);
      await settleArtifactUpdates();
      expect(cancelled).toBe(true);
      expect(current.el.querySelector<HTMLIFrameElement>("iframe")?.dataset.source).toBe(textSource("current"));
    } finally {
      rejectBoot?.(new Error("Test cleanup"));
      plugin.onunload();
    }
  });

  it("isolates identical paths across panes, popout documents, and detached render roots", async () => {
    document.body.replaceChildren();
    const workspace = new MockWorkspace();
    const primaryView = createView(workspace, "Folder/Same.md");
    const popoutDocument = document.implementation.createHTMLDocument("popout");
    const popoutView = createView(
      workspace,
      "Folder/Same.md",
      popoutDocument,
    );
    const plugin = await createPlugin(workspace);
    const host = runtimeHost(plugin);

    const artifactIds: string[] = [];
    const originalUpdate = host.updateArtifact.bind(host);
    host.updateArtifact = async (artifactId, blocks, options) => {
      artifactIds.push(artifactId);
      await originalUpdate(artifactId, blocks, options);
    };

    const primary = renderFence(
      plugin,
      primaryView.containerEl,
      inputSource("primary", "Primary"),
      "Folder/Same.md",
      4,
    );
    const popout = renderFence(
      plugin,
      popoutView.containerEl,
      inputSource("popout", "Popout"),
      "Folder/Same.md",
      4,
    );
    await settleArtifactUpdates();

    const primaryFrame = primary.el.querySelector("iframe");
    const popoutFrame = popout.el.querySelector("iframe");
    expect(primaryFrame).not.toBeNull();
    expect(popoutFrame).not.toBeNull();
    expect(primaryFrame).not.toBe(popoutFrame);

    const paneArtifactIds = [...new Set(artifactIds)];
    expect(paneArtifactIds).toHaveLength(2);
    expect(paneArtifactIds[0]).not.toBe(paneArtifactIds[1]);

    const detachedA = document.createElement("section");
    const detachedB = document.createElement("section");
    document.body.append(detachedA, detachedB);

    renderFence(
      plugin,
      detachedA,
      textSource("detached-a"),
      "Folder/Same.md",
      null,
    );
    await settleArtifactUpdates();
    const detachedAId = artifactIds.at(-1);

    renderFence(
      plugin,
      detachedA,
      textSource("detached-a-second"),
      "Folder/Same.md",
      null,
    );
    await settleArtifactUpdates();
    expect(artifactIds.at(-1)).toBe(detachedAId);

    renderFence(
      plugin,
      detachedB,
      textSource("detached-b"),
      "Folder/Same.md",
      null,
    );
    await settleArtifactUpdates();
    const detachedBId = artifactIds.at(-1);

    expect(detachedAId).toBeDefined();
    expect(detachedBId).toBeDefined();
    expect(detachedAId).not.toBe(detachedBId);
    expect(paneArtifactIds).not.toContain(detachedAId);
    expect(paneArtifactIds).not.toContain(detachedBId);

    plugin.onunload();
  });

  it("keeps the committed frame live across same-view rerenders and invalid source", async () => {
    document.body.replaceChildren();
    const workspace = new MockWorkspace();
    const view = createView(workspace, "Folder/Rerender.md");
    const plugin = await createPlugin(workspace);

    const first = renderFence(
      plugin,
      view.containerEl,
      inputSource("seed", "Original"),
      "Folder/Rerender.md",
      12,
    );
    await settleArtifactUpdates();

    const firstFrame = first.el.querySelector("iframe");
    expect(firstFrame).not.toBeNull();
    first.child.onunload();
    // Reading/live-preview transitions may clear the old slot's child DOM.
    first.el.querySelector(".slexkit-obsidian-preview")!.replaceChildren();
    first.el.remove();

    const rerendered = renderFence(
      plugin,
      view.containerEl,
      inputSource("new default", "Updated"),
      "Folder/Rerender.md",
      12,
    );
    await settleArtifactUpdates();

    expect(rerendered.el.querySelector("iframe")).toBe(firstFrame);

    rerendered.child.onunload();
    rerendered.el.remove();
    const invalid = renderFence(
      plugin,
      view.containerEl,
      `<button onclick="globalThis.bad = true">Rejected</button>`,
      "Folder/Rerender.md",
      12,
    );
    await settleArtifactUpdates();

    const diagnostic = invalid.el.querySelector(
      ".slexkit-obsidian-diagnostic",
    ) as HTMLElement;
    const preview = invalid.el.querySelector(
      ".slexkit-obsidian-preview",
    ) as HTMLElement;
    expect(diagnostic.hidden).toBe(false);
    expect(diagnostic.textContent).toContain("Failed to render SlexKit");
    expect(preview.contains(diagnostic)).toBe(false);
    expect(invalid.el.querySelector("iframe")).toBe(firstFrame);

    plugin.onunload();
  });

  it("keeps one stable preview on the surface selected by the MarkdownView mode", async () => {
    document.body.replaceChildren();
    const workspace = new MockWorkspace();
    const view = createView(workspace, "Folder/DualSurface.md");
    view.mode = "preview";

    const sourceSurface = document.createElement("div");
    sourceSurface.className = "markdown-source-view";
    const previewSurface = document.createElement("div");
    previewSurface.className = "markdown-preview-view";
    view.containerEl.append(sourceSurface, previewSurface);

    const plugin = await createPlugin(workspace);
    const source = inputSource("seed", "Dual surface");
    const previewRegistration = renderFence(
      plugin,
      previewSurface,
      source,
      "Folder/DualSurface.md",
      8,
    );
    const lateSourceRegistration = renderFence(
      plugin,
      sourceSurface,
      source,
      "Folder/DualSurface.md",
      8,
    );
    await settleArtifactUpdates();

    const frame = previewRegistration.el.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(lateSourceRegistration.el.querySelector("iframe")).toBeNull();

    view.mode = "source";
    workspace.trigger("layout-change");
    await settleArtifactUpdates();
    expect(lateSourceRegistration.el.querySelector("iframe")).toBe(frame);
    expect(previewRegistration.el.querySelector("iframe")).toBeNull();

    view.mode = "preview";
    workspace.trigger("layout-change");
    await settleArtifactUpdates();
    expect(previewRegistration.el.querySelector("iframe")).toBe(frame);
    expect(lateSourceRegistration.el.querySelector("iframe")).toBeNull();

    lateSourceRegistration.child.onunload();
    await settleArtifactUpdates();
    expect(previewRegistration.el.querySelector("iframe")).toBe(frame);

    plugin.onunload();
  });

  it("does not release on child unload, but releases on file switch, view close, and plugin unload", async () => {
    document.body.replaceChildren();
    const workspace = new MockWorkspace();
    const view = createView(workspace, "Folder/Lifecycle.md");
    const plugin = await createPlugin(workspace);
    const host = runtimeHost(plugin);

    const originalDisposeArtifact = host.disposeArtifact.bind(host);
    const disposeArtifact = mock((artifactId: string) => {
      originalDisposeArtifact(artifactId);
    });
    host.disposeArtifact = disposeArtifact;

    const originalDisposeAll = host.disposeAll.bind(host);
    const disposeAll = mock(() => {
      originalDisposeAll();
    });
    host.disposeAll = disposeAll;

    const first = renderFence(
      plugin,
      view.containerEl,
      textSource("first"),
      "Folder/Lifecycle.md",
      2,
    );
    await settleArtifactUpdates();

    first.child.onunload();
    await settleArtifactUpdates();
    expect(disposeArtifact).not.toHaveBeenCalled();

    view.file = { path: "Folder/Next.md" };
    workspace.trigger("file-open", view.file);
    expect(disposeArtifact).toHaveBeenCalledTimes(1);

    renderFence(
      plugin,
      view.containerEl,
      textSource("next"),
      "Folder/Next.md",
      2,
    );
    await settleArtifactUpdates();

    workspace.leaves = [];
    workspace.trigger("layout-change");
    expect(disposeArtifact).toHaveBeenCalledTimes(2);

    plugin.onunload();
    expect(disposeAll).toHaveBeenCalledTimes(1);
  });

  it("retains a virtualized HTML fence and removes it when its source fence is deleted", async () => {
    document.body.replaceChildren();
    const workspace = new MockWorkspace();
    const view = createView(workspace, "Virtualized.md");
    const seed = '<p data-key="seed">Seed fence</p>';
    const consumer = '<input data-key="editor" value="seed">';
    let note = ["```slex", seed, "```", "", "```slex", consumer, "```"].join("\n");
    Object.assign(view, { getViewData: () => note });
    const plugin = await createPlugin(workspace);
    const first = renderFence(plugin, view.containerEl, seed, "Virtualized.md", 0);
    const second = renderFence(plugin, view.containerEl, consumer, "Virtualized.md", 4);
    await settleArtifactUpdates();
    const consumerFrame = second.el.querySelector("iframe");
    expect(consumerFrame).not.toBeNull();
    first.child.onunload();first.el.remove();
    await settleArtifactUpdates();
    expect(second.el.querySelector("iframe")).toBe(consumerFrame);
    note = note.replace("```slex", "Removed fence");
    second.child.onunload();second.el.remove();
    const rerender = renderFence(plugin, view.containerEl, consumer, "Virtualized.md", 4);
    await settleArtifactUpdates();
    expect(rerender.el.querySelector("iframe")).toBe(consumerFrame);
    plugin.onunload();
  });
});

describe("@slexkit/obsidian package", () => {
  it("ships a root-level CJS bundle, synced manifest, and Obsidian bridge styles", async () => {
    const [rootPackageText, manifestText, versionsText, styles] = await Promise.all([
      readFile("package.json", "utf-8"),
      readFile("manifest.json", "utf-8"),
      readFile("versions.json", "utf-8"),
      readFile("styles.css", "utf-8"),
    ]);
    const rootPackage = JSON.parse(rootPackageText) as { version: string };
    const manifest = JSON.parse(manifestText) as {
      description: string;
      minAppVersion: string;
      version: string;
    };
    const versions = JSON.parse(versionsText) as Record<string, string>;

    expect(manifest.version).toBe(rootPackage.version);
    expect(versions[manifest.version]).toBe(manifest.minAppVersion);
    expect(manifest.description).not.toMatch(/\bobsidian\b/i);
    expect(styles).toContain("/* Obsidian host bridge */");
    expect(styles).toContain(".slexkit-obsidian-block");
    expect(styles).toContain(".slexkit-root");
    expect(styles).not.toContain("!important");
    expect(styles).not.toContain(":has(");
    expect(styles).not.toContain("display: contents");
    expect(styles).not.toContain("text-decoration");
    expect(styles).not.toContain("scrollbar-width");
    expect(styles).not.toContain("scrollbar-color");
    expect(styles).not.toContain("scrollbar-gutter");
    expect(styles).not.toContain("::-webkit-scrollbar");
    expect(styles).not.toContain("clip-path");
    expect(styles).not.toContain("-webkit-mask");
    expect(styles).not.toContain("system-ui");
    expect(styles).not.toContain("-apple-system");
    expect(styles).not.toContain("BlinkMacSystemFont");
    expect(styles).not.toMatch(/(^|[}\n,{]\s*):root\b/m);
    expect(styles).not.toMatch(/(^|[}\n\s,{>+~]\s*)body(?:[.\[:#\s,{]|$)/m);
    expect(styles).not.toContain("#mobileNav");
    expect(styles).not.toContain("data-mobile-nav");
    expect(styles).not.toContain(".slexkit-source-toolbar");
    expect(styles).not.toContain(".slexkit-source-button");
    expect(styles).not.toContain(".slexkit-preview");
    expect(styles).not.toContain(".slexkit-theme-uno");
    expect(styles).not.toContain(".slexkit-theme-flowbite");

    const smoke = Bun.spawnSync({
      cmd: [
        "node",
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
      ],
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(smoke.exitCode).toBe(0);
  });
});
