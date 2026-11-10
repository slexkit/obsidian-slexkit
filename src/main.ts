import {
  MarkdownRenderChild,
  MarkdownView,
  Plugin,
  type MarkdownPostProcessorContext,
} from "obsidian";
import {
  createSlexKitMarkdownRuntimeHost,
  inspectSlexSource,
  type SlexKitMarkdownBlock,
  type SlexKitUpdatableMarkdownRuntimeHost,
} from "slexkit";

const LANGUAGES = ["slex"] as const;
declare const __SLEXKIT_FRAME_RUNTIME_URL__: string;
declare const __SLEXKIT_FRAME_STYLE_URL__: string;

function bundledFrameRuntimeUrl(): string {
  return typeof __SLEXKIT_FRAME_RUNTIME_URL__ === "string"
    ? __SLEXKIT_FRAME_RUNTIME_URL__
    : "data:text/javascript,throw%20new%20Error('SlexKit%20frame%20runtime%20was%20not%20bundled')";
}

type SlexKitProcessorContext = MarkdownPostProcessorContext & {
  containerEl?: HTMLElement;
};

type RenderingSurface = "source" | "preview" | "unknown";

type FenceRegistration = {
  child: SlexKitBlock;
  source: string;
  outer: HTMLElement;
  diagnostic: HTMLElement;
  order: number;
  sequence: number;
  surface: RenderingSurface;
};

type FenceState = {
  blockId: string;
  preview: HTMLElement;
  registrations: Map<SlexKitBlock, FenceRegistration>;
  active?: FenceRegistration;
  committed: boolean;
  committedSource?: string;
  committedOrder?: number;
};

type ArtifactOwner = {
  artifactId: string;
  sourcePath: string;
  renderRoot: HTMLElement;
  fences: Map<string, FenceState>;
  elementIds: WeakMap<HTMLElement, string>;
  nextElementId: number;
  scheduled?: ReturnType<typeof setTimeout>;
  pending: Promise<void>;
  disposed: boolean;
  scope: OwnerScope;
};

type ViewScope = {
  kind: "view";
  view: MarkdownView;
  filePath: string | null;
  renderRoots: Set<HTMLElement>;
  owners: Map<string, ArtifactOwner>;
};

type DetachedScope = {
  kind: "detached";
  renderRoot: HTMLElement;
  owners: Map<string, ArtifactOwner>;
};

type OwnerScope = ViewScope | DetachedScope;

function isElement(value: unknown): value is HTMLElement {
  return !!value
    && typeof value === "object"
    && (value as Node).nodeType === 1
    && typeof (value as Element).contains === "function";
}

function containsOrIs(container: HTMLElement, element: HTMLElement): boolean {
  return container === element || container.contains(element);
}

function containmentDistance(container: HTMLElement, element: HTMLElement): number {
  let distance = 0;
  let current: HTMLElement | null = element;
  while (current && current !== container) {
    current = current.parentElement;
    distance += 1;
  }
  return current === container ? distance : Number.POSITIVE_INFINITY;
}

function stableElementPath(root: HTMLElement, element: HTMLElement): string | undefined {
  if (!containsOrIs(root, element)) return undefined;
  if (root === element) return "root";

  const parts: string[] = [];
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) return undefined;
    const index = Array.prototype.indexOf.call(parent.children, current) as number;
    parts.push(String(index).padStart(6, "0"));
    current = parent;
  }
  return current === root ? parts.reverse().join(".") : undefined;
}

function currentFilePath(view: MarkdownView): string | null {
  return view.file?.path ?? null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function classifyRenderingSurface(element: HTMLElement): RenderingSurface {
  let current: HTMLElement | null = element;
  while (current) {
    if (
      current.classList.contains("cm-preview-code-block")
      || current.classList.contains("markdown-source-view")
    ) {
      return "source";
    }
    if (
      current.classList.contains("el-pre")
      || current.classList.contains("markdown-preview-view")
      || current.classList.contains("markdown-preview-section")
      || current.classList.contains("markdown-reading-view")
    ) {
      return "preview";
    }
    current = current.parentElement;
  }
  return "unknown";
}

class SlexKitBlock extends MarkdownRenderChild {
  constructor(
    containerEl: HTMLElement,
    readonly source: string,
    readonly context: SlexKitProcessorContext,
    private readonly plugin: SlexKitObsidianPlugin,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.plugin.attachBlock(this);
  }

  onunload(): void {
    this.plugin.detachBlock(this);
  }
}

export default class SlexKitObsidianPlugin extends Plugin {
  private runtimeHost?: SlexKitUpdatableMarkdownRuntimeHost;
  private loaded = false;
  private nextOwnerId = 0;
  private nextRegistrationSequence = 0;
  private viewScopeByView = new WeakMap<MarkdownView, ViewScope>();
  private readonly viewScopes = new Set<ViewScope>();
  private viewByRenderRoot = new WeakMap<HTMLElement, MarkdownView>();
  private detachedScopeByRoot = new WeakMap<HTMLElement, DetachedScope>();
  private readonly detachedScopes = new Set<DetachedScope>();
  private readonly owners = new Set<ArtifactOwner>();

  async onload(): Promise<void> {
    this.loaded = true;
    this.runtimeHost = createSlexKitMarkdownRuntimeHost({
      mode: "secure",
      theme: "host-shadcn",
      secureFrame: {
        runtimeUrl: bundledFrameRuntimeUrl(),
        styleUrl: typeof __SLEXKIT_FRAME_STYLE_URL__ === "string" ? __SLEXKIT_FRAME_STYLE_URL__ : false,
        // All packaged KaTeX fonts are embedded data assets; no remote fonts.
        fontUrls: ["data:"],
      },
    });

    for (const language of LANGUAGES) {
      this.registerMarkdownCodeBlockProcessor(language, (source, el, context) => {
        context.addChild(new SlexKitBlock(
          el,
          source,
          context as SlexKitProcessorContext,
          this,
        ));
      });
    }

    this.registerEvent(this.app.workspace.on("file-open", () => {
      this.reconcileWorkspaceOwners();
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.reconcileWorkspaceOwners();
    }));
    this.registerEvent(this.app.workspace.on("window-close", () => {
      this.reconcileWorkspaceOwners();
    }));
  }

  onunload(): void {
    this.loaded = false;
    for (const owner of this.owners) {
      owner.disposed = true;
      if (owner.scheduled !== undefined) clearTimeout(owner.scheduled);
    }
    this.owners.clear();
    this.viewScopes.clear();
    this.detachedScopes.clear();
    this.viewScopeByView = new WeakMap();
    this.viewByRenderRoot = new WeakMap();
    this.detachedScopeByRoot = new WeakMap();
    this.runtimeHost?.disposeAll();
    this.runtimeHost = undefined;
  }

  attachBlock(child: SlexKitBlock): void {
    if (!this.loaded || !this.runtimeHost) return;

    const owner = this.resolveOwner(child.containerEl, child.context);
    const identity = this.resolveBlockIdentity(owner, child.containerEl, child.context);
    let fence = owner.fences.get(identity.blockId);
    if (!fence) {
      const preview = child.containerEl.ownerDocument.createElement("div");
      preview.className = "slexkit-obsidian-preview";
      fence = {
        blockId: identity.blockId,
        preview,
        registrations: new Map(),
        committed: false,
      };
      owner.fences.set(identity.blockId, fence);
    }

    const diagnostic = child.containerEl.ownerDocument.createElement("div");
    diagnostic.className = "slexkit-obsidian-diagnostic";
    diagnostic.hidden = true;
    diagnostic.setAttribute("role", "alert");

    child.containerEl.replaceChildren();
    child.containerEl.classList.add("slexkit-obsidian-block");
    child.containerEl.append(diagnostic);
    fence.registrations.set(child, {
      child,
      source: child.source,
      outer: child.containerEl,
      diagnostic,
      order: identity.order,
      sequence: ++this.nextRegistrationSequence,
      surface: classifyRenderingSurface(child.containerEl),
    });
    this.selectFenceRegistration(owner, fence);
    this.scheduleOwnerUpdate(owner);
  }

  detachBlock(child: SlexKitBlock): void {
    for (const owner of this.owners) {
      for (const fence of owner.fences.values()) {
        if (!fence.registrations.delete(child)) continue;
        this.selectFenceRegistration(owner, fence);
        if (!fence.committed && fence.registrations.size === 0) {
          // Obsidian may replace a rendering section before its frame loads.
          // Cancel that boot so it cannot hold the artifact update queue open.
          this.runtimeHost?.disposeBlock(fence.preview);
        }
        this.scheduleOwnerUpdate(owner);
        return;
      }
    }
  }

  private resolveOwner(
    element: HTMLElement,
    context: SlexKitProcessorContext,
  ): ArtifactOwner {
    const contextRoot = isElement(context.containerEl)
      ? context.containerEl
      : undefined;
    const view = this.locateMarkdownView(element, contextRoot);
    const sourcePath = context.sourcePath || "<unknown>";

    if (view) {
      let scope = this.viewScopeByView.get(view);
      const filePath = currentFilePath(view);
      if (scope && scope.filePath !== filePath) {
        this.releaseViewScope(scope);
        scope = undefined;
      }
      if (!scope) {
        scope = {
          kind: "view",
          view,
          filePath,
          renderRoots: new Set(),
          owners: new Map(),
        };
        this.viewScopeByView.set(view, scope);
        this.viewScopes.add(scope);
      }
      if (contextRoot) {
        scope.renderRoots.add(contextRoot);
        this.viewByRenderRoot.set(contextRoot, view);
      }
      return this.ownerForScope(
        scope,
        sourcePath,
        contextRoot ?? view.containerEl,
      );
    }

    const renderRoot = contextRoot ?? element;
    let scope = this.detachedScopeByRoot.get(renderRoot);
    if (!scope) {
      scope = {
        kind: "detached",
        renderRoot,
        owners: new Map(),
      };
      this.detachedScopeByRoot.set(renderRoot, scope);
      this.detachedScopes.add(scope);
    }
    return this.ownerForScope(scope, sourcePath, renderRoot);
  }

  private ownerForScope(
    scope: OwnerScope,
    sourcePath: string,
    renderRoot: HTMLElement,
  ): ArtifactOwner {
    let owner = scope.owners.get(sourcePath);
    if (owner) return owner;

    owner = {
      artifactId: `obsidian:view-${++this.nextOwnerId}:${sourcePath}`,
      sourcePath,
      renderRoot,
      fences: new Map(),
      elementIds: new WeakMap(),
      nextElementId: 0,
      pending: Promise.resolve(),
      disposed: false,
      scope,
    };
    scope.owners.set(sourcePath, owner);
    this.owners.add(owner);
    return owner;
  }

  private locateMarkdownView(
    element: HTMLElement,
    contextRoot: HTMLElement | undefined,
  ): MarkdownView | undefined {
    let best: { view: MarkdownView; distance: number } | undefined;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;

      for (const candidate of [element, contextRoot]) {
        if (!candidate || !containsOrIs(view.containerEl, candidate)) continue;
        const distance = containmentDistance(view.containerEl, candidate);
        if (!best || distance < best.distance) {
          best = { view, distance };
        }
      }
    }
    if (best) return best.view;

    if (contextRoot) {
      const cached = this.viewByRenderRoot.get(contextRoot);
      if (cached && this.viewScopeByView.has(cached)) return cached;
    }
    return undefined;
  }

  private resolveBlockIdentity(
    owner: ArtifactOwner,
    element: HTMLElement,
    context: SlexKitProcessorContext,
  ): { blockId: string; order: number } {
    try {
      const section = context.getSectionInfo(element);
      if (section && Number.isInteger(section.lineStart)) {
        return {
          blockId: `line:${section.lineStart}`,
          order: section.lineStart,
        };
      }
    } catch {
      // Detached renderers commonly cannot return section information.
    }

    const existing = owner.elementIds.get(element);
    if (existing) {
      return {
        blockId: existing,
        order: owner.nextElementId,
      };
    }

    const contextRoot = isElement(context.containerEl)
      ? context.containerEl
      : owner.renderRoot;
    const position = stableElementPath(contextRoot, element)
      ?? stableElementPath(owner.renderRoot, element);
    const sequence = ++owner.nextElementId;
    const blockId = position
      ? `position:${position}`
      : `block:${sequence}`;
    owner.elementIds.set(element, blockId);
    return { blockId, order: sequence };
  }

  private selectFenceRegistration(
    owner: ArtifactOwner,
    fence: FenceState,
  ): boolean {
    const previous = fence.active;
    const registrations = Array.from(fence.registrations.values());
    for (const registration of registrations) {
      const surface=classifyRenderingSurface(registration.outer);
      if (surface !== "unknown") registration.surface=surface;
    }
    const latest = (candidates: FenceRegistration[]) => candidates.reduce<
      FenceRegistration | undefined
    >(
      (selected, registration) => (
        !selected || registration.sequence > selected.sequence
          ? registration
          : selected
      ),
      undefined,
    );

    let selected: FenceRegistration | undefined;
    const view = owner.scope.kind === "view" ? owner.scope.view : undefined;
    const getMode = (
      view as (MarkdownView & { getMode?: () => string }) | undefined
    )?.getMode;

    if (view && typeof getMode === "function") {
      let mode: string | undefined;
      try {
        mode = getMode.call(view);
      } catch {
        mode = undefined;
      }
      if (mode === "source" || mode === "preview") {
        selected = latest(
          registrations.filter(({ surface }) => surface === mode),
        ) ?? latest(
          registrations.filter(({ surface }) => surface === "unknown"),
        ) ?? latest(registrations);
      }
    }

    selected ??= latest(registrations);
    fence.active = selected;

    let moved = false;
    if (selected && fence.preview.parentElement !== selected.outer) {
      selected.outer.append(fence.preview);
      moved = true;
    }
    return previous !== selected || moved;
  }

  private scheduleOwnerUpdate(owner: ArtifactOwner): void {
    if (owner.disposed || owner.scheduled !== undefined) return;
    owner.scheduled = setTimeout(() => {
      owner.scheduled = undefined;
      if (owner.disposed || !this.loaded) return;
      const update = () => this.recomputeOwner(owner);
      owner.pending = owner.pending.then(update, update);
    }, 0);
  }

  private async recomputeOwner(owner: ArtifactOwner): Promise<void> {
    const runtimeHost = this.runtimeHost;
    if (!runtimeHost || owner.disposed || !this.loaded) return;
    for (const fence of owner.fences.values()) this.selectFenceRegistration(owner, fence);

    const view = owner.scope.kind === "view" ? owner.scope.view : undefined;
    const note = view && typeof view.getViewData === "function" ? view.getViewData() : undefined;
    const lines = note?.split(/\r?\n/);
    const active = Array.from(owner.fences.values()).flatMap<{ fence: FenceState; registration: Pick<FenceRegistration, "source" | "order" | "outer" | "diagnostic"> }>((fence) => {
      if (fence.active) return [{fence, registration: fence.active}];
      if (!fence.committed || fence.committedSource === undefined) return [];
      const line = fence.committedOrder;
      if (lines && fence.blockId.startsWith("line:") && line !== undefined && !/^[ \t]*(?:`{3,}|~{3,})slex(?:\s|$)/.test(lines[line] ?? "")) return [];
      // Obsidian virtualizes reading sections. An unloaded fence still owns its
      // committed contribution until the note actually removes it.
      return [{fence, registration: {
        source: fence.committedSource, order: fence.committedOrder ?? 0,
        outer: fence.preview, diagnostic: fence.preview.ownerDocument.createElement("div"),
      }}];
    }).sort((left,right)=>left.registration.order-right.registration.order);
    if (active.length === 0 && !lines) return;

    let invalid = false;
    for (const { registration } of active) {
      const inspection = inspectSlexSource(registration.source);
      if (inspection.ok) {
        this.clearDiagnostic(registration.diagnostic);
        continue;
      }
      invalid = true;
      this.showDiagnostic(registration.diagnostic, inspection.error);
    }

    const blocks: SlexKitMarkdownBlock[] = active.map(({ fence, registration }) => ({
      artifactId: owner.artifactId,
      blockId: fence.blockId,
      source: registration.source,
      container: fence.preview,
      theme: "host-shadcn",
    }));

    if (invalid) {
      try {
        await runtimeHost.updateArtifact(owner.artifactId, blocks, {
          phase: "preview",
        });
      } catch {
        // Static diagnostics are already shown alongside the retained live view.
      }
      return;
    }

    try {
      await runtimeHost.updateArtifact(owner.artifactId, blocks, {
        phase: "commit",
      });
    } catch (error) {
      for (const { registration } of active) {
        this.showDiagnostic(registration.diagnostic, error);
      }
      return;
    }

    if (owner.disposed) return;
    for (const { fence, registration } of active) {
      if (fence.active === registration) {
        fence.committed = true;
        fence.committedSource = registration.source;
        fence.committedOrder = registration.order;
        this.clearDiagnostic(registration.diagnostic);
      }
    }
    for (const [blockId, fence] of owner.fences) {
      if (!active.some(entry => entry.fence === fence)) owner.fences.delete(blockId);
    }
  }

  private clearDiagnostic(diagnostic: HTMLElement): void {
    diagnostic.replaceChildren();
    diagnostic.hidden = true;
  }

  private showDiagnostic(diagnostic: HTMLElement, error: unknown): void {
    diagnostic.textContent = `Failed to render SlexKit: ${errorMessage(error)}`;
    diagnostic.hidden = false;
  }

  private reconcileWorkspaceOwners(): void {
    const liveViews = new Set<MarkdownView>();
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      if (leaf.view instanceof MarkdownView) liveViews.add(leaf.view);
    }

    for (const scope of Array.from(this.viewScopes)) {
      if (
        !liveViews.has(scope.view)
        || currentFilePath(scope.view) !== scope.filePath
      ) {
        this.releaseViewScope(scope);
        continue;
      }

      for (const owner of scope.owners.values()) {
        let changed = false;
        for (const fence of owner.fences.values()) {
          changed = this.selectFenceRegistration(owner, fence) || changed;
        }
        if (changed) this.scheduleOwnerUpdate(owner);
      }
    }
  }

  private releaseViewScope(scope: ViewScope): void {
    for (const owner of Array.from(scope.owners.values())) {
      this.releaseOwner(owner);
    }
    for (const root of scope.renderRoots) {
      if (this.viewByRenderRoot.get(root) === scope.view) {
        this.viewByRenderRoot.delete(root);
      }
    }
    this.viewScopeByView.delete(scope.view);
    this.viewScopes.delete(scope);
  }

  private releaseOwner(owner: ArtifactOwner): void {
    if (owner.disposed) return;
    owner.disposed = true;
    if (owner.scheduled !== undefined) clearTimeout(owner.scheduled);
    owner.scope.owners.delete(owner.sourcePath);
    this.owners.delete(owner);
    this.runtimeHost?.disposeArtifact(owner.artifactId);

    if (owner.scope.kind === "detached" && owner.scope.owners.size === 0) {
      this.detachedScopeByRoot.delete(owner.scope.renderRoot);
      this.detachedScopes.delete(owner.scope);
    }
  }
}
