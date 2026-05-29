import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(import.meta.dir, "..");

function resolvePackageFile(specifier: string): string {
  return fileURLToPath(import.meta.resolve(specifier));
}

async function buildMain(): Promise<void> {
  const runtimePath = resolvePackageFile("slexkit/dist/slexkit.js");
  const result = await Bun.build({
    entrypoints: [join(packageRoot, "src", "main.ts")],
    outfile: join(packageRoot, "main.js"),
    target: "browser",
    format: "cjs",
    write: true,
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
    },
  });

  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error("Bun failed to build Obsidian plugin main.js");
  }

  const output = result.outputs.find((item) => item.kind === "entry-point") ?? result.outputs[0];
  if (!output) throw new Error("Bun did not return an Obsidian plugin bundle.");
  const bundle = `${await output.text()}
var SlexKitObsidianPlugin = module.exports.default || module.exports;
module.exports = SlexKitObsidianPlugin;
module.exports.default = SlexKitObsidianPlugin;
`;
  await writeFile(join(packageRoot, "main.js"), bundle);
}

async function buildStyles(): Promise<void> {
  const coreCssPath = resolvePackageFile("slexkit/style.css");
  const [coreCss, obsidianCss] = await Promise.all([
    readFile(coreCssPath, "utf-8"),
    readFile(join(packageRoot, "src", "obsidian.css"), "utf-8"),
  ]);
  await writeFile(
    join(packageRoot, "styles.css"),
    `${coreCss.trim()}\n\n/* Obsidian host bridge */\n${obsidianCss.trim()}\n`,
  );
}

async function buildManifest(): Promise<void> {
  const [packageText, manifestText] = await Promise.all([
    readFile(join(packageRoot, "package.json"), "utf-8"),
    readFile(join(packageRoot, "manifest.json"), "utf-8"),
  ]);
  const pkg = JSON.parse(packageText) as { version?: string };
  const manifest = JSON.parse(manifestText) as { version?: string };
  if (!pkg.version) throw new Error("package.json is missing version.");
  manifest.version = pkg.version;
  await writeFile(join(packageRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
}

await Promise.all([
  buildMain(),
  buildStyles(),
  buildManifest(),
]);
