// Bundles the real preset code and inlines it into one standalone HTML page.
// Run: node tools/gradient-lab/build.mjs [template-name] [output-name]
//   default: template.html -> docs/gradient-lab.html
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..", "..");
const templateName = process.argv[2] ?? "template.html";
const outName = process.argv[3] ?? "gradient-lab.html";

const result = await build({
  entryPoints: [resolve(here, "entry.ts")],
  bundle: true,
  write: false,
  format: "iife",
  minify: true,
  alias: { "@": resolve(root, "apps/web/src") },
});

const bundle = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const template = readFileSync(resolve(here, templateName), "utf8");
const out = template.replace("/*__BUNDLE__*/", () => bundle);
writeFileSync(resolve(root, "docs", outName), out);
console.log(`wrote docs/${outName}`);
