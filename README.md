<div align="center">
  <p>
    <img src="assets/logo.svg" alt="SlexKit" width="84" height="84" />
  </p>
  <h1>SlexKit for Obsidian</h1>
  <p><strong>Markdown-friendly reactive UI runtime for explicit <code>slex</code> fences.</strong></p>
  <p>
    This plugin renders explicit <code>slex</code> Markdown fences in Obsidian using the SlexKit runtime.
  </p>
  <p>
    <a href="https://slexkit.dev">Website</a> ·
    <a href="https://slexkit.dev/docs">Docs</a> ·
    <a href="https://slexkit.dev/docs/components">Components</a> ·
    <a href="https://slexkit.dev/playground">Playground</a>
  </p>
</div>

## What it does

SlexKit is a Markdown-friendly reactive UI runtime and component kit for explicit `slex` fences. This plugin brings that runtime into Obsidian reading mode. A `slex` fence contains a JavaScript object literal: `g` holds state and logic, `layout` describes the component tree, and the plugin renders the result in place.

Use it for notes that need more than static Markdown:

- Interactive calculators and engineering worksheets
- Parameter panels, forms, and small dashboards
- AI-generated UI blocks with readable Markdown fallback
- Reusable status cards, toggles, metrics, and tool results

SlexKit only processes fences whose language is exactly `slex`. Ordinary `js`, `json`, and unlabeled code blocks stay inert.

## Example

Write an explicit `slex` fence in a note:

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

## Install from Community Plugins

Once the plugin is available in the Obsidian Community Plugins directory:

1. Open **Settings -> Community plugins**.
2. Disable **Restricted mode** if needed.
3. Search for **SlexKit**.
4. Install and enable the plugin.

## Install with BRAT

Before the plugin is listed in the Community Plugins directory, install it with
[BRAT](https://github.com/TfTHacker/obsidian42-brat):

1. Install and enable BRAT.
2. Run **BRAT: Add a beta plugin for testing**.
3. Enter `https://github.com/slexkit/obsidian-slexkit`.
4. Enable **SlexKit** from Community plugins.

## Manual Install

Download the latest GitHub release and copy these files into your vault:

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

This release is desktop-only. Mobile support should be enabled after real mobile vault testing.

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
bun run typecheck
bun run smoke:release
```

The Obsidian release assets are emitted at the repository root:

- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`

Run the full local gate before tagging a release:

```sh
bun run check
```

Run the community submission preflight after the GitHub release exists:

```sh
bun run community:check
```

See [COMMUNITY_SUBMISSION.md](COMMUNITY_SUBMISSION.md) for the community
directory entry, PR title, and manual confirmation checklist.

Prepare a real vault smoke test with:

```sh
bun run vault:smoke -- --vault /path/to/vault --enable --open
```

`--open` asks Obsidian to open `SlexKit Smoke.md`. If Obsidian stays on another
vault, open the generated folder manually with **Open folder as vault**.

For a disposable smoke vault, you can opt in to registering the folder in
Obsidian's global vault registry before opening it:

```sh
bun run vault:smoke -- --vault /path/to/vault --enable --register-vault --open
```

`--register-vault` creates a timestamped backup of Obsidian's registry before
writing it. Do not use it against a personal vault unless you intend to add that
folder to Obsidian's vault switcher.

After testing a disposable vault, remove the temporary registry entry with:

```sh
bun run vault:smoke -- --vault /path/to/vault --unregister-vault
```

## Release

1. Bump `package.json` to the next version.
2. Run `bun run build`; this syncs `manifest.json`, `versions.json`, `main.js`, and `styles.css`.
3. Run `bun run check`.
4. Commit the changed source and root release assets.
5. Push a matching version tag, for example `0.2.1`.

The GitHub Release workflow verifies that the tag matches `manifest.json` and
uploads the four plugin assets required by Community Plugins and BRAT:
`main.js`, `manifest.json`, `styles.css`, and `versions.json`.
