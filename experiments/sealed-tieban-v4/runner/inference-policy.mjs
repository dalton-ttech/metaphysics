import { V4_CONFIG } from "../config/experiment-config.mjs";
import { CLAUSE_CODEBOOK } from "../domain/fact-catalog.mjs";
import { sha256 } from "../lib/deterministic.mjs";

const EPSILON = 1e-300;

function entropy(probabilities) {
  let value = 0;
  for (const probability of probabilities) {
    if (probability > EPSILON) value -= probability * Math.log2(probability);
  }
  return value;
}

function topRanking(candidates, posterior, count = 3) {
  const top = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const item = { candidateId: candidates[index].id, index, probability: posterior[index] };
    let position = 0;
    while (position < top.length && (
      top[position].probability > item.probability ||
      (top[position].probability === item.probability && top[position].candidateId < item.candidateId)
    )) position += 1;
    if (position < count) top.splice(position, 0, item);
    if (top.length > count) top.pop();
  }
  return top;
}

export class LockedCandidateInference {
  constructor({ pool, config = V4_CONFIG }) {
    this.pool = pool;
    this.config = config;
    this.posterior = new Float64Array(pool.candidates.length);
    this.posterior.fill(1 / pool.candidates.length);
    this.trace = [];
    this.cursor = 0;
  }

  nextClause() {
    const factIndex = this.pool.questionOrder[this.cursor];
    if (factIndex === undefined) return null;
    return CLAUSE_CODEBOOK[factIndex];
  }

  observe(clause, answer) {
    if (!this.config.answers.includes(answer)) throw new Error(`Unsupported answer: ${answer}`);
    if (clause.factIndex !== this.pool.questionOrder[this.cursor]) throw new Error("Clause order was not derived from the candidate profile matrix.");
    const likelihood = this.config.inferenceLikelihood;
    let total = 0;
    for (let index = 0; index < this.pool.candidates.length; index += 1) {
      const factTrue = this.pool.candidates[index].factBits[clause.factIndex] === 1;
      const updated = this.posterior[index] * (factTrue ? likelihood.factTrue[answer] : likelihood.factFalse[answer]);
      this.posterior[index] = updated;
      total += updated;
    }
    if (total <= EPSILON) {
      this.posterior.fill(1 / this.pool.candidates.length);
    } else {
      for (let index = 0; index < this.posterior.length; index += 1) this.posterior[index] /= total;
    }
    this.trace.push({ clauseId: clause.id, primaryFactId: clause.primaryFactId, answer });
    this.cursor += 1;
  }

  status() {
    const top = topRanking(this.pool.candidates, this.posterior, 3);
    const normalizedEntropy = entropy(this.posterior) / Math.log2(this.posterior.length);
    return { top, normalizedEntropy };
  }

  done() {
    if (this.trace.length < this.config.rounds.minimum) return false;
    if (this.trace.length >= this.config.rounds.maximum) return true;
    const { top, normalizedEntropy } = this.status();
    const top3Probability = top.reduce((sum, item) => sum + item.probability, 0);
    return top[0].probability >= this.config.rounds.stopTop1Posterior &&
      top3Probability >= this.config.rounds.stopTop3Posterior &&
      normalizedEntropy <= this.config.rounds.stopNormalizedEntropy;
  }

  lockPrediction() {
    const { top, normalizedEntropy } = this.status();
    return Object.freeze({
      lockedCandidateId: top[0].candidateId,
      topCandidateIds: top.map((item) => item.candidateId),
      rounds: this.trace.length,
      normalizedEntropy,
      transcriptHash: sha256(this.trace)
    });
  }
}

export async function runInferenceSession(handle) {
  const policy = new LockedCandidateInference({ pool: handle.context.pool });
  while (!policy.done()) {
    const clause = policy.nextClause();
    if (!clause) throw new Error("Question codebook exhausted before candidate lock.");
    const response = await handle.ask(clause.id);
    policy.observe(clause, response.answer);
  }
  const prediction = policy.lockPrediction();
  return handle.submit(prediction, { trace: policy.trace });
}
