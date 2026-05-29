<div align="center">
  <p>
    <img src="assets/logo.svg" alt="SlexKit" width="84" height="84" />
  </p>
  <h1>SlexKit for Obsidian</h1>
  <p><strong>Interactive Slex blocks inside your Obsidian notes.</strong></p>
  <p>
    SlexKit turns explicit <code>slex</code> Markdown fences into live, stateful UI blocks while keeping the surrounding note plain Markdown.
  </p>
  <p>
    <a href="https://slexkit.dev">Website</a> ·
    <a href="https://slexkit.dev/docs">Docs</a> ·
    <a href="https://slexkit.dev/docs/components">Components</a> ·
    <a href="https://slexkit.dev/playground">Playground</a>
  </p>
</div>

## What it does

SlexKit renders interactive interface fragments directly in Obsidian reading mode. A Slex block is a JavaScript object literal: `g` holds state and logic, `layout` describes the component tree, and the plugin renders the result in place.

Use it for notes that need more than static Markdown:

- Interactive calculators and engineering worksheets
- Parameter panels, forms, and small dashboards
- AI-generated UI blocks with readable Markdown fallback
- Reusable status cards, toggles, metrics, and tool results

SlexKit only processes fences whose language is exactly `slex`. Ordinary `js`, `json`, and unlabeled code blocks stay inert.

## Example

Write a Slex fence in a note:

````md
```slex
{
  slex: "0.1",
  namespace: "vault_status",
  g: { count: 0 },
  layout: {
    "card:status": {
      title: "Vault status",
      "badge:ready": { label: "Ready", tone: "success" },
      "text:count": { "$text": "'Clicks: ' + g.count" },
      "button:add": {
        label: "+1",
        onclick: "g.count++"
      }
    }
  }
}
```

Vault status: Ready. Clicks: 0.
````

In Obsidian reading mode, the fence becomes an interactive card. In Markdown environments without SlexKit, the fallback text remains readable.

## Install

Once the plugin is available in the Obsidian Community Plugins directory:

1. Open **Settings -> Community plugins**.
2. Disable **Restricted mode** if needed.
3. Search for **SlexKit**.
4. Install and enable the plugin.

For manual installation, download the latest GitHub release and copy these files into your vault:

```text
.obsidian/plugins/slexkit/
  main.js
  manifest.json
  styles.css
```

Then enable **SlexKit** from Obsidian's community plugin settings.

## Notes and boundaries

The Obsidian plugin targets local vault content. Rendered SlexKit components can be interactive, but the adapter keeps a vault-readonly boundary: it does not write generated content or interaction state back to Markdown files.

This v0 adapter uses SlexKit's trusted runtime because Obsidian renders local files inside the plugin environment. Do not use this plugin as a sandbox for arbitrary third-party Markdown or unreviewed agent output. Hosts that need untrusted execution should use SlexKit's secure iframe runtime in a web host.

## Links

- SlexKit website: <https://slexkit.dev>
- SlexKit documentation: <https://slexkit.dev/docs>
- Component catalog: <https://slexkit.dev/docs/components>
- Playground: <https://slexkit.dev/playground>
- SlexKit repository: <https://github.com/slexkit/slexkit>
- Obsidian plugin repository: <https://github.com/slexkit/obsidian-slexkit>
- npm package: <https://www.npmjs.com/package/@slexkit/obsidian>

## Development

```sh
bun install
bun run build
bun run test
```

The Obsidian release assets are emitted at the repository root:

- `main.js`
- `manifest.json`
- `styles.css`
