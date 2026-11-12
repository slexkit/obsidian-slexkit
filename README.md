<div align="center">
  <p>
    <img src="assets/logo.svg" alt="SlexKit" width="84" height="84" />
  </p>
  <h1>SlexKit for Obsidian</h1>
  <p><strong>A portable reactive component runtime for interactive Markdown.</strong></p>
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

SlexKit is a portable reactive component runtime for interactive Markdown. This plugin brings that runtime into Obsidian reading and Live Preview. A `slex` fence contains an HTML fragment with native HTML/SVG, `slex-*` custom elements, optional CSS, and optional inline module scripts.

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
<slex-card title="Vault status" data-key="status">
  <slex-badge label="Ready" tone="success"></slex-badge>
  <slex-stat id="count" label="Clicks" value="0"></slex-stat>
  <slex-button id="add" label="+1"></slex-button>
</slex-card>
<script type="module">
  const count = slex.root.querySelector("#count");
  const add = slex.root.querySelector("#add");
  let value = 0;
  add.addEventListener("click", () => { count.value = ++value; });
</script>
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

Every fence runs in an isolated sandboxed iframe. The bundled frame runtime is supplied as an explicit data URL because an opaque-origin iframe cannot import an Obsidian `file:`/`app:` resource without CORS. Static checks reject known executable HTML hazards, but they are not a safety proof and the sandbox is not complete CPU or network isolation.

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

The release build emits the installable plugin assets and community version
map at the repository root:

- `main.js`
- `manifest.json`
- `styles.css`
- `versions.json`

GitHub Releases upload only the installable plugin assets: `main.js`,
`manifest.json`, and `styles.css`. `versions.json` stays in the repository for
the Obsidian community directory version map.

Release assets are built by GitHub Actions from the pushed version tag. The
workflow runs `bun run check`, verifies the generated root assets have no
uncommitted diff, and creates GitHub artifact attestations for `main.js`,
`manifest.json`, and `styles.css`.

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
vault, open the generated folder manually with **Open folder as vault**. On the
first open, Obsidian may ask whether you trust the vault author; trust only the
disposable smoke vault so the local plugin can run.
The smoke note contains an HTML-first cross-fence state lab. One control panel
and two observer panels communicate through the artifact-local `slex.shared`
store; changing the control panel should update both observers in one note.

For a disposable smoke vault, you can opt in to registering the folder in
Obsidian's global vault registry before opening it:

```sh
bun run vault:smoke -- --vault /path/to/vault --enable --register-vault --open
```

`--register-vault` creates a timestamped backup of Obsidian's registry before
writing it. Do not use it against a personal vault unless you intend to add that
folder to Obsidian's vault switcher. If Obsidian is already running, it may not
see a newly registered vault until restart; use **Open folder as vault** if the
URI opens an error dialog.

For a fully isolated desktop smoke test, point the registry and launch at a
temporary Obsidian user data directory:

```sh
bun run vault:smoke -- --vault /path/to/vault --enable --register-vault --open \
  --user-data-dir /path/to/obsidian-userdata \
  --obsidian-exe /path/to/Obsidian.exe
```

This leaves your normal vault registry untouched. Obsidian may still ask you to
trust the disposable smoke vault before community plugins can run.

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
uploads the three plugin assets downloaded by Community Plugins and BRAT:
`main.js`, `manifest.json`, and `styles.css`.

The same workflow also creates provenance attestations for those assets. To
verify a downloaded release asset locally:

```sh
gh attestation verify main.js --repo slexkit/obsidian-slexkit
gh attestation verify styles.css --repo slexkit/obsidian-slexkit
gh attestation verify manifest.json --repo slexkit/obsidian-slexkit
```


## 0.5.0

Version 0.5.0 uses the HTML-first document protocol and isolated frame execution. Existing object-tree Slex fences must be rewritten as HTML and Web Components. Static inspection does not make third-party or model-generated code trusted. Do not treat the plugin as a complete isolation boundary for unreviewed source.

Each Markdown view and note path owns its artifact. Fences in one artifact can opt into JSON state through `slex.shared`; panes and popout windows are independent. Temporary render-child unloads retain committed contributions; closing a view, switching its file, or unloading the plugin releases the artifact. Interaction state is never written into the note file.

Install the exact runtime version and check the plugin:

```sh
bun install --frozen-lockfile
bun run check
```

The development and peer dependencies use exactly `slexkit@0.5.4`. The plugin build rejects any runtime with another version, embeds the self-contained frame runner as an explicit data URL, and records runtime hashes plus raw/gzip bundle sizes in `runtime-build.json`.

Reading and Live Preview surfaces share the view's artifact; only the surface selected by `MarkdownView.getMode()` owns its live preview nodes. Late processing of a hidden surface cannot take those nodes away. Switching notes or closing views releases their artifacts; no interaction state is written to notes.

The recent desktop blank-frame fix has automated regression coverage, but still needs verification in the actual Obsidian desktop application. Package checks alone do not establish desktop acceptance; use a disposable vault and an isolated user data directory for that check.
