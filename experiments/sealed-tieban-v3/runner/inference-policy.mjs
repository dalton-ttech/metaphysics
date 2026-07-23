import { sha256 } from "../../sealed-synthetic-v1/oracle/primitives.mjs";
import { V3_CONFIG } from "../config/experiment-config.mjs";

const EPSILON = 1e-12;

function entropy(probabilities) {
  return -probabilities.reduce((sum, probability) => {
    if (probability <= EPSILON) return sum;
    return sum + probability * Math.log2(probability);
  }, 0);
}

function normalize(values) {
  const sum = values.reduce((total, value) => total + value, 0);
  if (sum <= EPSILON) return values.map(() => 1 / values.length);
  return values.map((value) => value / sum);
}

export function expectedInformationGain({ posterior, candidateHasFact, likelihood = V3_CONFIG.inferenceLikelihood }) {
  const factProbability = posterior.reduce((sum, probability, index) =>
    sum + (candidateHasFact[index] ? probability : 0), 0
  );
  return expectedInformationGainFromFactProbability(factProbability, likelihood);
}

export function expectedInformationGainFromFactProbability(factProbability, likelihood = V3_CONFIG.inferenceLikelihood) {
  const trueDistribution = V3_CONFIG.answers.map((answer) => likelihood.factTrue[answer]);
  const falseDistribution = V3_CONFIG.answers.map((answer) => likelihood.factFalse[answer]);
  const answerDistribution = V3_CONFIG.answers.map((_, index) =>
    factProbability * trueDistribution[index] + (1 - factProbability) * falseDistribution[index]
  );
  return entropy(answerDistribution) -
    factProbability * entropy(trueDistribution) -
    (1 - factProbability) * entropy(falseDistribution);
}

export class TiebanInferencePolicy {
  constructor({ candidates, clauses, config = V3_CONFIG }) {
    this.candidates = candidates;
    this.clauses = clauses;
    this.config = config;
    this.posterior = candidates.map((candidate) => candidate.prior ?? 1 / candidates.length);
    this.asked = new Set();
    this.answers = [];
    this.factCandidateIndexes = new Map(
      clauses.map((clause) => [
        clause.primaryFactId,
        candidates.flatMap((candidate, index) => candidate.factIds.includes(clause.primaryFactId) ? [index] : [])
      ])
    );
  }

  #mask(clause) {
    const present = new Set(this.factCandidateIndexes.get(clause.primaryFactId));
    return this.candidates.map((_, index) => present.has(index));
  }

  factProbability(factId) {
    return (this.factCandidateIndexes.get(factId) ?? []).reduce((sum, index) => sum + this.posterior[index], 0);
  }

  nextClause() {
    const candidates = this.clauses.filter((clause) => !this.asked.has(clause.id));
    if (!candidates.length) return null;
    return candidates.map((clause) => {
      const factProbability = this.factProbability(clause.primaryFactId);
      const informationGain = expectedInformationGainFromFactProbability(factProbability, this.config.inferenceLikelihood);
      const balance = 1 - Math.abs(factProbability - 0.5) * 2;
      return { clause, informationGain, factProbability, utility: informationGain + balance * 0.002 };
    }).sort((left, right) =>
      right.utility - left.utility || right.informationGain - left.informationGain || left.clause.id.localeCompare(right.clause.id)
    )[0];
  }

  observe(selection, answer) {
    if (!this.config.answers.includes(answer)) throw new Error(`Unsupported answer: ${answer}`);
    const mask = this.#mask(selection.clause);
    const likelihood = this.config.inferenceLikelihood;
    this.posterior = normalize(this.posterior.map((probability, index) =>
      probability * (mask[index] ? likelihood.factTrue[answer] : likelihood.factFalse[answer])
    ));
    this.asked.add(selection.clause.id);
    this.answers.push({
      clauseId: selection.clause.id,
      primaryFactId: selection.clause.primaryFactId,
      answer,
      expectedInformationGain: selection.informationGain,
      factProbabilityBefore: selection.factProbability
    });
  }

  ranking() {
    return this.candidates.map((candidate, index) => ({ candidateId: candidate.id, probability: this.posterior[index] }))
      .sort((left, right) => right.probability - left.probability || left.candidateId.localeCompare(right.candidateId));
  }

  normalizedEntropy() {
    return entropy(this.posterior) / Math.log2(this.posterior.length);
  }

  done() {
    if (this.answers.length < this.config.rounds.minimum) return false;
    if (this.answers.length >= this.config.rounds.maximum) return true;
    const ranking = this.ranking();
    const top3 = ranking.slice(0, 3).reduce((sum, item) => sum + item.probability, 0);
    return (
      ranking[0].probability >= this.config.rounds.stopTop1Posterior &&
      top3 >= this.config.rounds.stopTop3Posterior &&
      this.normalizedEntropy() <= this.config.rounds.stopNormalizedEntropy
    );
  }

  prediction() {
    const ranking = this.ranking();
    const factProbabilities = Object.fromEntries(
      this.clauses.map((clause) => [clause.primaryFactId, this.factProbability(clause.primaryFactId)])
    );
    return {
      candidateProbabilities: Object.fromEntries(ranking.map((item) => [item.candidateId, item.probability])),
      factProbabilities,
      topCandidateIds: ranking.slice(0, 3).map((item) => item.candidateId),
      rounds: this.answers.length,
      normalizedEntropy: this.normalizedEntropy(),
      traceHash: sha256(this.answers)
    };
  }
}

export async function runInferenceSession({ descriptor, candidates, clauses, ask, submit, config = V3_CONFIG }) {
  const policy = new TiebanInferencePolicy({ candidates, clauses, config });
  while (!policy.done()) {
    const selection = policy.nextClause();
    if (!selection) throw new Error(`Session ${descriptor.id} exhausted the clause codebook.`);
    const response = await ask(descriptor.id, selection.clause.id);
    policy.observe(selection, response.answer);
  }
  const prediction = policy.prediction();
  const accepted = await submit(descriptor.id, prediction, { trace: policy.answers });
  return { sessionId: descriptor.id, ...prediction, predictionHash: accepted.predictionHash };
}
