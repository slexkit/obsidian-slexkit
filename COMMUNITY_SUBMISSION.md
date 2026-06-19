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
bun run vault:smoke -- --vault /path/to/vault --enable
```

This copies `main.js`, `manifest.json`, and `styles.css` into `.obsidian/plugins/slexkit/` and writes `SlexKit Smoke.md`.

## Manual confirmations

Do not mark these as complete in a community submission until they have actually been checked:

- I have tested the plugin in Obsidian desktop reading mode with a real vault.
- I have tested a note containing an explicit `slex` fence and confirmed it renders.
- I have tested disable/re-enable or note navigation enough to confirm rendered blocks clean up through the Obsidian lifecycle.
- I have confirmed whether this release should claim mobile support. The manifest currently sets `isDesktopOnly` to `false`, so mobile behavior should be verified or the manifest should be changed before submission.
- I have reviewed the current Obsidian Developer policies, submission requirements, and plugin guidelines.
- I have confirmed the GitHub release named by `manifest.json` contains individual `main.js`, `manifest.json`, and `styles.css` assets.
- I have confirmed the PR branch allows maintainers to edit it.

## Known non-blocking npm issue

Community plugin installation uses GitHub release assets, not npm. The npm package is still useful for package consumers, but `@slexkit/obsidian@0.3.1` currently requires npm Trusted Publishing to be pointed at this repository:

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
npm view @slexkit/obsidian@0.3.1 version --json
```
