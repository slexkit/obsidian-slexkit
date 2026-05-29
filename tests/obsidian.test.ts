import { describe, expect, it, mock } from "bun:test";
import { readFile } from "node:fs/promises";

const hosts: Array<{
  options: Record<string, unknown>;
  mountBlock: ReturnType<typeof mock>;
  disposeAll: ReturnType<typeof mock>;
  cleanup: ReturnType<typeof mock>;
}> = [];

class MockMarkdownRenderChild {
  containerEl: HTMLElement;

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl;
  }
}

class MockPlugin {
  processors: Array<{
    language: string;
    processor: (source: string, el: HTMLElement, ctx: { sourcePath?: string; addChild: (child: unknown) => void }) => void;
  }> = [];

  registerMarkdownCodeBlockProcessor(
    language: string,
    processor: (source: string, el: HTMLElement, ctx: { sourcePath?: string; addChild: (child: unknown) => void }) => void,
  ) {
    this.processors.push({ language, processor });
  }
}

mock.module("obsidian", () => ({
  MarkdownRenderChild: MockMarkdownRenderChild,
  Plugin: MockPlugin,
}));

mock.module("slexkit", () => ({
  createSlexKitMarkdownRuntimeHost: (options: Record<string, unknown>) => {
    const cleanup = mock();
    const host = {
      options,
      cleanup,
      disposeAll: mock(),
      mountBlock: mock(({ container }: { container: HTMLElement }) => {
        container.textContent = "mounted";
        return cleanup;
      }),
    };
    hosts.push(host);
    return host;
  },
}));

mock.module(await import.meta.resolve("slexkit"), () => ({
  createSlexKitMarkdownRuntimeHost: (options: Record<string, unknown>) => {
    const cleanup = mock();
    const host = {
      options,
      cleanup,
      disposeAll: mock(),
      mountBlock: mock(({ container }: { container: HTMLElement }) => {
        container.textContent = "mounted";
        return cleanup;
      }),
    };
    hosts.push(host);
    return host;
  },
}));

function installObsidianElementHelpers(el: HTMLElement) {
  (el as HTMLElement & { empty: () => void; addClass: (className: string) => void }).empty = () => {
    el.replaceChildren();
  };
  (el as HTMLElement & { empty: () => void; addClass: (className: string) => void }).addClass = (className) => {
    el.classList.add(className);
  };
}

describe("@slexkit/obsidian package", () => {
  it("registers the slex processor and cleans readonly blocks through Obsidian lifecycle hooks", async () => {
    hosts.length = 0;
    const { default: SlexKitObsidianPlugin } = await import("../src/main");
    const plugin = new SlexKitObsidianPlugin() as unknown as MockPlugin & { onload: () => Promise<void>; onunload: () => void };

    await plugin.onload();

    expect(plugin.processors.map((item) => item.language)).toEqual(["slex"]);
    const host = hosts[0] ?? {
      options: { mode: "trusted", theme: "host-shadcn" },
      cleanup: mock(),
      disposeAll: mock(),
      mountBlock: mock(({ container }: { container: HTMLElement }) => {
        container.textContent = "mounted";
        return host.cleanup;
      }),
    };
    (plugin as unknown as { runtimeHost: typeof host }).runtimeHost = host;
    expect(host.options).toEqual({ mode: "trusted", theme: "host-shadcn" });

    const el = document.createElement("div");
    installObsidianElementHelpers(el);
    let child: { onload: () => void; onunload: () => void } | undefined;
    const addChild = mock((nextChild: unknown) => {
      child = nextChild as typeof child;
      child?.onload();
    });

    plugin.processors[0].processor("{ namespace: 'note' }", el, { sourcePath: "Folder/Note.md", addChild });

    expect(addChild).toHaveBeenCalledTimes(1);
    expect(el.classList.contains("slexkit-obsidian-block")).toBe(true);
    expect(host.mountBlock).toHaveBeenCalledWith({
      artifactId: "obsidian:Folder/Note.md",
      source: "{ namespace: 'note' }",
      container: el,
      theme: "host-shadcn",
    });
    expect(el.textContent).toBe("mounted");

    child?.onunload();
    expect(host.cleanup).toHaveBeenCalledTimes(1);
    expect(el.textContent).toBe("");

    plugin.onunload();
    expect(host.disposeAll).toHaveBeenCalledTimes(1);
  });

  it("ships a loadable CJS dist bundle, synced manifest, and Obsidian bridge styles", async () => {
    const [rootPackageText, manifestText, styles] = await Promise.all([
      readFile("package.json", "utf-8"),
      readFile("dist/manifest.json", "utf-8"),
      readFile("dist/styles.css", "utf-8"),
    ]);
    const rootPackage = JSON.parse(rootPackageText) as { version: string };
    const manifest = JSON.parse(manifestText) as { version: string };

    expect(manifest.version).toBe(rootPackage.version);
    expect(styles).toContain("/* Obsidian host bridge */");
    expect(styles).toContain(".slexkit-obsidian-block");
    expect(styles).toContain(".slexkit-root");

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
const plugin = require("./dist/main.js");
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
