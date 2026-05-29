# @slexkit/obsidian

Readonly Obsidian renderer for explicit Slex fenced UI blocks.

## Install

Build the plugin package from this repository:

```sh
bun install
bun run build
```

Copy the generated release files into an Obsidian vault plugin folder:

```text
.obsidian/plugins/slexkit/
  main.js
  manifest.json
  styles.css
```

Enable **SlexKit** from Obsidian's community plugin settings. The plugin runs in reading mode and does not write generated content back to the vault.

## Usage

````md
```slex
{
  namespace: "status",
  g: {},
  layout: {
    "text:message": { text: "Rendered by SlexKit" }
  }
}
```
````

The plugin registers the `slex` fenced code block processor in reading mode. It renders the block into the preview container and does not write back to the vault. Blocks in the same note share one trusted SlexKit markdown artifact runtime, so state-only fences can seed later renderable fences.

## Runtime boundary

This v0 adapter is a readonly trusted renderer for local vault content. It uses the trusted runtime path because Obsidian renders local files inside the plugin environment.

Do not use this plugin as a sandbox for arbitrary third-party or agent-generated Markdown. Obsidian secure sandbox mode is intentionally not exposed yet; hosts that need untrusted execution should use SlexKit's secure iframe runtime in a web host.

## Release assets

The Obsidian plugin assets are emitted to `dist/`:

- `main.js`
- `manifest.json`
- `styles.css`

`manifest.json` is generated from the package template and this package version during build, so release assets stay version-synced with the npm package.

## Troubleshooting

- If a block does not render, confirm the fence language is exactly `slex`.
- If styles look unthemed, confirm `styles.css` was copied next to `main.js`.
- If Obsidian cannot load the plugin, rebuild and copy all three release assets together.
