import { runBlindSession } from "./run-session.mjs";

if (!process.send) throw new Error("The interviewer client must be launched as an IPC child process.");

async function request(baseUrl, token, path, { method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${payload.error ?? response.status}: ${payload.message ?? "request failed"}`);
  return payload;
}

process.once("message", async (message) => {
  if (message.type !== "run") return;
  try {
    const context = await request(message.baseUrl, message.interviewerToken, "/v1/context");
    const { sessions } = await request(message.baseUrl, message.interviewerToken, "/v1/sessions");
    const results = [];
    for (let index = 0; index < sessions.length; index += 1) {
      const descriptor = sessions[index];
      const result = await runBlindSession({
        descriptor,
        eventCatalog: context.eventCatalog,
        questionBank: context.questionBank,
        ask: (sessionId, questionId) => request(message.baseUrl, message.interviewerToken, "/v1/ask", { method: "POST", body: { sessionId, questionId } }),
        submit: (sessionId, probabilities) => request(message.baseUrl, message.interviewerToken, "/v1/submit", { method: "POST", body: { sessionId, probabilities } })
      });
      results.push(result);
      if ((index + 1) % 50 === 0 || index + 1 === sessions.length) process.send({ type: "progress", completed: index + 1, total: sessions.length });
    }
    process.send({ type: "complete", sessions: results.length, questionCounts: results.map((result) => result.questions) });
    process.disconnect();
  } catch (error) {
    process.send({ type: "failed", message: error.message, stack: error.stack });
    process.exitCode = 1;
    process.disconnect();
  }
});
