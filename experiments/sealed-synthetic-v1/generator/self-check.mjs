import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { DEFAULT_GENERATOR_CONFIG, generateCohort } from "./index.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sourcePath = fileURLToPath(new URL("../../../src/lib/events.ts", import.meta.url));

function extractOntology(source) {
  const blocks = [...source.matchAll(/\{\s*\n\s*id:\s*"([^"]+)"[\s\S]*?baseRate:\s*([0-9.]+),\s*earliestAge:\s*(\d+)/g)];
  return blocks.map((match) => ({ id: match[1], baseRate: Number(match[2]), earliestAge: Number(match[3]) }));
}

function conditionalRate(profiles, source, target, sourcePresent) {
  const selected = profiles.filter((profile) => {
    const ids = new Set(profile.events.map((event) => event.id));
    return ids.has(source) === sourcePresent;
  });
  const hits = selected.filter((profile) => profile.events.some((event) => event.id === target)).length;
  return hits / selected.length;
}

const source = await readFile(sourcePath, "utf8");
const ontology = extractOntology(source);
const configured = DEFAULT_GENERATOR_CONFIG.eventModel.rows.map(
  ([id, , , baseRate, earliestAge]) => ({ id, baseRate, earliestAge })
);

assert.equal(ontology.length, 48, "events.ts must expose 48 parseable events");
assert.deepEqual(configured, ontology, "generator registry must mirror event ids/base weights/earliest ages");

const seed = "self-check-hidden-seed-v1";
const first = generateCohort({ seed });
const second = generateCohort({ seed });
const different = generateCohort({ seed: "self-check-hidden-seed-v1-different" });

assert.equal(first.profiles.length, 850);
assert.equal(first.sessions.length, 880);
assert.equal(first.metadata.counts.agentProfiles, 250);
assert.equal(first.metadata.counts.ruleProfiles, 600);
assert.equal(first.metadata.counts.agentSessions, 280);
assert.equal(first.metadata.counts.ruleSessions, 600);
assert.equal(first.metadata.eventCatalog.length, 48);
for (const event of first.metadata.eventCatalog) {
  assert.ok(event.id && event.domain && event.label && event.description && event.cue);
  assert.ok(Number.isFinite(event.decoderPrior) && Number.isFinite(event.earliestAge));
  assert.ok(Number.isInteger(event.salience));
  assert.ok(["ordinary", "private", "intense"].includes(event.sensitivity));
  assert.ok(Array.isArray(event.related));
}
assert.deepEqual(first.metadata.counts.byCohort, {
  language_stress: { profiles: 50, agent: 50, rule: 0 },
  calibration: { profiles: 500, agent: 100, rule: 400 },
  validation: { profiles: 300, agent: 100, rule: 200 }
});

assert.equal(new Set(first.profiles.map((profile) => profile.id)).size, 850, "profile ids must be unique");
assert.equal(new Set(first.sessions.map((session) => session.id)).size, 880, "session ids must be unique");
assert.equal(first.sessions.filter((session) => session.retestOf !== null).length, 30);
assert.ok(
  first.sessions
    .filter((session) => session.retestOf !== null)
    .every((session) => session.cohort === "validation" && session.respondentMode === "agent"),
  "retests must be isolated to validation Agent respondents"
);

const eventById = new Map(
  DEFAULT_GENERATOR_CONFIG.eventModel.rows.map(([id, label, domain, baseRate, earliestAge]) => [
    id,
    { id, label, domain, baseRate, earliestAge }
  ])
);
for (const profile of first.profiles) {
  assert.ok(["agent", "rule"].includes(profile.respondentMode));
  assert.equal(new Set(profile.events.map((event) => event.id)).size, profile.events.length);
  for (const event of profile.events) {
    const model = eventById.get(event.id);
    assert.ok(model, `unknown event ${event.id}`);
    assert.ok(event.age >= model.earliestAge, `${event.id} occurs before earliestAge`);
    assert.ok(event.age <= profile.demographics.currentAge, `${event.id} occurs after current age`);
  }
}

for (const rule of DEFAULT_GENERATOR_CONFIG.eventModel.prerequisites) {
  for (const profile of first.profiles.filter((candidate) => candidate.events.some((event) => event.id === rule.event))) {
    const ages = new Map(profile.events.map((event) => [event.id, event.age]));
    const eventAge = ages.get(rule.event);
    assert.ok(
      rule.oneOf.some((eventId) => ages.has(eventId) && ages.get(eventId) <= eventAge - rule.minGapYears),
      `${profile.id}/${rule.event} lacks an earlier prerequisite`
    );
  }
}

assert.equal(hash(first), hash(second), "same seed and config must reproduce byte-equivalent JSON");
assert.notEqual(hash(first), hash(different), "different seeds must produce different cohorts");
assert.ok(!JSON.stringify(first).includes(seed), "the caller seed must not be returned in plaintext");

const associationChecks = [
  ["fam_financial_fall", "wealth_debt"],
  ["career_major_achievement", "wealth_income_leap"],
  ["rel_major_breakup", "rel_long_single"],
  ["health_hospital", "health_recovery"],
  ["career_job_loss", "turn_restart"]
];
const associationReport = [];
for (const [sourceId, targetId] of associationChecks) {
  const withSource = conditionalRate(first.profiles, sourceId, targetId, true);
  const withoutSource = conditionalRate(first.profiles, sourceId, targetId, false);
  assert.ok(withSource > withoutSource, `${sourceId} must positively associate with ${targetId}`);
  associationReport.push({ sourceId, targetId, withSource, withoutSource, delta: withSource - withoutSource });
}

const cohortSets = Object.fromEntries(
  DEFAULT_GENERATOR_CONFIG.cohorts.map((cohort) => [
    cohort.id,
    new Set(first.profiles.filter((profile) => profile.cohort === cohort.id).map((profile) => profile.id))
  ])
);
for (const left of Object.keys(cohortSets)) {
  for (const right of Object.keys(cohortSets)) {
    if (left >= right) continue;
    assert.equal([...cohortSets[left]].filter((id) => cohortSets[right].has(id)).length, 0, `${left}/${right} leaked ids`);
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      profiles: first.profiles.length,
      sessions: first.sessions.length,
      agentProfiles: first.metadata.counts.agentProfiles,
      agentSessions: first.metadata.counts.agentSessions,
      ruleProfiles: first.metadata.counts.ruleProfiles,
      ontologyEvents: ontology.length,
      reproducibilityHash: hash(first),
      associationReport
    },
    null,
    2
  )
);
