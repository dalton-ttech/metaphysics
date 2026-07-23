import { generateLifeBook } from "../book/generate-book.mjs";
import { V4_CONFIG } from "../config/experiment-config.mjs";
import { CLAUSE_CODEBOOK, FACT_CATALOG } from "../domain/fact-catalog.mjs";
import { integerFromKey, jaccard, mix32, sha256, unitFromIntegers } from "../lib/deterministic.mjs";
import { simulatePersonaAnswer } from "../personas/build-personas.mjs";

const CLAUSE_BY_ID = new Map(CLAUSE_CODEBOOK.map((clause) => [clause.id, clause]));

function independentTruth({ pool, subjectKey, minuteOffset, extreme }) {
  const subjectSeed = mix32(integerFromKey(subjectKey, 0xffffffff));
  const primary = pool.candidates[minuteOffset];
  const flipRate = extreme ? V4_CONFIG.outModel.extremeFlipRate : V4_CONFIG.outModel.ordinaryFlipRate;
  const factBits = Uint8Array.from(FACT_CATALOG, (fact, factIndex) => {
    const latent = primary.factBits[factIndex];
    const domainShift = unitFromIntegers(subjectSeed, factIndex, 0xd0a1) < 0.08 ? 0.04 : 0;
    const flip = unitFromIntegers(subjectSeed, factIndex, 0x1f123bb5) < Math.min(0.46, flipRate + domainShift);
    return flip ? 1 - latent : latent;
  });
  if (factBits.every((bit, index) => bit === primary.factBits[index])) factBits[subjectSeed % factBits.length] ^= 1;
  return factBits;
}

function confusion(predictedBits, truthBits, askedIndexes) {
  let truePositive = 0;
  let falsePositive = 0;
  let falseNegative = 0;
  let unaskedTruePositive = 0;
  let unaskedFalsePositive = 0;
  for (let index = 0; index < predictedBits.length; index += 1) {
    if (predictedBits[index] && truthBits[index]) truePositive += 1;
    if (predictedBits[index] && !truthBits[index]) falsePositive += 1;
    if (!predictedBits[index] && truthBits[index]) falseNegative += 1;
    if (!askedIndexes.has(index) && predictedBits[index] && truthBits[index]) unaskedTruePositive += 1;
    if (!askedIndexes.has(index) && predictedBits[index] && !truthBits[index]) unaskedFalsePositive += 1;
  }
  return { truePositive, falsePositive, falseNegative, unaskedTruePositive, unaskedFalsePositive };
}

function normalized(text) {
  return text.replace(/[\s，。；：“”、《》！？、]/g, "");
}

function hasEightGramReuse(question, book) {
  const source = normalized(question);
  const target = normalized(book);
  for (let index = 0; index <= source.length - 8; index += 1) {
    if (target.includes(source.slice(index, index + 8))) return true;
  }
  return false;
}

export function createSealedLifeSession({
  group,
  subjectKey,
  responseKey = subjectKey,
  pool,
  truthPool = pool,
  truthMode,
  persona,
  extreme = false
}) {
  const trueMinuteOffset = integerFromKey(`${subjectKey}/minute`, V4_CONFIG.candidateCount);
  const subjectSeed = mix32(integerFromKey(responseKey, 0xffffffff));
  const truthBits = truthMode === "in_model"
    ? Uint8Array.from(truthPool.candidates[trueMinuteOffset].factBits)
    : independentTruth({ pool: truthPool, subjectKey, minuteOffset: trueMinuteOffset, extreme });
  const truthCommitment = sha256({ subjectKey, truthPoolHash: truthPool.diagnostics.profileHash, trueMinuteOffset, truthBits: Array.from(truthBits) });
  const asked = [];
  let locked = false;

  const context = Object.freeze({
    descriptor: Object.freeze({
      id: `S4-${sha256({ group, subjectKey, responseKey, birthSeedId: pool.birthSeed.id, personaId: persona.id }).slice(0, 18)}`,
      group,
      personaId: persona.id,
      personaStrategy: persona.strategy,
      birthSeedId: pool.birthSeed.id,
      truthCommitment
    }),
    birthSeed: pool.birthSeed,
    pool,
    clauses: CLAUSE_CODEBOOK
  });

  async function ask(clauseId) {
    if (locked) throw new Error("Profile already locked; no further answers are accepted.");
    const clause = CLAUSE_BY_ID.get(clauseId);
    if (!clause) throw new Error(`Unknown clause: ${clauseId}`);
    if (asked.some((item) => item.clauseId === clauseId)) throw new Error(`Repeated clause: ${clauseId}`);
    const truth = truthBits[clause.factIndex] === 1;
    const answer = simulatePersonaAnswer({
      persona,
      subjectSeed,
      fact: FACT_CATALOG[clause.factIndex],
      truth,
      turn: asked.length,
      extreme
    });
    asked.push({ clauseId, factIndex: clause.factIndex, answer, correct: answer === "未明" ? null : (answer === "应") === truth });
    return Object.freeze({ answer });
  }

  async function submit(prediction, diagnostics) {
    if (locked) throw new Error("Prediction already submitted.");
    locked = true;
    const lockedProfile = pool.candidates.find((candidate) => candidate.id === prediction.lockedCandidateId);
    if (!lockedProfile) throw new Error(`Unknown locked candidate: ${prediction.lockedCandidateId}`);
    if (diagnostics.trace.length !== asked.length) throw new Error("Inference trace length does not match sealed answer count.");
    const book = generateLifeBook(lockedProfile, pool.birthSeed);
    const askedIndexes = new Set(asked.map((item) => item.factIndex));
    const counts = confusion(lockedProfile.factBits, truthBits, askedIndexes);
    const directReuseCount = asked.filter((item) => normalized(book.text).includes(normalized(CLAUSE_BY_ID.get(item.clauseId).text))).length;
    const eightGramReuseCount = asked.filter((item) => hasEightGramReuse(CLAUSE_BY_ID.get(item.clauseId).text, book.text)).length;
    const wrongAnswers = asked.filter((item) => item.correct === false).length;
    const unknownAnswers = asked.filter((item) => item.correct === null).length;
    const trueFactIds = FACT_CATALOG.flatMap((fact, factIndex) => truthBits[factIndex] ? [fact.id] : []);
    const truthMatchesAnyCandidate = pool.candidates.some((candidate) =>
      candidate.factBits.every((bit, factIndex) => bit === truthBits[factIndex])
    );
    return Object.freeze({
      group,
      subjectKey,
      responseKey,
      personaId: persona.id,
      personaStrategy: persona.strategy,
      birthSeedId: pool.birthSeed.id,
      trueMinuteOffset,
      trueFourMinuteInterval: Math.floor(trueMinuteOffset / 4),
      lockedCandidateId: lockedProfile.id,
      lockedMinuteOffset: lockedProfile.minuteOffset,
      lockedFourMinuteInterval: lockedProfile.fourMinuteInterval,
      topCandidateIds: prediction.topCandidateIds,
      rounds: prediction.rounds,
      normalizedEntropy: prediction.normalizedEntropy,
      transcriptHash: prediction.transcriptHash,
      lockedProfileHash: lockedProfile.profileHash,
      lockedFactIds: lockedProfile.factIds,
      truthProfileHash: sha256(trueFactIds),
      truthMatchesAnyCandidate,
      portraitCounts: counts,
      wrongAnswers,
      unknownAnswers,
      directReuseCount,
      eightGramReuseCount,
      askedCount: asked.length,
      bookHash: book.bookHash,
      bookText: book.text,
      bookFactSourceHash: book.factSourceHash,
      causalChainHash: sha256({
        birthSeed: pool.birthSeed.id,
        candidateProfiles: pool.diagnostics.profileHash,
        clauseOrder: pool.questionOrder.slice(0, asked.length),
        candidateUpdates: prediction.transcriptHash,
        lockedProfile: lockedProfile.profileHash,
        bookFromLockedProfile: book.factSourceHash
      }),
      truthToLockedJaccard: jaccard(trueFactIds, lockedProfile.factIds)
    });
  }

  return Object.freeze({ context, ask, submit });
}
