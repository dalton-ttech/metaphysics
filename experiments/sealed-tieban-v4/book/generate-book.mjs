import { DOMAIN_LABELS, FACT_CATALOG } from "../domain/fact-catalog.mjs";
import { fnv1a32, sha256 } from "../lib/deterministic.mjs";

const OPENINGS = [
  "旧迹不逐问句抄录，只从已经锁定的画像落笔。",
  "此卷先定其人，再叙其事；一经锁定，不因措辞回改。",
  "纸上所书，取自成形画像，而非把方才的回答换一种说法。"
];

const DOMAIN_TEMPLATES = [
  (domain, present, absent) => `${domain}一章，重笔落在${present}；${absent}则不是这一卷的主线。`,
  (domain, present, absent) => `论${domain}，前路曾由${present}牵动；至于${absent}，其痕较淡。`,
  (domain, present, absent) => `${domain}之势并非一线平铺，画像所定的是${present}，而${absent}未成重章。`
];

function joinLabels(labels) {
  if (!labels.length) return "少有外显的大转折";
  return labels.map((label) => `“${label}”`).join("、");
}

export function generateLifeBook(lockedProfile, birthSeed) {
  if (!lockedProfile?.factBits || lockedProfile.factBits.length !== FACT_CATALOG.length) {
    throw new Error("A complete locked profile is required before book generation.");
  }
  if (!birthSeed?.id) throw new Error("Birth seed is required for deterministic book ordering.");

  const profileSignature = Array.from(lockedProfile.factBits).join("");
  const styleSeed = fnv1a32(`${birthSeed.id}/${profileSignature}`);
  const domainFacts = new Map();
  for (const fact of FACT_CATALOG) {
    if (!domainFacts.has(fact.domain)) domainFacts.set(fact.domain, { present: [], absent: [] });
    domainFacts.get(fact.domain)[lockedProfile.factBits[fact.index] ? "present" : "absent"].push(fact.label);
  }

  const lines = [OPENINGS[styleSeed % OPENINGS.length]];
  let domainIndex = 0;
  for (const [domain, facts] of domainFacts) {
    const rotate = (styleSeed + domainIndex * 7) % Math.max(1, facts.present.length);
    const present = facts.present.length
      ? [...facts.present.slice(rotate), ...facts.present.slice(0, rotate)].slice(0, 3)
      : [];
    const absent = facts.absent[(styleSeed + domainIndex * 11) % Math.max(1, facts.absent.length)] ?? "反复失序";
    const template = DOMAIN_TEMPLATES[(styleSeed + domainIndex) % DOMAIN_TEMPLATES.length];
    lines.push(template(DOMAIN_LABELS[domain] ?? domain, joinLabels(present), `“${absent}”`));
    domainIndex += 1;
  }
  const positiveCount = lockedProfile.factBits.reduce((sum, bit) => sum + bit, 0);
  lines.push(`全卷六十象中，实象落定${positiveCount}处。后篇可由这些既定脉络推演，但不回填任何问答原句。`);
  const text = `《定象命书》\n\n${lines.join("\n\n")}`;
  return {
    title: "定象命书",
    lines,
    text,
    factSourceHash: sha256({ birthSeedId: birthSeed.id, profileSignature }),
    bookHash: sha256(text)
  };
}

export function textBigramSet(text) {
  const normalized = text.replace(/[\s，。；：“”、《》！？、]/g, "");
  const output = new Set();
  for (let index = 0; index < normalized.length - 1; index += 1) output.add(normalized.slice(index, index + 2));
  return output;
}
