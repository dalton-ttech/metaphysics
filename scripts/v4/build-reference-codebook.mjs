import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCandidateCodebook } from "./codebook-core-v4.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, "../..");
const DATA_DIR = resolve(PROJECT_ROOT, "data/v4");

async function readJson(name) {
  return JSON.parse(await readFile(resolve(DATA_DIR, name), "utf8"));
}

const [manifest, factsFile, calibrationFile, fateFile, constraintsFile] = await Promise.all([
  readJson("manifest.json"),
  readJson("facts.json"),
  readJson("calibration-clauses.json"),
  readJson("fate-clauses.json"),
  readJson("constraints.json")
]);

const referenceBirthSeed = {
  birthDate: "1990-01-01",
  shichen: "子",
  gender: "未说明",
  birthplace: "北京"
};

const codebook = buildCandidateCodebook({
  birthSeed: referenceBirthSeed,
  corpusVersion: manifest.corpusVersion,
  facts: factsFile.facts,
  calibrationClauses: calibrationFile.clauses,
  fateClauses: fateFile.clauses,
  constraints: constraintsFile.constraints
});

await writeFile(resolve(DATA_DIR, "reference-codebook.json"), `${JSON.stringify(codebook, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ replayKey: codebook.replayKey, candidates: codebook.candidateCount, mappings: codebook.clauseMappings.length }, null, 2));
