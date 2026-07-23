import { createHash } from "node:crypto";

import { createSealedArena } from "../oracle/sealed-arena.mjs";
import { runV23Session } from "./targeted-policy.mjs";

export async function runSeries({ seed, respondentMode, scenario = "default", kValues, samplePlan, onProgress }) {
  const arena = createSealedArena({ seed, respondentMode, scenario, kValues, samplePlan });
  const { eventCatalog, questionBank, sessions } = arena.context;
  let completed = 0;
  const total = sessions.length * kValues.length;
  for (const k of kValues) {
    for (const descriptor of sessions) {
      await runV23Session({
        descriptor,
        k,
        eventCatalog,
        questionBank,
        ask: (sessionId, questionId) => arena.ask(k, sessionId, questionId),
        submit: (sessionId, probabilities, diagnostics) => arena.submit(k, sessionId, probabilities, diagnostics)
      });
      completed += 1;
      if (onProgress && (completed % 250 === 0 || completed === total)) onProgress({ completed, total, k, respondentMode, scenario });
    }
  }
  return arena.finalize();
}

export function reproducibleHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

