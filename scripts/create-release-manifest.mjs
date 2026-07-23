import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = process.cwd();
const includedRoots = ["src", "scripts", "tests", "docs", "public", "research", "data/v4", "design", "experiments/sealed-tieban-v4"];
const excludedDirectoryNames = new Set(["artifacts", "raw", "node_modules", ".next"]);
const includedFiles = [
  "README.md",
  "design-qa-v4.md",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "next.config.ts",
  "tsconfig.json",
  "evaluation/pool-size-simulation.json",
  "evaluation/validation-dataset.template.json",
  "evaluation/verification-report.md",
  "evaluation/conditional-applicability-v1.json",
  "evaluation/conditional-applicability-v1.md",
  "evaluation/global-event-graph-v1.json",
  "evaluation/global-event-graph-v1.md",
  "evaluation/records/README.md"
];

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory() && excludedDirectoryNames.has(entry.name)) return [];
      return entry.isDirectory() ? walk(path) : [path];
    });
}

const paths = [
  ...includedFiles.map((file) => resolve(root, file)).filter(existsSync),
  ...includedRoots.flatMap((directory) => walk(resolve(root, directory)))
].filter((path) => statSync(path).isFile());

const files = paths
  .map((path) => ({
    path: relative(root, path).replaceAll("\\", "/"),
    bytes: statSync(path).size,
    sha256: createHash("sha256").update(readFileSync(path)).digest("hex")
  }))
  .sort((a, b) => a.path.localeCompare(b.path));

const manifest = {
  schemaVersion: "1.0.0",
  modelVersion: "20260720-v4.2.1",
  generatedAt: new Date().toISOString(),
  fileCount: files.length,
  sourceTreeSha256: createHash("sha256").update(files.map((file) => `${file.path}:${file.sha256}`).join("\n")).digest("hex"),
  files
};

const outputPath = resolve(root, "release-manifest.json");
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Release manifest written: ${outputPath}`);
