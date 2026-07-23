"use client";

import { useMemo, useState } from "react";

import { DOMAIN_META, EVENT_BY_ID, LIFE_EVENTS } from "@/lib/events";
import { answerCurrentQuestion, createSession, getProgress, MAX_TURNS } from "@/lib/engine";
import { QUESTION_BY_ID } from "@/lib/questions";
import type { Answer, DecoderSession, EventDomain, Intake } from "@/lib/types";

type LabStep = "truth" | "questions" | "debrief" | "result";
type ValidationCohort = "cognitive" | "calibration" | "validation" | "retest";
type ComprehensionLevel = "clear" | "partial" | "failed";
type ComprehensionIssue = "none" | "wording" | "event-overlap" | "time-boundary" | "memory" | "sensitivity" | "other";

interface ResponseTiming {
  questionId: string;
  answer: Answer;
  durationMs: number;
  poolSize: number;
  phase: "screen" | "discriminate" | "verify";
}

interface CognitiveAnnotation {
  questionId: string;
  comprehension: ComprehensionLevel;
  issue: ComprehensionIssue;
  note: string;
}

const defaultIntake: Intake = {
  name: "",
  birthDate: "",
  gender: "unspecified",
  birthplace: "",
  focus: "overall"
};

function calculateMetrics(session: DecoderSession, truthIds: string[]) {
  const truth = new Set(truthIds);
  const entries = Object.entries(session.probabilities);
  const high = entries.filter(([, probability]) => probability >= 0.88).map(([id]) => id);
  const recalled = entries.filter(([, probability]) => probability >= 0.25).map(([id]) => id);
  const trueHigh = high.filter((id) => truth.has(id)).length;
  const trueRecalled = recalled.filter((id) => truth.has(id)).length;
  const brier = entries.reduce((sum, [id, probability]) => sum + (probability - Number(truth.has(id))) ** 2, 0) / entries.length;
  return {
    precision: high.length === 0 ? null : trueHigh / high.length,
    recall: truth.size === 0 ? null : trueRecalled / truth.size,
    brier,
    high,
    missed: truthIds.filter((id) => !recalled.includes(id)),
    falseHigh: high.filter((id) => !truth.has(id))
  };
}

function formatMetric(value: number | null) {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function ValidationLab() {
  const [step, setStep] = useState<LabStep>("truth");
  const [participantId, setParticipantId] = useState("");
  const [cohort, setCohort] = useState<ValidationCohort>("calibration");
  const [intake, setIntake] = useState(defaultIntake);
  const [truthIds, setTruthIds] = useState<string[]>([]);
  const [session, setSession] = useState<DecoderSession | null>(null);
  const [pendingSession, setPendingSession] = useState<DecoderSession | null>(null);
  const [pendingQuestionId, setPendingQuestionId] = useState<string | null>(null);
  const [responseTimings, setResponseTimings] = useState<ResponseTiming[]>([]);
  const [cognitiveAnnotations, setCognitiveAnnotations] = useState<CognitiveAnnotation[]>([]);
  const [comprehension, setComprehension] = useState<ComprehensionLevel>("clear");
  const [comprehensionIssue, setComprehensionIssue] = useState<ComprehensionIssue>("none");
  const [comprehensionNote, setComprehensionNote] = useState("");
  const [questionStartedAt, setQuestionStartedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const metrics = useMemo(() => session && step === "result" ? calculateMetrics(session, truthIds) : null, [session, step, truthIds]);

  const toggleTruth = (eventId: string) => setTruthIds((current) => current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId]);

  const lockTruth = () => {
    if (!participantId.trim() || !intake.birthDate || truthIds.length === 0) {
      setError("需要受试者编号、出生日期和至少一条完整履历标签。所有标签必须在问答前锁定。");
      return;
    }
    setError("");
    setSession(createSession(intake));
    setPendingSession(null);
    setPendingQuestionId(null);
    setResponseTimings([]);
    setCognitiveAnnotations([]);
    setQuestionStartedAt(Date.now());
    setStep("questions");
    window.scrollTo({ top: 0 });
  };

  const answer = (value: Answer) => {
    if (!session?.currentQuestionId) return;
    const now = Date.now();
    const question = QUESTION_BY_ID[session.currentQuestionId];
    setResponseTimings((current) => [...current, {
      questionId: question.id,
      answer: value,
      durationMs: Math.max(0, now - (questionStartedAt ?? now)),
      poolSize: question.eventIds.length,
      phase: question.phase
    }]);
    const next = answerCurrentQuestion(session, value);
    if (cohort === "cognitive") {
      setPendingSession(next);
      setPendingQuestionId(question.id);
      setQuestionStartedAt(null);
      setStep("debrief");
      window.scrollTo({ top: 0 });
      return;
    }
    setSession(next);
    if (next.completedAt) {
      setStep("result");
      window.scrollTo({ top: 0 });
    } else {
      setQuestionStartedAt(now);
    }
  };

  const submitDebrief = () => {
    if (!pendingSession || !pendingQuestionId) return;
    setCognitiveAnnotations((current) => [...current, {
      questionId: pendingQuestionId,
      comprehension,
      issue: comprehension === "clear" ? "none" : comprehensionIssue,
      note: comprehensionNote.trim()
    }]);
    setSession(pendingSession);
    setPendingSession(null);
    setPendingQuestionId(null);
    setComprehension("clear");
    setComprehensionIssue("none");
    setComprehensionNote("");
    if (pendingSession.completedAt) {
      setStep("result");
    } else {
      setQuestionStartedAt(Date.now());
      setStep("questions");
    }
    window.scrollTo({ top: 0 });
  };

  const exportRecord = () => {
    if (!session) return;
    const record = {
      id: participantId.trim(),
      cohort,
      intake,
      truthEventIds: truthIds,
      probabilities: session.probabilities,
      answerTrace: session.answers,
      responseTimings,
      cognitiveAnnotations,
      unsureCount: session.answers.filter((answerRecord) => answerRecord.answer === "unsure").length,
      sessionDurationMs: session.completedAt ? session.completedAt - session.createdAt : null,
      completedAt: session.completedAt,
      modelVersion: "20260720-v2.3"
    };
    const blob = new Blob([`${JSON.stringify(record, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tieban-validation-${participantId.trim()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setStep("truth");
    setParticipantId("");
    setCohort("calibration");
    setIntake(defaultIntake);
    setTruthIds([]);
    setSession(null);
    setPendingSession(null);
    setPendingQuestionId(null);
    setResponseTimings([]);
    setCognitiveAnnotations([]);
    setComprehension("clear");
    setComprehensionIssue("none");
    setComprehensionNote("");
    setQuestionStartedAt(null);
    setError("");
    window.scrollTo({ top: 0 });
  };

  if (step === "debrief" && pendingSession && pendingQuestionId) {
    const question = QUESTION_BY_ID[pendingQuestionId];
    return (
      <main className="lab-shell lab-question lab-debrief">
        <header><a href="/">知命局</a><span>认知访谈 · 研究员标注</span><b>{pendingSession.answers.length}/{MAX_TURNS}</b></header>
        <div className="lab-progress"><span style={{ transform: `scaleX(${getProgress(pendingSession) / 100})` }} /></div>
        <section>
          <p>COMPREHENSION CHECK</p>
          <h1>受试者是否准确理解了这一问？</h1>
          <blockquote>{question.text}</blockquote>
          <div className="lab-debrief-options" role="group" aria-label="理解程度">
            {([
              ["clear", "完整理解", "能准确复述“任中一项答是”的判断规则"],
              ["partial", "部分理解", "需要重读白话规则或有轻微偏差"],
              ["failed", "理解错误", "把两项理解为必须同时发生或误解事件含义"]
            ] as const).map(([value, title, detail]) => (
              <button key={value} type="button" className={comprehension === value ? "is-selected" : ""} onClick={() => setComprehension(value)}>
                <strong>{title}</strong><span>{detail}</span>
              </button>
            ))}
          </div>
          <div className="lab-debrief-fields">
            <label><span>主要问题</span><select value={comprehensionIssue} disabled={comprehension === "clear"} onChange={(event) => setComprehensionIssue(event.target.value as ComprehensionIssue)}><option value="none">无</option><option value="wording">措辞难懂</option><option value="event-overlap">两事件边界重叠</option><option value="time-boundary">时间范围不清</option><option value="memory">难以回忆或判断</option><option value="sensitivity">因敏感而不愿回答</option><option value="other">其他</option></select></label>
            <label><span>研究员备注（不得提示正确答案）</span><textarea value={comprehensionNote} onChange={(event) => setComprehensionNote(event.target.value)} placeholder="记录受试者如何复述、卡在哪个词；无问题可留空。" /></label>
          </div>
          {comprehension !== "clear" && comprehensionIssue === "none" ? <small>请先选择导致理解偏差的主要问题。</small> : null}
          <button className="button button--primary lab-debrief-next" disabled={comprehension !== "clear" && comprehensionIssue === "none"} onClick={submitDebrief}>保存标注，继续下一问</button>
        </section>
      </main>
    );
  }

  if (step === "questions" && session?.currentQuestionId) {
    const question = QUESTION_BY_ID[session.currentQuestionId];
    return (
      <main className="lab-shell lab-question">
        <header><a href="/">知命局</a><span>盲测实验室 · 标签已锁定</span><b>{session.answers.length + 1}/{MAX_TURNS}</b></header>
        <div className="lab-progress"><span style={{ transform: `scaleX(${getProgress(session) / 100})` }} /></div>
        <section>
          <p>{question.phase === "verify" ? "单象验真" : "交叉辨象"}</p>
          <h1>{question.text}</h1>
          <small>{question.plainRule}</small>
          <div>
            <button onClick={() => answer("yes")}><strong>是</strong><span>其中有事真实发生</span></button>
            <button onClick={() => answer("no")}><strong>否</strong><span>所列事情都未发生</span></button>
          </div>
          <button className="lab-skip" onClick={() => answer("unsure")}>暂不判断</button>
        </section>
      </main>
    );
  }

  if (step === "result" && session && metrics) {
    return (
      <main className="lab-shell">
        <header><a href="/">知命局</a><span>盲测实验室 · 本次结果</span><b>{participantId}</b></header>
        <section className="lab-result">
          <p className="eyebrow">Independent validation</p>
          <h1>盲测结果已生成。</h1>
          <div className="lab-metrics">
            <span><small>高置信精确率</small><strong>{formatMetric(metrics.precision)}</strong></span>
            <span><small>重大事件召回率</small><strong>{formatMetric(metrics.recall)}</strong></span>
            <span><small>Brier Score</small><strong>{metrics.brier.toFixed(3)}</strong></span>
            <span><small>完成问题</small><strong>{session.answers.length}</strong></span>
            {cohort === "cognitive" ? <span><small>完整理解率</small><strong>{formatMetric(cognitiveAnnotations.length ? cognitiveAnnotations.filter((item) => item.comprehension === "clear").length / cognitiveAnnotations.length : null)}</strong></span> : null}
          </div>
          <div className="lab-errors">
            <article><h2>漏识别</h2>{metrics.missed.length ? metrics.missed.map((id) => <span key={id}>{EVENT_BY_ID[id].label}</span>) : <p>无</p>}</article>
            <article><h2>高置信误报</h2>{metrics.falseHigh.length ? metrics.falseHigh.map((id) => <span key={id}>{EVENT_BY_ID[id].label}</span>) : <p>无</p>}</article>
          </div>
          <div className="lab-actions"><button className="button button--primary" onClick={exportRecord}>导出独立记录</button><button className="button button--secondary" onClick={reset}>下一位受试者</button></div>
        </section>
      </main>
    );
  }

  return (
    <main className="lab-shell">
      <header><a href="/">知命局</a><span>盲测实验室</span><b>研究入口</b></header>
      <section className="lab-intro">
        <p className="eyebrow">Gold label first</p>
        <h1>先锁定完整履历，<br />再让模型盲推。</h1>
        <p>这份履历只用于最后评分，不会传给问答引擎。研究员应在受试者开始问答前一次性标完。</p>
      </section>
      <section className="lab-form">
        <div className="lab-fields">
          <label><span>受试者编号</span><input value={participantId} onChange={(event) => setParticipantId(event.target.value)} placeholder="如 P-0001" /></label>
          <label><span>样本组</span><select value={cohort} onChange={(event) => setCohort(event.target.value as ValidationCohort)}><option value="cognitive">认知访谈</option><option value="calibration">校准样本</option><option value="validation">独立验证</option><option value="retest">隔周复测</option></select></label>
          <label><span>出生日期</span><input type="date" value={intake.birthDate} onChange={(event) => setIntake({ ...intake, birthDate: event.target.value })} /></label>
          <label><span>性别</span><select value={intake.gender} onChange={(event) => setIntake({ ...intake, gender: event.target.value as Intake["gender"] })}><option value="unspecified">不设限</option><option value="male">男</option><option value="female">女</option></select></label>
          <label><span>地区</span><input value={intake.birthplace} onChange={(event) => setIntake({ ...intake, birthplace: event.target.value })} placeholder="如 杭州" /></label>
        </div>
        <div className="lab-truth-count">已标记 <strong>{truthIds.length}</strong> / {LIFE_EVENTS.length} 项</div>
        <div className="truth-domains">
          {(Object.keys(DOMAIN_META) as EventDomain[]).map((domain) => (
            <fieldset key={domain}>
              <legend>{DOMAIN_META[domain].title}</legend>
              {LIFE_EVENTS.filter((event) => event.domain === domain).map((event) => (
                <label key={event.id} className={truthIds.includes(event.id) ? "is-checked" : ""}>
                  <input type="checkbox" checked={truthIds.includes(event.id)} onChange={() => toggleTruth(event.id)} />
                  <span><strong>{event.label}</strong><small>{event.description}</small></span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <button className="button button--primary" onClick={lockTruth}>锁定履历，开始盲测</button>
      </section>
    </main>
  );
}
