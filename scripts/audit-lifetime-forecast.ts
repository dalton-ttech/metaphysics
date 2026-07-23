import { buildLifetimeForecastV4 } from "@/lib/tieban-v4-future";

const forecast = buildLifetimeForecastV4({
  currentAge: 36,
  birthYear: 1990,
  gender: "male",
  birthplace: "苏州",
  profileId: "audit-profile-73",
  profileCode: "命-10527",
  profileSignature: "audit-signature-73",
  seedDigest: "audit-seed-73",
  anchorDomains: ["family", "career", "wealth", "health", "turning_point", "relationship"]
});

console.info(`寿限 ${forecast.terminalAge}岁 · 共 ${forecast.nodes.length} 条`);
for (const node of forecast.nodes) {
  console.info(`\n${node.horizon} · ${node.eventKey}${node.terminal ? " · 寿限" : ""}`);
  console.info(node.verse);
  console.info(node.sign);
  console.info(node.reading);
}
