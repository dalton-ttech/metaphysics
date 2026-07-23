"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { buildTiebanBook } from "@/lib/tieban-v3-book";
import { V3_ATOMIC_FACTS, V3_CALIBRATION_CLAUSES, V3_FATE_CLAUSES } from "@/lib/tieban-v3-content";
import {
  answerTiebanClause,
  createTiebanSession,
  getLockedCandidate,
  getRitualPhaseLabel,
  rankCandidates
} from "@/lib/tieban-v3-engine";
import {
  articleLabel,
  keLabel,
  ritualNumberCells,
  ritualStatusCopy,
  SHICHEN,
  shichenLabel,
  volumeLabel
} from "@/lib/tieban-v3-ritual";
import type { Gender } from "@/lib/types";
import type { TiebanAnswer, TiebanBook, TiebanIntake, TiebanSession } from "@/lib/tieban-v3-types";

type View = "landing" | "intake" | "calibration" | "locked" | "book";

const STORAGE_KEY = "tieban-life-decoder-v4";

const emptyIntake: TiebanIntake = {
  name: "",
  birthDate: "1990-06-18",
  birthShichen: 0,
  gender: "unspecified",
  birthplace: ""
};

const SHICHEN_RANGES = [
  "23—01", "01—03", "03—05", "05—07", "07—09", "09—11",
  "11—13", "13—15", "15—17", "17—19", "19—21", "21—23"
];

function validBirthDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const parsed = new Date(`${value}T00:00:00`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.getFullYear() === Number(match[1]) &&
    parsed.getMonth() + 1 === Number(match[2]) &&
    parsed.getDate() === Number(match[3]) &&
    Number(match[1]) >= 1900 && parsed.getTime() <= Date.now();
}

const CURRENT_YEAR = new Date().getFullYear();
const BIRTH_YEARS = Array.from({ length: CURRENT_YEAR - 1899 }, (_, index) => CURRENT_YEAR - index);
const BIRTH_MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match
    ? { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
    : { year: 1990, month: 6, day: 18 };
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function updateBirthDate(value: string, part: "year" | "month" | "day", nextValue: number) {
  const parts = dateParts(value);
  const next = { ...parts, [part]: nextValue };
  next.day = Math.min(next.day, daysInMonth(next.year, next.month));
  return `${next.year}-${String(next.month).padStart(2, "0")}-${String(next.day).padStart(2, "0")}`;
}

interface PaperSelectOption {
  value: number;
  label: string;
}

function PaperSelect({
  ariaLabel,
  value,
  options,
  onChange,
  placement = "down"
}: {
  ariaLabel: string;
  value: number;
  options: PaperSelectOption[];
  onChange: (value: number) => void;
  placement?: "up" | "down";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const listId = `paper-select-${ariaLabel.replace(/\s+/gu, "-")}`;
  const selected = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const closeFromOutside = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeFromKeyboard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeFromOutside);
    document.addEventListener("keydown", closeFromKeyboard);
    window.requestAnimationFrame(() => selectedRef.current?.scrollIntoView({ block: "center" }));
    return () => {
      document.removeEventListener("mousedown", closeFromOutside);
      document.removeEventListener("keydown", closeFromKeyboard);
    };
  }, [open]);

  const choose = (next: number) => {
    onChange(next);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  return (
    <div className={`tb-paper-select tb-paper-select--${placement}${open ? " is-open" : ""}`} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="tb-paper-select__trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span>{selected?.label}</span><i aria-hidden="true">⌄</i>
      </button>
      {open ? (
        <div id={listId} className="tb-paper-select__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              ref={option.value === value ? selectedRef : undefined}
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              onClick={() => choose(option.value)}
            >
              <span>{option.label}</span>{option.value === value ? <i aria-hidden="true">定</i> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Brand({ subdued = false }: { subdued?: boolean }) {
  return <span className={`tb-brand${subdued ? " tb-brand--subdued" : ""}`}><b>铁</b>板神数</span>;
}

export function Landing({ onBegin }: { onBegin: () => void }) {
  return (
    <main className="tb-shell tb-landing">
      <header className="tb-topline"><Brand /><span>十二卷 · 考刻定分</span></header>
      <section className="tb-landing__body">
        <div className="tb-landing__seal" aria-hidden="true"><span>考</span><span>时</span><span>定</span><span>刻</span></div>
        <div className="tb-landing__copy">
          <p className="tb-eyebrow">乾集 · 启卷</p>
          <h1>前尘有数，<br /><em>刻分待明。</em></h1>
          <p className="tb-landing__verse">一珠动处分辰刻，<br />十二卷中见旧痕。</p>
          <button className="tb-primary-action" onClick={onBegin}><span>开局</span></button>
        </div>
        <div className="tb-landing__folio" aria-label="命籍卷次">
          {Array.from({ length: 12 }, (_, index) => <span key={index}>{String(index + 1).padStart(2, "0")}</span>)}
          <b>命籍十二卷</b>
        </div>
      </section>
      <footer className="tb-footer"><span>数有定序</span><span>一人一卷</span></footer>
    </main>
  );
}

export function IntakeView({ value, onChange, onStart, onBack }: {
  value: TiebanIntake;
  onChange: (next: TiebanIntake) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState("");
  const birth = dateParts(value.birthDate);
  const birthDays = Array.from({ length: daysInMonth(birth.year, birth.month) }, (_, index) => index + 1);
  const start = () => {
    if (!validBirthDate(value.birthDate)) {
      setError("生辰未明，请先落下出生年月日。");
      return;
    }
    setError("");
    onStart();
  };

  return (
    <main className="tb-shell tb-intake">
      <header className="tb-topline"><button className="tb-text-button" onClick={onBack}>卷首</button><Brand subdued /><span>起例</span></header>
      <section className="tb-intake__body">
        <div className="tb-section-mark"><b>壹</b><span>四柱起例</span></div>
        <div className="tb-intake__intro">
          <p className="tb-eyebrow">乾集 · 起例</p>
          <h1>请定年月，<br />再择大概时辰。</h1>
        </div>
        <div className="tb-intake__form">
          <label className="tb-line-field"><span>称呼</span><input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="可不留名" /></label>
          <div className="tb-date-field">
            <span>生辰</span>
            <div className="tb-date-selects">
              <div className="tb-date-part"><PaperSelect ariaLabel="出生年份" value={birth.year} options={BIRTH_YEARS.map((year) => ({ value: year, label: String(year) }))} onChange={(year) => onChange({ ...value, birthDate: updateBirthDate(value.birthDate, "year", year) })} /><small>年</small></div>
              <div className="tb-date-part"><PaperSelect ariaLabel="出生月份" value={birth.month} options={BIRTH_MONTHS.map((month) => ({ value: month, label: String(month).padStart(2, "0") }))} onChange={(month) => onChange({ ...value, birthDate: updateBirthDate(value.birthDate, "month", month) })} /><small>月</small></div>
              <div className="tb-date-part"><PaperSelect ariaLabel="出生日期" value={birth.day} options={birthDays.map((day) => ({ value: day, label: String(day).padStart(2, "0") }))} onChange={(day) => onChange({ ...value, birthDate: updateBirthDate(value.birthDate, "day", day) })} /><small>日</small></div>
            </div>
          </div>
          <label className="tb-line-field"><span>出生地</span><input value={value.birthplace} onChange={(event) => onChange({ ...value, birthplace: event.target.value })} placeholder="城镇即可" /></label>
          <div className="tb-gender-field"><span>命主</span><div>{([['male', '乾'], ['female', '坤'], ['unspecified', '不定']] as Array<[Gender, string]>).map(([gender, label]) => <button key={gender} className={value.gender === gender ? "is-selected" : ""} onClick={() => onChange({ ...value, gender })}>{label}</button>)}</div></div>
        </div>
        <div className="tb-shichen-select"><span>约在何时</span><span className="tb-select-rule"><PaperSelect ariaLabel="约在何时" value={value.birthShichen} options={SHICHEN.map((label, index) => ({ value: index, label: `${label}时 · ${SHICHEN_RANGES[index]}` }))} onChange={(birthShichen) => onChange({ ...value, birthShichen })} placement="up" /><i aria-hidden="true">择</i></span></div>
        {error ? <p className="tb-form-error" role="alert">{error}</p> : null}
        <button className="tb-primary-action" onClick={start}><span>起数</span></button>
      </section>
      <footer className="tb-footer"><span>一命一卷</span><span>{shichenLabel(value.birthShichen)}</span></footer>
    </main>
  );
}

function NumberBoard({ session, clauseId }: { session: TiebanSession; clauseId: string }) {
  const clause = V3_CALIBRATION_CLAUSES.find((item) => item.id === clauseId) ?? V3_CALIBRATION_CLAUSES[0];
  const cells = ritualNumberCells(clause, session);
  return (
    <div className="tb-number-board" aria-label="铁算盘数序">
      {cells.slice(0, 4).map((cell, index) => <span key={`top-${index}`} className={cell.active ? "is-active" : ""}><b>{cell.stem}</b><i>{cell.digit}</i></span>)}
      <span className={cells[4].active ? "is-active" : ""}><b>{cells[4].stem}</b><i>{cells[4].digit}</i></span>
      <strong><small>{shichenLabel(session.intake.birthShichen)}</small>{getRitualPhaseLabel(session.phase)}</strong>
      <span className={cells[5].active ? "is-active" : ""}><b>{cells[5].stem}</b><i>{cells[5].digit}</i></span>
      {cells.slice(6).map((cell, index) => <span key={`bottom-${index}`} className={cell.active ? "is-active" : ""}><b>{cell.stem}</b><i>{cell.digit}</i></span>)}
    </div>
  );
}

export function AnswerKey({ tone, label, note, onClick }: { tone: "yes" | "no"; label: string; note?: string; onClick: () => void }) {
  return <button className={`tb-answer-key tb-answer-key--${tone}`} onClick={onClick}><b>{label}</b>{note ? <small>{note}</small> : null}</button>;
}

function CalibrationView({ session, busy, onAnswer, onUndo, onReset }: {
  session: TiebanSession;
  busy: boolean;
  onAnswer: (answer: TiebanAnswer) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const clause = V3_CALIBRATION_CLAUSES.find((item) => item.id === session.currentClauseId);
  if (!clause) return null;
  const ranking = rankCandidates(session);
  return (
    <main className={`tb-shell tb-calibration${busy ? " is-recalculating" : ""}`}>
      <header className="tb-topline"><Brand subdued /><span>{getRitualPhaseLabel(session.phase)} · {shichenLabel(session.intake.birthShichen)}</span></header>
      <section className="tb-calibration__body">
        <div className="tb-calibration__status"><span>{ritualStatusCopy(session)}</span><i aria-hidden="true" /></div>
        <NumberBoard session={session} clauseId={clause.id} />
        <article className="tb-clause-leaf" key={clause.id}>
          <header><span>{volumeLabel(clause.volume)}</span><b>{clause.displayCode}</b><span>{articleLabel(clause.article)}</span></header>
          <div className="tb-clause-leaf__paper">
            <p>{clause.text}</p>
            <aside aria-hidden="true">乾集</aside>
          </div>
          <details className="tb-interpreter"><summary>司刻解</summary><p>{clause.interpretation}</p></details>
        </article>
        <div className="tb-answer-console" aria-label="条文是否应验">
          <AnswerKey tone="yes" label="应" onClick={() => onAnswer("resonates")} />
          <AnswerKey tone="no" label="不应" onClick={() => onAnswer("not_resonates")} />
        </div>
        <div className="tb-minor-actions"><button onClick={() => onAnswer("unclear")}>未明</button><button onClick={onUndo} disabled={!session.answers.length}>改上一条</button><button onClick={onReset}>撤局</button></div>
        <span className="tb-a11y-status" aria-live="polite">当前首选刻分 {ranking[0]?.candidate.clockTime}</span>
      </section>
      {busy ? <div className="tb-recalculate" aria-live="polite"><span>复</span><p>铁算盘复校</p></div> : null}
    </main>
  );
}

function LockedView({ session, onOpenBook, onReset }: { session: TiebanSession; onOpenBook: () => void; onReset: () => void }) {
  const candidate = getLockedCandidate(session);
  return (
    <main className="tb-shell tb-locked">
      <header className="tb-topline"><Brand subdued /><span>刻成</span></header>
      <section className="tb-locked__body">
        <div className="tb-lock-seal" aria-hidden="true">定</div>
        <p className="tb-eyebrow">诸条既合 · 八刻归一</p>
        <h1>{candidate.clockTime}</h1>
        <p className="tb-locked__ke">{shichenLabel(session.intake.birthShichen)} · {keLabel(candidate)}</p>
        <div className="tb-locked__rule"><span>命籍编号</span><b>{session.answers.at(-1)?.topCandidateAfter.replace("刻-", "") ?? candidate.id}</b><span>{session.lockStrength === "decisive" ? "正合" : session.lockStrength === "stable" ? "已稳" : "取近"}</span></div>
        <button className="tb-primary-action" onClick={onOpenBook}><span>启命书</span></button>
        <button className="tb-text-button" onClick={onReset}>另起一局</button>
      </section>
    </main>
  );
}

function BookView({ book, onReset }: { book: TiebanBook; onReset: () => void }) {
  return (
    <main className="tb-shell tb-book">
      <header className="tb-topline"><Brand subdued /><span>{book.seal}</span></header>
      <section className="tb-book__cover">
        <p className="tb-eyebrow">命籍既开</p>
        <h1>{book.title}</h1>
        <div><b>{book.exactTime}</b><span>{book.keLabel}</span></div>
        <p>{book.opening}</p>
      </section>
      <nav className="tb-book__index" aria-label="命书卷目"><a href="#past">前尘</a><a href="#future">后程</a><a href="#closing">卷尾</a></nav>
      <section className="tb-book__section" id="past">
        <header><span>卷一</span><h2>前尘纪</h2></header>
        <div className="tb-past-nodes">
          {book.pastNodes.length ? book.pastNodes.map((node, index) => (
            <article key={node.id}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div><small>{node.ageRange} · {node.subject}</small><h3>{node.title}</h3><p className="tb-past-nodes__summary">{node.summary}</p><p>{node.aftereffect}</p></div>
            </article>
          )) : <p className="tb-empty-book">应验旧迹尚少，此卷只留定刻，不妄添前尘。</p>}
        </div>
      </section>
      <section className="tb-book__section tb-book__section--future" id="future">
        <header><span>卷二</span><h2>后程录</h2></header>
        <div className="tb-future-nodes">
          {book.futureNodes.map((node, index) => (
            <article key={node.id}><b>{String(index + 1).padStart(2, "0")}</b><small>{node.horizon}</small><h3>{node.title}</h3><blockquote>{node.verse}</blockquote><p>{node.reading}</p><strong>{node.consequence}</strong></article>
          ))}
        </div>
      </section>
      <section className="tb-book__closing" id="closing"><p>{book.closing}</p><button className="tb-primary-action" onClick={onReset}><span>合卷</span></button></section>
    </main>
  );
}

function replaySession(session: TiebanSession, answerCount: number) {
  let replay = createTiebanSession(session.intake, V3_CALIBRATION_CLAUSES, V3_ATOMIC_FACTS, session.createdAt);
  for (const record of session.answers.slice(0, answerCount)) {
    replay = answerTiebanClause(replay, record.answer, V3_CALIBRATION_CLAUSES, V3_ATOMIC_FACTS, record.answeredAt);
  }
  return replay;
}

export function ExperienceV3() {
  const [view, setView] = useState<View>("landing");
  const [intake, setIntake] = useState<TiebanIntake>(emptyIntake);
  const [session, setSession] = useState<TiebanSession | null>(null);
  const [book, setBook] = useState<TiebanBook | null>(null);
  const [busy, setBusy] = useState(false);
  const clauseById = useMemo(() => Object.fromEntries(V3_CALIBRATION_CLAUSES.map((clause) => [clause.id, clause])), []);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { view: View; intake: TiebanIntake; session: TiebanSession | null; book: TiebanBook | null };
      setView(parsed.view);
      setIntake(parsed.intake);
      setSession(parsed.session);
      setBook(parsed.book);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (view === "landing") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ view, intake, session, book }));
  }, [view, intake, session, book]);

  const begin = () => {
    const next = createTiebanSession(intake, V3_CALIBRATION_CLAUSES, V3_ATOMIC_FACTS);
    setSession(next);
    setBook(null);
    setView("calibration");
  };

  const answer = (value: TiebanAnswer) => {
    if (!session || busy) return;
    setBusy(true);
    const next = answerTiebanClause(session, value, V3_CALIBRATION_CLAUSES, V3_ATOMIC_FACTS);
    window.setTimeout(() => {
      setSession(next);
      setBusy(false);
      if (next.completedAt) setView("locked");
    }, 520);
  };

  const undo = () => {
    if (!session?.answers.length || busy) return;
    const replay = replaySession(session, session.answers.length - 1);
    setSession(replay);
  };

  const openBook = () => {
    if (!session) return;
    const nextBook = buildTiebanBook(session, V3_ATOMIC_FACTS, V3_CALIBRATION_CLAUSES, V3_FATE_CLAUSES);
    setBook(nextBook);
    setView("book");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setView("landing");
    setIntake(emptyIntake);
    setSession(null);
    setBook(null);
    setBusy(false);
    window.localStorage.removeItem(STORAGE_KEY);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "landing") return <Landing onBegin={() => setView("intake")} />;
  if (view === "intake") return <IntakeView value={intake} onChange={setIntake} onStart={begin} onBack={() => setView("landing")} />;
  if (view === "calibration" && session && session.currentClauseId && clauseById[session.currentClauseId]) return <CalibrationView session={session} busy={busy} onAnswer={answer} onUndo={undo} onReset={reset} />;
  if (view === "locked" && session) return <LockedView session={session} onOpenBook={openBook} onReset={reset} />;
  if (view === "book" && book) return <BookView book={book} onReset={reset} />;
  return <Landing onBegin={() => setView("intake")} />;
}
