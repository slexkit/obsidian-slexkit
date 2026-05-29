import { MarkdownRenderChild, Plugin } from "obsidian";
import { createSlexKitMarkdownRuntimeHost } from "slexkit";
import type { SlexKitMarkdownRuntimeHost } from "slexkit";

const LANGUAGES = ["slex"] as const;

class SlexKitReadonlyBlock extends MarkdownRenderChild {
  private cleanup?: () => void;

  constructor(
    containerEl: HTMLElement,
    private readonly source: string,
    private readonly artifactId: string,
    private readonly runtimeHost: SlexKitMarkdownRuntimeHost,
  ) {
    super(containerEl);
  }

  onload(): void {
    this.containerEl.empty();
    this.containerEl.addClass("slexkit-obsidian-block");
    this.cleanup = this.runtimeHost.mountBlock({
      artifactId: this.artifactId,
      source: this.source,
      container: this.containerEl,
      theme: "host-shadcn",
    });
  }

  onunload(): void {
    this.cleanup?.();
    this.cleanup = undefined;
    this.containerEl.empty();
  }
}

export default class SlexKitObsidianPlugin extends Plugin {
  private runtimeHost?: SlexKitMarkdownRuntimeHost;

  async onload(): Promise<void> {
    this.runtimeHost = createSlexKitMarkdownRuntimeHost({
      mode: "trusted",
      theme: "host-shadcn",
    });

    for (const language of LANGUAGES) {
      this.registerMarkdownCodeBlockProcessor(language, (source, el, ctx) => {
        const artifactId = `obsidian:${ctx.sourcePath || "unknown"}`;
        ctx.addChild(new SlexKitReadonlyBlock(el, source, artifactId, this.runtimeHost!));
      });
    }
  }

  onunload(): void {
    this.runtimeHost?.disposeAll();
    this.runtimeHost = undefined;
  }
}
