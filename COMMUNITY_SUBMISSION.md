# Community Submission Packet

Use this packet when submitting SlexKit to the Obsidian Community Plugins directory.

## Current submission entry

Append this object to the end of `community-plugins.json` in `obsidianmd/obsidian-releases`:

```json
{
  "id": "slexkit",
  "name": "SlexKit",
  "author": "SlexKit",
  "description": "Render interactive SlexKit fenced blocks in reading mode.",
  "repo": "slexkit/obsidian-slexkit"
}
```

Print the current entry from the manifest:

```sh
bun run community:entry
```

Apply it to a local clone of `obsidianmd/obsidian-releases`:

```sh
node scripts/apply-community-entry.mjs --file ../obsidian-releases/community-plugins.json
```

PR title:

```text
Add plugin: SlexKit
```

## Preflight

Run these checks before opening or updating the PR:

```sh
bun run check
bun run community:check
```

`community:check` verifies the root manifest, release assets, CSS review-risk patterns, README install sections, community directory conflicts, removed-plugin conflicts, and the GitHub release assets for the current manifest version.

Prepare a real local vault smoke test:

```sh
bun run vault:smoke -- --vault /path/to/vault --enable --open
```

This copies `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/slexkit/` and writes `SlexKit Smoke.md`.
`--open` asks Obsidian to open `SlexKit Smoke.md`. If Obsidian stays on another vault, open the generated folder manually with **Open folder as vault**.
On the first open, Obsidian may ask whether you trust the vault author; trust only the disposable smoke vault so the local plugin can run.
The smoke note contains a cross-fence state lab; changing the main panel should update both observer panels that share `namespace: "example_cross_doc_lab"`.
For a disposable smoke vault, add `--register-vault` before `--open` to opt in to adding the folder to Obsidian's global vault registry. The script creates a timestamped backup first.
If Obsidian is already running, it may not see a newly registered vault until restart; use **Open folder as vault** if the URI opens an error dialog.
For an isolated desktop smoke test, add `--user-data-dir /path/to/obsidian-userdata --obsidian-exe /path/to/Obsidian.exe` so the test uses a temporary Obsidian registry instead of your normal one.
After testing, run `bun run vault:smoke -- --vault /path/to/vault --unregister-vault` to remove the temporary registry entry.

## Manual confirmations

Do not mark these as complete in a community submission until they have actually been checked:

- Verified on 2026-06-19 with Obsidian 1.12.7 desktop in an isolated temporary vault: `SlexKit Smoke.md` opened in reading mode and rendered the cross-fence state lab from release `0.3.3`.
- Verified the cross-fence state lab initial state on 2026-06-19 with Obsidian 1.12.7 desktop: the control panel, observer panel A, and observer panel B all rendered shared `namespace: "example_cross_doc_lab"` state as `blue`, `16px`, and `light`.
- Still verify the cross-fence state lab interaction before submission: changing the main panel in `namespace: "example_cross_doc_lab"` updates both observer panels in the same Markdown document.
- Verified the isolated smoke path does not modify the normal Obsidian vault registry; the normal registry still contained only the pre-existing vault after the test.
- Automated `bun run check` covers the Obsidian lifecycle cleanup path with `MarkdownRenderChild` and rendered block disposal.
- Confirmed this release is desktop-only. The manifest currently sets `isDesktopOnly` to `true`; mobile support should be enabled only after real mobile testing.
- Confirmed the GitHub release named by `manifest.json` contains individual `main.js`, `manifest.json`, and `styles.css` assets only through `bun run community:check`.
- Still confirm before opening the PR: current Obsidian Developer policies, submission requirements, plugin guidelines, and that the PR branch allows maintainers to edit it.

## Known non-blocking npm issue

Community plugin installation uses GitHub release assets, not npm. The npm package is still useful for package consumers, but `@slexkit/obsidian` currently requires npm Trusted Publishing to be pointed at this repository:

```text
Repository: slexkit/obsidian-slexkit
Workflow: .github/workflows/npm-publish.yml
Package: @slexkit/obsidian
```

After npm Trusted Publishing is configured, rerun the GitHub workflow:

```sh
gh workflow run npm-publish.yml --repo slexkit/obsidian-slexkit --ref main
```

Then verify:

```sh
npm view @slexkit/obsidian@0.3.4 version --json
```
