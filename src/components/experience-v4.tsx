"use client";

import { useEffect, useMemo, useState } from "react";

import { AnswerKey, Brand, IntakeView, Landing } from "@/components/experience-shell";
import { buildTiebanBookV4 } from "@/lib/tieban-v4-book";
import {
  answerTiebanClauseV4,
  createTiebanSessionV4,
  getLockedCandidateV4,
  getLockedProfileV4,
  rankCandidatesV4
} from "@/lib/tieban-v4-engine";
import { buildRitualTraceV4, ritualNumberCellsV4, ritualStatusCopyV4 } from "@/lib/tieban-v4-ritual";
import { articleLabel, keLabel, shichenLabel, volumeLabel } from "@/lib/tieban-v3-ritual";
import type {
  AtomicFact,
  TiebanAnswer,
  TiebanBookV4,
  TiebanClause,
  TiebanIntake,
  TiebanMutualExclusionConstraint,
  TiebanV4Session
} from "@/lib/tieban-v4-types";

type View = "landing" | "intake" | "calibration" | "locked" | "undetermined" | "book";

const STORAGE_KEY = "tieban-life-decoder-v4-causal-v6.3";

interface V4Corpus {
  atomicFacts: AtomicFact[];
  calibrationClauses: TiebanClause[];
  constraints: TiebanMutualExclusionConstraint[];
  fateClauses: TiebanClause[];
}

let corpusPromise: Promise<V4Corpus> | null = null;

function loadV4Corpus() {
  if (!corpusPromise) {
    corpusPromise = import("@/lib/tieban-v4-content")
      .then((content) => ({
        atomicFacts: content.V4_ATOMIC_FACTS,
        calibrationClauses: content.V4_CALIBRATION_CLAUSES,
        constraints: content.V4_CONSTRAINTS,
        fateClauses: content.V4_FATE_CLAUSES
      }))
      .catch((error: unknown) => {
        corpusPromise = null;
        throw error;
      });
  }
  return corpusPromise;
}
const emptyIntake: TiebanIntake = {
  name: "",
  birthDate: "1990-06-18",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: ""
};

const phaseLabels = {
  initial: "考亲",
  recalculate: "验事",
  narrowing: "辨刻",
  verification: "旁证",
  locked: "刻成",
  undetermined: "待复"
} as const;

function KeCandidateRail({ session }: { session: TiebanV4Session }) {
  const ranking = rankCandidatesV4(session);
  const masses = Array.from({ length: 8 }, () => 0);
  for (const item of ranking) masses[item.candidate.keIndex - 1] += item.probability;
  const leader = masses.indexOf(Math.max(...masses));
  const runnerUp = masses
    .map((mass, index) => ({ mass, index }))
    .filter((item) => item.index !== leader)
    .sort((a, b) => b.mass - a.mass)[0]?.index;
  return (
    <section className="tb-ke-rail" aria-label="八个候选刻位正在随旧事收敛">
      <header><span>八刻候选</span><b>{phaseLabels[session.phase]}</b></header>
      <div>
        {masses.map((mass, index) => {
          const candidate = session.candidates[index * 15];
          const state = index === leader ? "is-leading" : index === runnerUp ? "is-live" : mass < 0.03 ? "is-faded" : "";
          return <span key={index} className={state}><i>{index + 1}</i><small>{candidate.clockTime}</small></span>;
        })}
      </div>
    </section>
  );
}

function EvidenceSeals({ session }: { session: TiebanV4Session }) {
  const count = session.answers.length;
  const stages = [
    { label: "亲", active: count >= 3 },
    { label: "事", active: count >= 8 },
    { label: "刻", active: count >= 13 },
    { label: "证", active: count >= 14 && (session.phase === "verification" || session.phase === "locked") }
  ];
  return <div className="tb-evidence-seals" aria-label="旧事证据印">{stages.map((stage) => <span key={stage.label} className={stage.active ? "is-active" : ""}>{stage.label}</span>)}</div>;
}

function NumberBoardV4({ session, clause }: { session: TiebanV4Session; clause: TiebanClause }) {
  const cells = ritualNumberCellsV4(session, clause);
  const trace = buildRitualTraceV4(session, clause);
  return (
    <div className="tb-number-board tb-number-board--v4" aria-label="铁算盘起数结果">
      {cells.slice(0, 4).map((cell, index) => <span key={`top-${index}`} className={cell.active ? "is-active" : ""}><b>{cell.stem}</b><i>{cell.digit}</i></span>)}
      <span className={cells[4].active ? "is-active" : ""}><b>{cells[4].stem}</b><i>{cells[4].digit}</i></span>
      <strong><small>定数 {trace.clauseNumber}</small>{phaseLabels[session.phase]}</strong>
      <span className={cells[5].active ? "is-active" : ""}><b>{cells[5].stem}</b><i>{cells[5].digit}</i></span>
      {cells.slice(6).map((cell, index) => <span key={`bottom-${index}`} className={cell.active ? "is-active" : ""}><b>{cell.stem}</b><i>{cell.digit}</i></span>)}
    </div>
  );
}

function CalibrationViewV4({ session, clauses, busy, onAnswer, onUndo, onReset }: {
  session: TiebanV4Session;
  clauses: TiebanClause[];
  busy: boolean;
  onAnswer: (answer: TiebanAnswer) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const clause = clauses.find((item) => item.id === session.currentClauseId);
  if (!clause) return null;
  const trace = buildRitualTraceV4(session, clause);
  return (
    <main className={`tb-shell tb-calibration tb-calibration--v4${busy ? " is-recalculating" : ""}`}>
      <header className="tb-topline"><Brand subdued /><span>{phaseLabels[session.phase]} · {shichenLabel(session.intake.birthShichen)}</span></header>
      <section className="tb-calibration__body">
        <div className="tb-calibration__status"><span>{ritualStatusCopyV4(session)}</span><i aria-hidden="true" /></div>
        <KeCandidateRail session={session} />
        <NumberBoardV4 session={session} clause={clause} />
        <article className="tb-clause-leaf" key={clause.id}>
          <header><span>{volumeLabel(trace.volume)}</span><b>{trace.clauseNumber}</b><span>{articleLabel(trace.article)}</span></header>
          <div className="tb-clause-leaf__paper">
            <p>{clause.text}</p>
            <aside aria-hidden="true">乾集</aside>
          </div>
          <footer className="tb-clause-gloss">
            <span>今解</span>
            <p>{clause.interpretation}</p>
          </footer>
        </article>
        <div className="tb-answer-console" aria-label="判定条文是否与旧事相合">
          <AnswerKey tone="yes" label="应" onClick={() => onAnswer("resonates")} />
          <AnswerKey tone="no" label="不应" onClick={() => onAnswer("not_resonates")} />
        </div>
        <EvidenceSeals session={session} />
        <div className="tb-minor-actions"><button onClick={() => onAnswer("unclear")}>未明</button><button onClick={onUndo} disabled={!session.answers.length}>改上一条</button><button onClick={onReset}>撤局</button></div>
        <span className="tb-a11y-status" aria-live="polite">数序已校至{phaseLabels[session.phase]}</span>
      </section>
      {busy ? <div className="tb-recalculate" aria-live="polite"><span>复</span><p>移珠换数</p></div> : null}
    </main>
  );
}

function LockedViewV4({ session, onOpenBook, onReset }: { session: TiebanV4Session; onOpenBook: () => void; onReset: () => void }) {
  const candidate = getLockedCandidateV4(session);
  const profile = getLockedProfileV4(session);
  return (
    <main className="tb-shell tb-locked">
      <header className="tb-topline"><Brand subdued /><span>刻成</span></header>
      <section className="tb-locked__body">
        <div className="tb-lock-seal" aria-hidden="true">定</div>
        <p className="tb-eyebrow">旁证既合 · 八刻归一</p>
        <h1>{candidate.clockTime}</h1>
        <p className="tb-locked__ke">{shichenLabel(session.intake.birthShichen)} · {keLabel(candidate)}</p>
        <div className="tb-locked__rule"><span>命籍编号</span><b>{profile.profileCode}</b><span>{session.lockStrength === "decisive" ? "正合" : "已稳"}</span></div>
        <EvidenceSeals session={session} />
        <button className="tb-primary-action" onClick={onOpenBook}><span>启命书</span></button>
        <button className="tb-text-button" onClick={onReset}>另起一局</button>
      </section>
    </main>
  );
}

function UndeterminedView({ onReset }: { onReset: () => void }) {
  return (
    <main className="tb-shell tb-undetermined">
      <header className="tb-topline"><Brand subdued /><span>待复</span></header>
      <section className="tb-undetermined__body">
        <div className="tb-lock-seal" aria-hidden="true">待</div>
        <p className="tb-eyebrow">乾集 · 待复</p>
        <h1>诸数未归</h1>
        <blockquote>命籍暂封。</blockquote>
        <button className="tb-primary-action" onClick={onReset}><span>复起</span></button>
      </section>
    </main>
  );
}

function BookViewV4({ book, onReset }: { book: TiebanBookV4; onReset: () => void }) {
  const futureGroups = book.futureNodes.reduce<Array<{ label: string; nodes: TiebanBookV4["futureNodes"] }>>((groups, node) => {
    const current = groups.at(-1);
    if (current?.label === node.decadeLabel) current.nodes.push(node);
    else groups.push({ label: node.decadeLabel, nodes: [node] });
    return groups;
  }, []);
  const futureIndex = new Map(book.futureNodes.map((node, index) => [node.id, index + 1]));
  return (
    <main className="tb-shell tb-book tb-book--v4">
      <header className="tb-topline"><Brand subdued /><span>{book.seal}</span></header>
      <section className="tb-book__cover">
        <p className="tb-eyebrow">命籍既开 · {book.profileCode}</p>
        <h1>{book.title}</h1>
        <div><b>{book.exactTime}</b><span>{book.keLabel}</span></div>
      </section>
      <nav className="tb-book__index" aria-label="命书卷目"><a href="#identity">命印</a><a href="#evidence">铁证</a><a href="#past">命路</a><a href="#future">后程</a></nav>
      <section className="tb-book__identity" id="identity">
        <div className="tb-identity-seal" aria-label={book.identity.title}>{[...book.identity.title].map((character, index) => <i key={`${character}-${index}`}>{character}</i>)}</div>
        <div><span>命印</span><h2>{book.identity.dictum}</h2><p>{book.identity.reading}</p></div>
      </section>
      <section className="tb-book__evidence" id="evidence">
        <header><span>卷一</span><h2>三处铁证</h2></header>
        <div>{book.ironEvidence.map((node, index) => <article key={node.id}><b>{String(index + 1).padStart(2, "0")}</b><small>{node.ageRange} · {node.subject}</small><h3>{node.title.replace(/^.*? · /u, "")}</h3><p>{node.aftereffect}</p></article>)}</div>
      </section>
      <section className="tb-book__section" id="past">
        <header><span>卷二</span><h2>命路纪</h2></header>
        <div className="tb-past-nodes">
          {book.pastNodes.length ? book.pastNodes.map((node, index) => (
            <article key={node.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><small>{node.ageRange} · {node.subject} · 条文 {node.clauseNumber}</small><h3>{node.title}</h3><blockquote className="tb-past-nodes__summary">{node.summary}</blockquote><p>{node.aftereffect}</p>{book.storyEdges[index] ? <em>{book.storyEdges[index].text}</em> : null}</div>
            </article>
          )) : <p className="tb-empty-book">此卷无文。</p>}
        </div>
      </section>
      {book.unaskedInsight ? <section className="tb-book__unasked"><span>未问而见</span><blockquote>{book.unaskedInsight.summary}</blockquote><h2>{book.unaskedInsight.title.replace(/^.*? · /u, "")}</h2><p>{book.unaskedInsight.aftereffect}</p></section> : null}
      <section className="tb-book__section tb-book__section--future" id="future">
        <header><span>卷三</span><h2>后程录</h2></header>
        <div>
          <div className="tb-future-origin"><span>今岁</span><b>{book.currentAge}</b><i aria-hidden="true" /></div>
          <div className="tb-future-nodes">
            {futureGroups.map((group) => (
              <section className={`tb-future-era${group.label === "寿限" ? " is-terminal" : ""}`} key={group.label}>
                <header><span>{group.label}</span></header>
                <div>
                  {group.nodes.map((node) => (
                    <article className={node.terminal ? "is-terminal" : ""} key={node.id}>
                      <div className="tb-future-node__mark"><b>{String(futureIndex.get(node.id)).padStart(2, "0")}</b><small>{node.horizon}</small></div>
                      <div className="tb-future-node__copy"><blockquote>{node.verse}</blockquote><em>{node.sign}</em><p>{node.reading}</p></div>
                      {node.terminal ? <i className="tb-future-terminal__seal" aria-label="寿限">寿<br />限</i> : null}
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>
      <section className="tb-book__closing" id="closing"><p>{book.closing}</p><button className="tb-primary-action" onClick={onReset}><span>合卷</span></button></section>
    </main>
  );
}

function replaySession(session: TiebanV4Session, answerCount: number, corpus: V4Corpus) {
  let replay = createTiebanSessionV4(
    session.intake,
    corpus.calibrationClauses,
    corpus.atomicFacts,
    corpus.fateClauses,
    session.createdAt,
    corpus.constraints
  );
  for (const record of session.answers.slice(0, answerCount)) {
    replay = answerTiebanClauseV4(replay, record.answer, corpus.calibrationClauses, corpus.atomicFacts, record.answeredAt);
  }
  return replay;
}

export function ExperienceV4() {
  const [view, setView] = useState<View>("landing");
  const [intake, setIntake] = useState<TiebanIntake>(emptyIntake);
  const [session, setSession] = useState<TiebanV4Session | null>(null);
  const [book, setBook] = useState<TiebanBookV4 | null>(null);
  const [corpus, setCorpus] = useState<V4Corpus | null>(null);
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const clauseById = useMemo(
    () => Object.fromEntries((corpus?.calibrationClauses ?? []).map((clause) => [clause.id, clause])),
    [corpus]
  );

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view]);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { view: View; intake: TiebanIntake; session: TiebanV4Session | null; book: TiebanBookV4 | null };
      if (parsed.session && parsed.session.version !== "4.0.0") throw new Error("旧局版本不兼容");
      setView(parsed.view);
      setIntake(parsed.intake);
      setSession(parsed.session);
      setBook(parsed.book);
      if (parsed.view === "calibration") {
        void loadV4Corpus().then((loaded) => {
          setCorpus(loaded);
          setView(parsed.view);
        }).catch(() => window.localStorage.removeItem(STORAGE_KEY));
      } else {
        setView(parsed.view);
        if (parsed.view === "intake" || parsed.view === "locked") {
          void loadV4Corpus().then(setCorpus).catch(() => undefined);
        }
      }
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (view === "landing") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ view, intake, session, book }));
    } catch {
      // A complete profile stays in memory if a constrained webview rejects the larger sealed session.
    }
  }, [view, intake, session, book]);

  const enterIntake = () => {
    setStartError("");
    setView("intake");
    void loadV4Corpus().then(setCorpus).catch(() => undefined);
  };

  const begin = async () => {
    if (starting) return;
    setStarting(true);
    setStartError("");
    try {
      const loaded = corpus ?? await loadV4Corpus();
      setCorpus(loaded);
      const next = createTiebanSessionV4(
        intake,
        loaded.calibrationClauses,
        loaded.atomicFacts,
        loaded.fateClauses,
        Date.now(),
        loaded.constraints
      );
      setSession(next);
      setBook(null);
      setView(next.phase === "undetermined" ? "undetermined" : "calibration");
    } catch {
      setStartError("起数未成，请再试。");
    } finally {
      setStarting(false);
    }
  };

  const answer = (value: TiebanAnswer) => {
    if (!session || !corpus || busy) return;
    setBusy(true);
    const next = answerTiebanClauseV4(session, value, corpus.calibrationClauses, corpus.atomicFacts);
    window.setTimeout(() => {
      setSession(next);
      setBusy(false);
      if (next.phase === "locked") setView("locked");
      if (next.phase === "undetermined") setView("undetermined");
    }, 420);
  };

  const undo = () => {
    if (!session?.answers.length || !corpus || busy) return;
    setSession(replaySession(session, session.answers.length - 1, corpus));
  };

  const openBook = async () => {
    if (!session || session.phase !== "locked") return;
    const loaded = corpus ?? await loadV4Corpus();
    setCorpus(loaded);
    setBook(buildTiebanBookV4(session, loaded.atomicFacts, loaded.calibrationClauses, loaded.fateClauses));
    setView("book");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setView("landing");
    setIntake(emptyIntake);
    setSession(null);
    setBook(null);
    setBusy(false);
    setStarting(false);
    setStartError("");
    window.localStorage.removeItem(STORAGE_KEY);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "landing") return <Landing onBegin={enterIntake} />;
  if (view === "intake") return <IntakeView value={intake} onChange={setIntake} onStart={begin} onBack={() => setView("landing")} starting={starting} startError={startError} />;
  if (view === "calibration" && corpus && session?.currentClauseId && clauseById[session.currentClauseId]) return <CalibrationViewV4 session={session} clauses={corpus.calibrationClauses} busy={busy} onAnswer={answer} onUndo={undo} onReset={reset} />;
  if (view === "locked" && session) return <LockedViewV4 session={session} onOpenBook={openBook} onReset={reset} />;
  if (view === "undetermined" && session) return <UndeterminedView onReset={reset} />;
  if (view === "book" && book) return <BookViewV4 book={book} onReset={reset} />;
  return <Landing onBegin={enterIntake} />;
}
