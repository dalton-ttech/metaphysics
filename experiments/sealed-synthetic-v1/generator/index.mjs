import { createHash, createHmac, randomBytes } from "node:crypto";
import { DEFAULT_GENERATOR_CONFIG } from "../config/generator-config.v1.mjs";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const logistic = (value) => 1 / (1 + Math.exp(-value));
const logit = (value) => Math.log(value / (1 - value));
const round = (value, digits = 4) => Number(value.toFixed(digits));

class SeededRng {
  constructor(seed) {
    this.key = Buffer.isBuffer(seed) ? Buffer.from(seed) : Buffer.from(String(seed), "utf8");
    this.counter = 0n;
    this.pool = Buffer.alloc(0);
    this.normalSpare = null;
  }

  refill() {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(this.counter++);
    this.pool = Buffer.concat([
      this.pool,
      createHmac("sha256", this.key).update("sealed-synthetic-v1").update(counter).digest()
    ]);
  }

  bytes(length) {
    while (this.pool.length < length) this.refill();
    const output = this.pool.subarray(0, length);
    this.pool = this.pool.subarray(length);
    return output;
  }

  float() {
    const bytes = this.bytes(7);
    let integer = 0;
    for (const byte of bytes) integer = integer * 256 + byte;
    return integer / 72057594037927936;
  }

  int(min, max) {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  bool(probability) {
    return this.float() < clamp(probability, 0, 1);
  }

  normal(mean = 0, sd = 1) {
    if (this.normalSpare !== null) {
      const spare = this.normalSpare;
      this.normalSpare = null;
      return mean + spare * sd;
    }
    const u = Math.max(this.float(), Number.EPSILON);
    const v = this.float();
    const magnitude = Math.sqrt(-2 * Math.log(u));
    const z0 = magnitude * Math.cos(2 * Math.PI * v);
    this.normalSpare = magnitude * Math.sin(2 * Math.PI * v);
    return mean + z0 * sd;
  }

  weighted(items) {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let cursor = this.float() * total;
    for (const item of items) {
      cursor -= item.weight;
      if (cursor <= 0) return item;
    }
    return items.at(-1);
  }

  shuffle(items) {
    const output = [...items];
    for (let index = output.length - 1; index > 0; index -= 1) {
      const other = this.int(0, index);
      [output[index], output[other]] = [output[other], output[index]];
    }
    return output;
  }
}

function deepMerge(base, override) {
  if (override === undefined) return structuredClone(base);
  if (Array.isArray(base) || Array.isArray(override)) return structuredClone(override);
  if (base && override && typeof base === "object" && typeof override === "object") {
    const output = structuredClone(base);
    for (const [key, value] of Object.entries(override)) {
      output[key] = key in output ? deepMerge(output[key], value) : structuredClone(value);
    }
    return output;
  }
  return structuredClone(override);
}

function normalizeConfig(override) {
  const config = deepMerge(DEFAULT_GENERATOR_CONFIG, override);
  const eventCatalog = config.eventModel.rows.map(
    ([id, label, domain, baseRate, earliestAge, peakStart, peakEnd]) => ({
      id,
      label,
      domain,
      baseRate,
      earliestAge,
      peakStart,
      peakEnd
    })
  );
  const ids = new Set(eventCatalog.map((event) => event.id));
  if (eventCatalog.length !== 48 || ids.size !== 48) {
    throw new Error(`eventModel must contain exactly 48 unique events; received ${eventCatalog.length}/${ids.size}`);
  }
  for (const event of eventCatalog) {
    const publicFields = config.eventModel.publicFields[event.id];
    if (!Array.isArray(publicFields) || publicFields.length !== 5) {
      throw new Error(`eventModel.publicFields is missing ${event.id}`);
    }
    const [description, cue, salience, sensitivity, related] = publicFields;
    Object.assign(event, { description, cue, salience, sensitivity, related });
  }
  for (const cohort of config.cohorts) {
    if (!Number.isInteger(cohort.profiles) || !Number.isInteger(cohort.agentProfiles)) {
      throw new Error(`cohort ${cohort.id} counts must be integers`);
    }
    if (cohort.agentProfiles < 0 || cohort.agentProfiles > cohort.profiles) {
      throw new Error(`cohort ${cohort.id} has invalid agentProfiles`);
    }
  }
  return { config, eventCatalog, eventById: new Map(eventCatalog.map((event) => [event.id, event])) };
}

function sampleBoundedNormal(rng, spec) {
  return round(clamp(rng.normal(spec.mean, spec.sd), spec.min, spec.max));
}

function sampleDemographics(rng, config) {
  const ageBand = rng.weighted(config.demographics.ageBands);
  return {
    currentAge: rng.int(ageBand.min, ageBand.max),
    gender: rng.weighted(config.demographics.gender).value,
    region: rng.weighted(config.demographics.region).value,
    educationExposure: rng.weighted(config.demographics.educationExposure).value
  };
}

function sampleLatent(rng, config) {
  const latentConfig = config.latent;
  const adversity = clamp(rng.normal(), ...latentConfig.clamp);
  const latent = { adversity: round(adversity) };
  for (const name of latentConfig.names) {
    if (name === "adversity") continue;
    const sign = name === "resilience" || name === "careerAgency" ? -0.15 : 1;
    const value =
      adversity * latentConfig.sharedAdversityLoading * sign +
      rng.normal() * latentConfig.independentLoading;
    latent[name] = round(clamp(value, ...latentConfig.clamp));
  }
  return latent;
}

function samplePersona(rng, config, demographics) {
  const persona = {};
  for (const [name, spec] of Object.entries(config.persona)) {
    persona[name] = sampleBoundedNormal(rng, spec);
  }
  const educationAdjustment = { basic: -0.08, secondary: 0, higher: 0.055 }[demographics.educationExposure];
  persona.readingComprehension = round(
    clamp(
      persona.readingComprehension + educationAdjustment,
      config.persona.readingComprehension.min,
      config.persona.readingComprehension.max
    )
  );
  persona.orInterpretationSkill = round(
    clamp(
      persona.orInterpretationSkill + educationAdjustment * 0.75,
      config.persona.orInterpretationSkill.min,
      config.persona.orInterpretationSkill.max
    )
  );
  return persona;
}

function sampleMemory(rng, config, latent) {
  const memory = {};
  for (const [name, spec] of Object.entries(config.memory)) {
    if (typeof spec === "number") continue;
    memory[name] = sampleBoundedNormal(rng, spec);
  }
  memory.recallFidelity = round(
    clamp(
      memory.recallFidelity - Math.max(0, latent.healthBurden) * 0.018,
      config.memory.recallFidelity.min,
      config.memory.recallFidelity.max
    )
  );
  memory.salienceRecallBoost = config.memory.salienceRecallBoost;
  memory.sensitiveRecallPenalty = config.memory.sensitiveRecallPenalty;
  return memory;
}

function eventProbability(event, demographics, latent, config) {
  if (demographics.currentAge < event.earliestAge) return 0;
  const exposure = clamp(
    (demographics.currentAge - event.earliestAge + 1) / config.eventModel.ageExposureYears,
    0.05,
    1
  );
  let score = logit(clamp(event.baseRate * exposure, 0.002, 0.95));
  const weights = {
    ...config.eventModel.domainLatentWeights[event.domain],
    ...config.eventModel.eventLatentOverrides[event.id]
  };
  for (const [factor, weight] of Object.entries(weights)) score += (latent[factor] ?? 0) * weight;
  const [minimum, maximum] = config.eventModel.probabilityClamp;
  return clamp(logistic(score), minimum, maximum);
}

function chooseEventAge(rng, event, currentAge) {
  const minimum = event.earliestAge;
  const maximum = currentAge;
  if (minimum >= maximum) return minimum;
  const peakMin = clamp(event.peakStart, minimum, maximum);
  const peakMax = clamp(event.peakEnd, peakMin, maximum);
  const center = rng.int(peakMin, peakMax);
  const spread = Math.max(1, Math.round((maximum - minimum) / 5));
  return Math.round(clamp(rng.normal(center, spread), minimum, maximum));
}

function addEvent(eventAges, eventId, age) {
  const existing = eventAges.get(eventId);
  if (existing === undefined || age < existing) eventAges.set(eventId, age);
}

function activateConditionalEvents(rng, eventAges, demographics, eventById, config) {
  for (const edge of config.eventModel.conditionalEdges) {
    if (!eventAges.has(edge.source) || eventAges.has(edge.target)) continue;
    const target = eventById.get(edge.target);
    if (target.earliestAge <= demographics.currentAge && rng.bool(edge.activationBoost)) {
      addEvent(eventAges, edge.target, chooseEventAge(rng, target, demographics.currentAge));
    }
  }
}

function enforcePrerequisites(rng, eventAges, demographics, eventById, config) {
  // Two passes are enough for the current prerequisite graph and keep the rule explicit.
  for (let pass = 0; pass < 2; pass += 1) {
    for (const rule of config.eventModel.prerequisites) {
      if (!eventAges.has(rule.event)) continue;
      const eventAge = eventAges.get(rule.event);
      const existing = rule.oneOf
        .filter((eventId) => eventAges.has(eventId))
        .sort((a, b) => eventAges.get(a) - eventAges.get(b))[0];
      if (existing && eventAges.get(existing) <= eventAge - rule.minGapYears) continue;

      const candidates = rule.oneOf
        .map((eventId) => eventById.get(eventId))
        .filter((candidate) => candidate.earliestAge <= eventAge - rule.minGapYears);
      if (!candidates.length) {
        // The event cannot be made temporally coherent; remove it rather than invent a future prerequisite.
        eventAges.delete(rule.event);
        continue;
      }
      const prerequisite = candidates[rng.int(0, candidates.length - 1)];
      const latest = eventAge - rule.minGapYears;
      const age = rng.int(prerequisite.earliestAge, latest);
      addEvent(eventAges, prerequisite.id, age);
    }
  }
}

function buildNarrative(rng, events, config, demographics) {
  const introduction = rng.weighted(config.narrative.introductions.map((value) => ({ value, weight: 1 }))).value;
  const timeline = events.map((event) => {
    const template = rng.weighted(config.narrative.eventSentenceTemplates.map((value) => ({ value, weight: 1 }))).value;
    return template.replace("{age}", String(event.age)).replace("{label}", event.label);
  });
  return `${introduction} 当前年龄为${demographics.currentAge}岁。${timeline.join("")}`;
}

function generateProfile(rng, config, eventCatalog, eventById, id, cohort, respondentMode) {
  const demographics = sampleDemographics(rng, config);
  const latent = sampleLatent(rng, config);
  const persona = samplePersona(rng, config, demographics);
  const memory = sampleMemory(rng, config, latent);
  const eventAges = new Map();

  for (const event of eventCatalog) {
    const probability = eventProbability(event, demographics, latent, config);
    if (rng.bool(probability)) addEvent(eventAges, event.id, chooseEventAge(rng, event, demographics.currentAge));
  }
  activateConditionalEvents(rng, eventAges, demographics, eventById, config);
  enforcePrerequisites(rng, eventAges, demographics, eventById, config);

  const events = [...eventAges.entries()]
    .map(([eventId, age]) => {
      const model = eventById.get(eventId);
      return { id: eventId, age, label: model.label, domain: model.domain };
    })
    .sort((a, b) => a.age - b.age || a.id.localeCompare(b.id));

  return {
    id,
    cohort,
    respondentMode,
    demographics,
    events: events.map(({ id: eventId, age }) => ({ id: eventId, age })),
    latent,
    persona,
    memory,
    privateNarrative: buildNarrative(rng, events, config, demographics)
  };
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

/**
 * Generate the complete in-memory sealed-experiment cohort.
 *
 * The seed is never returned. If absent, a cryptographically secure 256-bit seed
 * is generated. Callers must immediately hand profiles to an encrypting sink or
 * a memory-only Oracle; this module deliberately exposes no plaintext file writer.
 */
export function generateCohort({ seed, config: override } = {}) {
  const seedWasProvided = seed !== undefined && seed !== null;
  const seedMaterial = seedWasProvided
    ? Buffer.isBuffer(seed)
      ? Buffer.from(seed)
      : Buffer.from(String(seed), "utf8")
    : randomBytes(32);
  const rng = new SeededRng(seedMaterial);
  const { config, eventCatalog, eventById } = normalizeConfig(override);
  const profiles = [];

  for (const cohortConfig of config.cohorts) {
    const indexes = Array.from({ length: cohortConfig.profiles }, (_, index) => index);
    const agentIndexes = new Set(rng.shuffle(indexes).slice(0, cohortConfig.agentProfiles));
    for (const index of indexes) {
      const ordinal = index + 1;
      const id = `syn-${cohortConfig.id}-${String(ordinal).padStart(4, "0")}`;
      const mode = agentIndexes.has(index) ? "agent" : "rule";
      profiles.push(generateProfile(rng, config, eventCatalog, eventById, id, cohortConfig.id, mode));
    }
  }

  const sessions = profiles.map((profile) => ({
    id: `session-${profile.id}-primary`,
    profileId: profile.id,
    cohort: profile.cohort,
    respondentMode: profile.respondentMode,
    retestOf: null,
    intervalDays: null
  }));

  const retestCandidates = rng.shuffle(
    profiles.filter(
      (profile) =>
        profile.cohort === config.retest.cohort && profile.respondentMode === config.retest.respondentMode
    )
  );
  if (retestCandidates.length < config.retest.sessions) {
    throw new Error("not enough eligible profiles for the configured retest sessions");
  }
  for (const profile of retestCandidates.slice(0, config.retest.sessions)) {
    const primaryId = `session-${profile.id}-primary`;
    sessions.push({
      id: `session-${profile.id}-retest`,
      profileId: profile.id,
      cohort: profile.cohort,
      respondentMode: profile.respondentMode,
      retestOf: primaryId,
      intervalDays: rng.int(...config.retest.intervalDays)
    });
  }

  const publicConfig = {
    version: config.version,
    cohorts: config.cohorts,
    retest: config.retest,
    eventCatalog
  };
  const profileCounts = Object.fromEntries(
    config.cohorts.map((cohort) => [
      cohort.id,
      {
        profiles: profiles.filter((profile) => profile.cohort === cohort.id).length,
        agent: profiles.filter((profile) => profile.cohort === cohort.id && profile.respondentMode === "agent").length,
        rule: profiles.filter((profile) => profile.cohort === cohort.id && profile.respondentMode === "rule").length
      }
    ])
  );

  return {
    profiles,
    sessions,
    metadata: {
      schemaVersion: "sealed-synthetic-cohort-v1",
      generatorVersion: config.version,
      assumptionNotice: config.assumptionNotice,
      seedSource: seedWasProvided ? "caller-provided" : "crypto-random-256-bit",
      seedCommitment: createHash("sha256").update("seed-commitment-v1").update(seedMaterial).digest("hex"),
      configFingerprint: stableHash(publicConfig),
      eventCatalogFingerprint: stableHash(config.eventModel.rows),
      eventCatalog: eventCatalog.map(({ peakStart, peakEnd, ...event }) => ({
        ...event,
        decoderPrior: event.baseRate
      })),
      counts: {
        profiles: profiles.length,
        sessions: sessions.length,
        primarySessions: profiles.length,
        retestSessions: sessions.length - profiles.length,
        agentProfiles: profiles.filter((profile) => profile.respondentMode === "agent").length,
        ruleProfiles: profiles.filter((profile) => profile.respondentMode === "rule").length,
        agentSessions: sessions.filter((session) => session.respondentMode === "agent").length,
        ruleSessions: sessions.filter((session) => session.respondentMode === "rule").length,
        byCohort: profileCounts
      }
    }
  };
}

export { DEFAULT_GENERATOR_CONFIG };
