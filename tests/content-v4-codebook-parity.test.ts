import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  birthSeedFingerprint,
  buildCandidateCodebook,
  type CandidateCodebook,
  type CandidateCodebookInput,
  type CodebookCalibrationClauseInput,
  type CodebookConstraintInput,
  type CodebookFactInput,
  type CodebookFateClauseInput
} from "@/lib/tieban-v4-codebook";

// @ts-expect-error The parity oracle is deliberately the untyped JavaScript source implementation.
import { buildCandidateCodebook as buildCandidateCodebookJs } from "../scripts/v4/codebook-core-v4.mjs";

const PROJECT_ROOT = resolve(process.cwd());

async function readJson<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(resolve(PROJECT_ROOT, "data/v4", name), "utf8")) as T;
}

interface ManifestFile {
  corpusVersion: string;
}

interface FactsFile {
  facts: CodebookFactInput[];
}

interface CalibrationFile {
  clauses: CodebookCalibrationClauseInput[];
}

interface FateFile {
  clauses: CodebookFateClauseInput[];
}

interface ConstraintsFile {
  constraints: CodebookConstraintInput[];
}

describe("V4码本TypeScript与JavaScript单一真源一致性", () => {
  let reference: CandidateCodebook;
  let tsCodebook: CandidateCodebook;
  let jsCodebook: CandidateCodebook;

  beforeAll(async () => {
    const [manifest, factsFile, calibrationFile, fateFile, constraintsFile, referenceFile] = await Promise.all([
      readJson<ManifestFile>("manifest.json"),
      readJson<FactsFile>("facts.json"),
      readJson<CalibrationFile>("calibration-clauses.json"),
      readJson<FateFile>("fate-clauses.json"),
      readJson<ConstraintsFile>("constraints.json"),
      readJson<CandidateCodebook>("reference-codebook.json")
    ]);
    reference = referenceFile;
    const input: CandidateCodebookInput = {
      birthSeed: reference.birthSeed,
      corpusVersion: manifest.corpusVersion,
      facts: factsFile.facts,
      calibrationClauses: calibrationFile.clauses,
      fateClauses: fateFile.clauses,
      constraints: constraintsFile.constraints
    };
    tsCodebook = buildCandidateCodebook(input);
    jsCodebook = buildCandidateCodebookJs(input) as CandidateCodebook;
  });

  it("fingerprint、contentDigest与replayKey完全一致", () => {
    expect(birthSeedFingerprint(reference.birthSeed)).toBe(reference.seedFingerprint);
    expect(tsCodebook.seedFingerprint).toBe(jsCodebook.seedFingerprint);
    expect(tsCodebook.seedFingerprint).toBe(reference.seedFingerprint);
    expect(tsCodebook.contentDigest).toBe(jsCodebook.contentDigest);
    expect(tsCodebook.contentDigest).toBe(reference.contentDigest);
    expect(tsCodebook.replayKey).toBe(jsCodebook.replayKey);
    expect(tsCodebook.replayKey).toBe(reference.replayKey);
    expect(tsCodebook.birthSeed).toEqual(reference.birthSeed);
    expect(tsCodebook.birthSeedFieldsUsed).toEqual(reference.birthSeedFieldsUsed);
  });

  it("120候选的先验、全部事实概率、命书条ID与签名逐字段一致", () => {
    expect(tsCodebook.candidates).toHaveLength(120);
    expect(jsCodebook.candidates).toHaveLength(120);
    expect(reference.candidates).toHaveLength(120);

    for (let index = 0; index < 120; index += 1) {
      const tsCandidate = tsCodebook.candidates[index];
      const jsCandidate = jsCodebook.candidates[index];
      const referenceCandidate = reference.candidates[index];

      expect(tsCandidate.id).toBe(jsCandidate.id);
      expect(tsCandidate.id).toBe(referenceCandidate.id);
      expect(tsCandidate.minuteOffset).toBe(jsCandidate.minuteOffset);
      expect(tsCandidate.prior).toBe(jsCandidate.prior);
      expect(tsCandidate.prior).toBe(referenceCandidate.prior);
      expect(tsCandidate.factProbabilities).toEqual(jsCandidate.factProbabilities);
      expect(tsCandidate.factProbabilities).toEqual(referenceCandidate.factProbabilities);
      expect(tsCandidate.exclusiveSelections).toEqual(jsCandidate.exclusiveSelections);
      expect(tsCandidate.exclusiveSelections).toEqual(referenceCandidate.exclusiveSelections);
      expect(tsCandidate.coreFactIds).toEqual(jsCandidate.coreFactIds);
      expect(tsCandidate.coreFactIds).toEqual(referenceCandidate.coreFactIds);
      expect(tsCandidate.coreFactsByDomain).toEqual(jsCandidate.coreFactsByDomain);
      expect(tsCandidate.coreFactsByDomain).toEqual(referenceCandidate.coreFactsByDomain);
      expect(tsCandidate.fateClauseIds).toEqual(jsCandidate.fateClauseIds);
      expect(tsCandidate.fateClauseIds).toEqual(referenceCandidate.fateClauseIds);
      expect(tsCandidate.fateClauseCountByCategory).toEqual(jsCandidate.fateClauseCountByCategory);
      expect(tsCandidate.signature).toBe(jsCandidate.signature);
      expect(tsCandidate.signature).toBe(referenceCandidate.signature);
    }
  });

  it("全部考刻映射概率与映射摘要逐字段一致", () => {
    expect(tsCodebook.clauseMappings).toHaveLength(reference.clauseMappings.length);
    expect(jsCodebook.clauseMappings).toHaveLength(reference.clauseMappings.length);

    for (let index = 0; index < reference.clauseMappings.length; index += 1) {
      const tsMapping = tsCodebook.clauseMappings[index];
      const jsMapping = jsCodebook.clauseMappings[index];
      const referenceMapping = reference.clauseMappings[index];

      expect(tsMapping.clauseId).toBe(jsMapping.clauseId);
      expect(tsMapping.clauseId).toBe(referenceMapping.clauseId);
      expect(tsMapping.candidatePYes).toEqual(jsMapping.candidatePYes);
      expect(tsMapping.candidatePYes).toEqual(referenceMapping.candidatePYes);
      expect(tsMapping.yesCandidateCount).toBe(jsMapping.yesCandidateCount);
      expect(tsMapping.noCandidateCount).toBe(jsMapping.noCandidateCount);
      expect(tsMapping.splitRatio).toBe(jsMapping.splitRatio);
      expect(tsMapping.binaryEntropy).toBe(jsMapping.binaryEntropy);
      expect(tsMapping.mappingDigest).toBe(jsMapping.mappingDigest);
      expect(tsMapping.mappingDigest).toBe(referenceMapping.mappingDigest);
    }
  });

  it("顶层计数与回答前生成标志一致", () => {
    const fields = [
      "schemaVersion",
      "corpusVersion",
      "generatedBeforeAnswers",
      "answerHistoryUsed",
      "candidateCount",
      "factCount",
      "calibrationClauseCount",
      "fateClauseCount",
      "mutualExclusionGroupCount"
    ] as const;
    for (const field of fields) {
      expect(tsCodebook[field]).toBe(jsCodebook[field]);
      expect(tsCodebook[field]).toBe(reference[field]);
    }
  });
});

