import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { dirname } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(import.meta.dir, "..");
const componentCssEntries = [
  "button",
  "choice",
  "content",
  "disclosure",
  "display",
  "feedback",
  "input",
  "select",
  "slider",
  "submit",
  "switch",
  "tabs",
] as const;

type BunBuildResult = {
  success: boolean;
  logs: unknown[];
  outputs: Array<{
    kind: string;
    text(): Promise<string>;
  }>;
};

type BunPluginBuild = {
  onResolve(
    options: { filter: RegExp },
    callback: (args: { path: string }) => { path: string } | undefined,
  ): void;
};

type BunBuildConfig = {
  entrypoints: string[];
  target: "browser";
  format: "cjs";
  write: false;
  external: string[];
  plugins: Array<{
    name: string;
    setup(build: BunPluginBuild): void;
  }>;
  minify: boolean;
  sourcemap: "none";
  define: Record<string, string>;
};

function resolvePackageFile(specifier: string): string {
  return fileURLToPath(import.meta.resolve(specifier));
}

async function buildMain(): Promise<void> {
  const runtimePath = resolvePackageFile("slexkit/dist/slexkit.js");
  const frameRuntimePath = resolvePackageFile("slexkit/dist/runtime.js");
  const frameRuntimeBytes = await readFile(frameRuntimePath);
  // Obsidian resources are file/app URLs. A sandboxed iframe has an opaque
  // origin and cannot module-import those URLs without CORS headers, so the
  // release bundle supplies the self-contained runner as an explicit data URL.
  const frameRuntimeUrl = `data:text/javascript;base64,${frameRuntimeBytes.toString("base64")}`;
  const stylesheetPath = resolvePackageFile("slexkit/style.css");
  const css = await readFile(stylesheetPath, "utf8");
  const embeddedFonts = new Map<string, string>();
  for (const match of css.matchAll(/url\(["']?(fonts\/[^)"']+)["']?\)/g)) {
    const fontPath = match[1];
    if (!embeddedFonts.has(fontPath)) {
      const bytes = await readFile(join(dirname(stylesheetPath), fontPath));
      const mime = fontPath.endsWith(".woff2") ? "font/woff2" : fontPath.endsWith(".woff") ? "font/woff" : "font/ttf";
      embeddedFonts.set(fontPath, `data:${mime};base64,${bytes.toString("base64")}`);
    }
  }
  const frameCss = css.replace(/url\(["']?(fonts\/[^)"']+)["']?\)/g, (_match, path) => `url("${embeddedFonts.get(path)}")`);
  const frameStyleUrl = `data:text/css;base64,${Buffer.from(frameCss).toString("base64")}`;
  const build = Bun.build as unknown as (config: BunBuildConfig) => Promise<BunBuildResult>;
  const result = await build({
    entrypoints: [join(packageRoot, "src", "main.ts")],
    target: "browser",
    format: "cjs",
    write: false,
    external: ["obsidian"],
    plugins: [{
      name: "slexkit-runtime",
      setup(build) {
        build.onResolve({ filter: /^slexkit$/ }, () => ({
          path: runtimePath,
        }));
      },
    }],
    minify: true,
    sourcemap: "none",
    define: {
      "process.env.NODE_ENV": JSON.stringify("production"),
      // The host is a CJS plugin, not a publicly served ESM asset. Every frame
      // receives the exact embedded runtime/CSS URLs below; retain no build
      // machine file URL as an implicit runtime location in the host bundle.
      "import.meta.url": JSON.stringify("data:text/javascript,"),
      __SLEXKIT_FRAME_RUNTIME_URL__: JSON.stringify(frameRuntimeUrl),
      __SLEXKIT_FRAME_STYLE_URL__: JSON.stringify(frameStyleUrl),
    },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Bun failed to build Obsidian plugin main.js");
  }

  const output = result.outputs.find((item) => item.kind === "entry-point") ?? result.outputs[0];
  if (!output) throw new Error("Bun did not return an Obsidian plugin bundle.");
  const outputText = await output.text();
  const bundle = `${outputText}
var SlexKitObsidianPlugin = module.exports.default || module.exports;
module.exports = SlexKitObsidianPlugin;
module.exports.default = SlexKitObsidianPlugin;
`;
  await writeFile(join(packageRoot, "main.js"), bundle);
  const runtimePackage = JSON.parse(await readFile(join(dirname(runtimePath), "..", "package.json"), "utf8"));
  if (runtimePackage.version !== "0.5.0") throw new Error(`Expected exact SlexKit 0.5.0; received ${runtimePackage.version}`);
  const runtimeBytes = await readFile(runtimePath);
  await writeFile(join(packageRoot, "runtime-build.json"), JSON.stringify({
    pluginVersion: "0.5.0", runtimeVersion: runtimePackage.version, protocolVersion: "html-1",
    runtimeSha256: createHash("sha256").update(runtimeBytes).digest("hex"),
    frameRuntimeSha256: createHash("sha256").update(frameRuntimeBytes).digest("hex"),
    frameStylesSha256: createHash("sha256").update(frameCss).digest("hex"),
    embeddedFontAssets: embeddedFonts.size,
    mainBytes: Buffer.byteLength(bundle), mainGzipBytes: gzipSync(bundle).byteLength,
  }, null, 2) + "\n");
}

async function buildStyles(): Promise<void> {
  const cssPaths = [
    resolvePackageFile("slexkit/base.css"),
    ...componentCssEntries.map((entry) => resolvePackageFile(`slexkit/components/${entry}.css`)),
  ];
  const [componentCss, obsidianCss] = await Promise.all([
    Promise.all(cssPaths.map((path) => readFile(path, "utf-8"))).then((parts) => parts.join("\n\n")),
    readFile(join(packageRoot, "src", "obsidian.css"), "utf-8"),
  ]);
  const releaseCss = sanitizeObsidianCss(componentCss);
  await writeFile(
    join(packageRoot, "styles.css"),
    `${releaseCss.trim()}\n\n/* Obsidian host bridge */\n${obsidianCss.trim()}\n`,
  );
}

function removeRulesContaining(css: string, pattern: RegExp): string {
  return css.replace(/[^{}@][^{}]*\{[^{}]*\}/g, (rule) => (pattern.test(rule) ? "" : rule));
}

function sanitizeObsidianCss(css: string): string {
  let next = css;

  next = removeRulesContaining(next, /(^|[\n,{]\s*):root\b/);
  next = removeRulesContaining(next, /(^|[\n\s,{>+~]\s*)body(?:[.\[:#\s,{]|$)/);
  next = removeRulesContaining(next, /(^|[\n,{]\s*)#mobileNav\b/);
  next = removeRulesContaining(next, /(^|[\n,{]\s*)\.slexkit-theme-(?:uno|flowbite)\b/);
  next = removeRulesContaining(next, /(^|[\n,{]\s*)\.slexkit-source-(?:toolbar|button)\b/);
  next = removeRulesContaining(next, /(^|[\n,{]\s*)\.slexkit-preview\b/);
  next = removeRulesContaining(next, /:has\(/);
  next = removeRulesContaining(next, /::-webkit-scrollbar/);
  next = removeRulesContaining(next, /\.underline\s*\{/);

  next = next
    .replace(/@media[^{]+\{\s*\}/g, "")
    .replace(/\s*text-decoration(?:-[\w-]+)?\s*:[^;{}]+;/g, "")
    .replace(/\s*scrollbar-(?:width|color|gutter)\s*:[^;{}]+;/g, "")
    .replace(/\s*clip-path\s*:[^;{}]+;/g, "")
    .replace(/\s*-webkit-mask(?:-[\w-]+)?\s*:[^;{}]+;/g, "")
    .replace(/\s*mask(?:-[\w-]+)?\s*:[^;{}]+;/g, "")
    .replace(/display\s*:\s*contents\s*;/g, "display: block;")
    .replace(/\s*!important/g, "")
    .replace(/,\s*ui-sans-serif\s*,\s*system-ui\s*,\s*-apple-system\s*,\s*BlinkMacSystemFont\s*,\s*"Segoe UI"/g, "")
    .replace(/\s*ui-sans-serif\s*,\s*system-ui\s*,\s*-apple-system\s*,\s*BlinkMacSystemFont\s*,\s*"Segoe UI"\s*,\s*/g, "")
    .replace(/\s*system-ui\s*,\s*-apple-system\s*,\s*BlinkMacSystemFont\s*,\s*"Segoe UI"\s*,\s*/g, "")
    .replace(/\s*system-ui\s*,\s*-apple-system\s*,\s*BlinkMacSystemFont\s*,\s*/g, "");

  return next;
}

async function buildManifest(): Promise<void> {
  const [packageText, manifestText, versionsText] = await Promise.all([
    readFile(join(packageRoot, "package.json"), "utf-8"),
    readFile(join(packageRoot, "manifest.json"), "utf-8"),
    readFile(join(packageRoot, "versions.json"), "utf-8"),
  ]);
  const pkg = JSON.parse(packageText) as { version?: string };
  const manifest = JSON.parse(manifestText) as { minAppVersion?: string; version?: string };
  const versions = JSON.parse(versionsText) as Record<string, string>;
  if (!pkg.version) throw new Error("package.json is missing version.");
  if (!manifest.minAppVersion) throw new Error("manifest.json is missing minAppVersion.");
  manifest.version = pkg.version;
  versions[pkg.version] = manifest.minAppVersion;
  await Promise.all([
    writeFile(join(packageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(join(packageRoot, "versions.json"), `${JSON.stringify(versions, null, 2)}\n`),
  ]);
}

await Promise.all([
  buildMain(),
  buildStyles(),
  buildManifest(),
]);
