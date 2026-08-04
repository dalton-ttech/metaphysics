import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_FONT = resolve(ROOT, "node_modules/@fontpkg/huiwen-mincho/Huiwen-mincho.otf");
const OUTPUT_FONT = resolve(ROOT, "public/fonts/huiwen-mincho-product.woff2");
const GLYPH_FILE = resolve(ROOT, ".tmp/huiwen-product-glyphs.txt");
const FONTTOOLS_DIR = resolve(ROOT, ".tmp/fonttools");
const INCLUDED_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".json"]);
const INCLUDED_ROOTS = [resolve(ROOT, "src"), resolve(ROOT, "data/v4")];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (INCLUDED_EXTENSIONS.has(extname(entry.name))) files.push(path);
  }
  return files;
}

const files = (await Promise.all(INCLUDED_ROOTS.map(filesUnder))).flat();
const glyphs = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz，。！？；：、“”‘’（）《》—…·+-/% ");
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const character of content.normalize("NFC")) {
    if (!/\s/u.test(character)) glyphs.add(character);
  }
}

await mkdir(dirname(GLYPH_FILE), { recursive: true });
await mkdir(dirname(OUTPUT_FONT), { recursive: true });
await writeFile(GLYPH_FILE, [...glyphs].join(""), "utf8");

const result = spawnSync("python", [
  "-m",
  "fontTools.subset",
  SOURCE_FONT,
  `--text-file=${GLYPH_FILE}`,
  `--output-file=${OUTPUT_FONT}`,
  "--flavor=woff2",
  "--layout-features=*",
  "--notdef-glyph",
  "--notdef-outline",
  "--recommended-glyphs",
  "--name-IDs=*",
  "--name-legacy",
  "--name-languages=*"
], {
  env: { ...process.env, PYTHONPATH: FONTTOOLS_DIR },
  stdio: "inherit"
});

if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

console.log(`Generated ${OUTPUT_FONT} from ${glyphs.size} product glyphs.`);
