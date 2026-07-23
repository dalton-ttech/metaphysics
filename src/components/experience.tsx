"use client";

import { useEffect, useState, type ReactNode } from "react";

import { EVENT_BY_ID } from "@/lib/events";
import {
  ADAPTIVE_VERIFICATION_TURNS,
  answerCurrentQuestion,
  BASELINE_TURNS,
  createSession,
  MAX_TURNS
} from "@/lib/engine";
import { buildDestinyBook } from "@/lib/narrative";
import { getQuestionEvents, QUESTION_BY_ID } from "@/lib/questions";
import type { Answer, DecoderSession, DestinyBook, Focus, Gender, Intake, Question } from "@/lib/types";

type View = "landing" | "intake" | "reading" | "profile" | "book";

const STORAGE_KEY = "tieban-life-decoder-v2.3-ui";

const emptyIntake: Intake = {
  name: "",
  birthDate: "",
  gender: "unspecified",
  birthplace: "",
  focus: "overall"
};

const focusOptions: Array<{ value: Focus; label: string; note: string }> = [
  { value: "overall", label: "总论命书", note: "家门、事业、情缘与身心一并推演" },
  { value: "career_wealth", label: "事业财脉", note: "侧重职业、资产与合作旧线" },
  { value: "relationship", label: "情缘家门", note: "侧重婚恋、亲缘与家庭责任" },
  { value: "health_family", label: "身心家运", note: "侧重健康、照护与重大关口" }
];

const questionLeads = [
  "山水曾移，旧途有变",
  "旧页相叠，辨其真迹",
  "门庭有声，往事留痕",
  "行至转处，命线曾改"
];

function Brand() {
  return <a className="brand" href="/" aria-label="知命局首页">知命局<span aria-hidden="true">命</span></a>;
}

function AppFrame({ children, chapter, className = "" }: { children: ReactNode; chapter?: string; className?: string }) {
  return (
    <div className={`app-frame ${className}`.trim()}>
      <header className="app-header">
        <Brand />
        <span>{chapter ?? "铁板神数 · 人生交叉推演"}</span>
      </header>
      {children}
      <footer className="app-footer">
        <span>以事观命 · 以迹知局</span>
        <span>本地保存 · 随时续卷</span>
      </footer>
    </div>
  );
}

function StageProgress({ turn }: { turn: number }) {
  const stage = turn <= 16 ? 0 : turn <= 20 ? 1 : turn <= BASELINE_TURNS ? 2 : 3;
  const progress = Math.min(100, Math.max(0, (turn / MAX_TURNS) * 100));
  const labels = ["观全局", "辨隐线", "验旧痕", "定其事"];
  return (
    <div className="stage-progress" aria-label={`第 ${turn} 问，共 ${MAX_TURNS} 问`}>
      <div className="stage-progress__labels">
        {labels.map((label, index) => <span key={label} className={index === stage ? "is-current" : index < stage ? "is-done" : ""}>{label}</span>)}
      </div>
      <div className="stage-progress__track"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
      <div className="stage-progress__points" aria-hidden="true">
        {labels.map((label, index) => <i key={label} className={index === stage ? "is-current" : index < stage ? "is-done" : ""} />)}
      </div>
    </div>
  );
}

function Landing({ onBegin }: { onBegin: () => void }) {
  return (
    <AppFrame className="landing-frame">
      <main className="landing">
        <section className="landing__statement">
          <p className="kicker">以已知之事 · 解未见之程</p>
          <h1>旧事为钥，<br /><em>后程成书。</em></h1>
          <p className="landing__lead">先以二十四问交叉辨事，再用八问逐项验真。你的每次“是”与“否”，都会让四十八类人生旧迹逐步显形。</p>
          <button className="solid-action" onClick={onBegin}>启卷推演<span>约 8 分钟</span></button>
        </section>

        <section className="landing__method" aria-label="推演过程">
          <p>四卷成局</p>
          <ol>
            <li><b>壹</b><span><strong>定盘</strong><small>只取必要信息，建立初始概率</small></span></li>
              <li><b>贰</b><span><strong>问事</strong><small>固定二十四问，完整覆盖人生事件</small></span></li>
              <li><b>叁</b><span><strong>验前尘</strong><small>八项候选逐件确认，不以含混充数</small></span></li>
            <li><b>肆</b><span><strong>成命书</strong><small>只以确认旧事为根，推演后程</small></span></li>
          </ol>
        </section>
      </main>
    </AppFrame>
  );
}

function IntakeView({ value, onChange, onStart, onBack }: {
  value: Intake;
  onChange: (next: Intake) => void;
  onStart: () => void;
  onBack: () => void;
}) {
  const [error, setError] = useState("");
  const submit = () => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.birthDate);
    const parsed = match ? new Date(`${value.birthDate}T00:00:00`) : null;
    const isValid = Boolean(
      match && parsed && !Number.isNaN(parsed.getTime()) &&
      parsed.getFullYear() === Number(match[1]) &&
      parsed.getMonth() + 1 === Number(match[2]) &&
      parsed.getDate() === Number(match[3]) &&
      Number(match[1]) >= 1900 && parsed.getTime() <= Date.now()
    );
    if (!isValid) {
      setError("请按 YYYY-MM-DD 填写真实出生日期，例如 1992-06-18。");
      return;
    }
    setError("");
    onStart();
  };

  return (
    <AppFrame chapter="第一卷 · 定盘" className="intake-frame">
      <main className="intake">
        <section className="intake__intro">
          <button className="quiet-link" onClick={onBack}>返回卷首</button>
          <p className="kicker">先定此刻，再溯来路</p>
          <h1>留下几笔，<br />不替你预设答案。</h1>
          <p>年龄、性别与关注方向只调整事件的初始概率；所有人先完成同一套二十四问，再进入八项定向验真。</p>
        </section>

        <section className="intake__form" aria-label="基础信息">
          <label className="line-field"><span>称呼</span><input value={value.name} onChange={(event) => onChange({ ...value, name: event.target.value })} placeholder="可留空" /></label>
          <label className="line-field"><span>出生日期</span><input type="text" inputMode="numeric" autoComplete="bday" maxLength={10} placeholder="YYYY-MM-DD" value={value.birthDate} onChange={(event) => onChange({ ...value, birthDate: event.target.value })} /></label>
          <div className="choice-field">
            <span>性别</span>
            <div role="group" aria-label="性别">
              {([['male', '男'], ['female', '女'], ['unspecified', '不设限']] as Array<[Gender, string]>).map(([key, label]) => (
                <button key={key} type="button" className={value.gender === key ? "is-selected" : ""} onClick={() => onChange({ ...value, gender: key })}>{label}</button>
              ))}
            </div>
          </div>
          <label className="line-field"><span>成长或常居地</span><input value={value.birthplace} onChange={(event) => onChange({ ...value, birthplace: event.target.value })} placeholder="如：杭州" /></label>

          <fieldset className="focus-list">
            <legend>这次最想看什么</legend>
            {focusOptions.map((option, index) => (
              <button key={option.value} type="button" className={value.focus === option.value ? "is-selected" : ""} onClick={() => onChange({ ...value, focus: option.value })}>
                <b>{String(index + 1).padStart(2, "0")}</b><span><strong>{option.label}</strong><small>{option.note}</small></span><i aria-hidden="true" />
              </button>
            ))}
          </fieldset>
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button className="solid-action" onClick={submit}>定盘，进入问事<span>信息仅存于本机</span></button>
        </section>
      </main>
    </AppFrame>
  );
}

function AnswerKey({ answer, title, note, onClick }: { answer: "yes" | "no"; title: string; note: string; onClick: () => void }) {
  return (
    <button className={`answer-key answer-key--${answer}`} onClick={onClick}>
      <span className="answer-key__mark" aria-hidden="true" />
      <span className="answer-key__label">{title}</span>
      <small>{note}</small>
    </button>
  );
}

function questionLead(question: Question) {
  if (question.phase === "verify") return "一事一断，不借旁象";
  if (question.phase === "discriminate") return "隐线再辨，旧事见微";
  return questionLeads[question.styleVariant % questionLeads.length];
}

function ReadingView({ session, onAnswer, onUndo, onReset }: {
  session: DecoderSession;
  onAnswer: (answer: Answer) => void;
  onUndo: () => void;
  onReset: () => void;
}) {
  const question = session.currentQuestionId ? QUESTION_BY_ID[session.currentQuestionId] : null;
  const turn = session.answers.length + 1;
  if (!question) return null;
  const events = getQuestionEvents(question);

  return (
    <AppFrame chapter={turn <= BASELINE_TURNS ? "第二卷 · 问事" : "第三卷 · 验前尘"} className="reading-frame">
      <main className="reading" key={question.id}>
        <StageProgress turn={turn} />
        <div className="reading__index"><strong>{String(turn).padStart(2, "0")}</strong><span>/ {MAX_TURNS}</span></div>
        <section className="reading__question" aria-live="polite">
          <p className="kicker">{turn > BASELINE_TURNS ? `定向验真 · ${turn - BASELINE_TURNS}/${ADAPTIVE_VERIFICATION_TURNS}` : question.phase === "screen" ? "全域覆盘" : question.phase === "discriminate" ? "低频复核" : "重复验真"}</p>
          <h1>{questionLead(question)}</h1>
          <p className="reading__instruction">{events.length === 1 ? "回望至今，这件事是否明确发生过？" : `回望至今，以下${events.length}件事中，是否有任意一件明确发生过？`}</p>
          <ol className="event-prompts">
            {events.map((event, index) => (
              <li key={event.id}><b>{String(index + 1).padStart(2, "0")}</b><span><strong>{event.label}</strong><small>{event.description}</small></span></li>
            ))}
          </ol>
          <p className="reading__rule">{question.plainRule}</p>
        </section>

        <div className="answer-console" aria-label="请选择答案">
          <AnswerKey answer="yes" title="是" note="确有其事" onClick={() => onAnswer("yes")} />
          <AnswerKey answer="no" title="否" note="均未发生" onClick={() => onAnswer("no")} />
        </div>
        <div className="reading__minor-actions">
          <button onClick={() => onAnswer("unsure")}>暂时难断</button>
          <span aria-hidden="true">·</span>
          <button onClick={onUndo} disabled={session.answers.length === 0}>撤回上一问</button>
          <span aria-hidden="true">·</span>
          <button onClick={onReset}>重新起局</button>
        </div>
      </main>
    </AppFrame>
  );
}

function verificationOutcomes(session: DecoderSession) {
  return session.answers.slice(BASELINE_TURNS).flatMap((record) => {
    const question = QUESTION_BY_ID[record.questionId];
    if (!question || question.eventIds.length !== 1) return [];
    return [{ eventId: question.eventIds[0], answer: record.answer }];
  });
}

function confirmedTargetedEvents(session: DecoderSession) {
  return verificationOutcomes(session).filter((item) => item.answer === "yes").map((item) => item.eventId);
}

function ConfirmedSummary({ session, selected, onBuildBook, onReviewAgain, onReviseLast, onReset }: {
  session: DecoderSession;
  selected: string[];
  onBuildBook: () => void;
  onReviewAgain: () => void;
  onReviseLast: () => void;
  onReset: () => void;
}) {
  const outcomes = verificationOutcomes(session);
  return (
    <main className="confirmation-summary">
      <p className="kicker">前尘已核</p>
      <h1>{selected.length ? `你确认了 ${selected.length} 段旧迹。` : "八项候选，均未落印。"}</h1>
      <p>{selected.length ? "命书只把你明确回答“是”的经历当作事实；已排除与未决项不会被写成旧事。" : "系统不会把任何候选写成既成事实；后程只沿用这次答卷划出的边界。"}</p>
      <ol>
        {outcomes.map((item, index) => (
          <li key={item.eventId}>
            <b>{String(index + 1).padStart(2, "0")}</b>
            <span><strong>{EVENT_BY_ID[item.eventId].label}</strong><small className={`outcome outcome--${item.answer}`}>{item.answer === "yes" ? "已确认" : item.answer === "no" ? "已排除" : "未决"}</small></span>
          </li>
        ))}
      </ol>
      <button className="solid-action" onClick={onBuildBook}>沿已核边界，生成命书<span>共五章</span></button>
      <div className="summary-actions"><button onClick={onReviseLast}>修改最后一项</button><button onClick={onReviewAgain}>重核八项</button><button onClick={onReset}>重新起局</button></div>
    </main>
  );
}

function ProfileView({ session, selected, onBuildBook, onReviseLast, onReviewAgain, onReset }: {
  session: DecoderSession;
  selected: string[];
  onBuildBook: () => void;
  onReviseLast: () => void;
  onReviewAgain: () => void;
  onReset: () => void;
}) {
  return (
    <AppFrame chapter="第三卷 · 验前尘" className="profile-frame">
      <ConfirmedSummary session={session} selected={selected} onBuildBook={onBuildBook} onReviewAgain={onReviewAgain} onReviseLast={onReviseLast} onReset={onReset} />
    </AppFrame>
  );
}

function BookView({ book, selectedCount, onReset }: { book: DestinyBook; selectedCount: number; onReset: () => void }) {
  return (
    <AppFrame chapter="第四卷 · 后运成书" className="book-frame">
      <main className="book">
        <header className="book__opening">
          <p className="kicker">命籍 · {book.seal.replace("命籍 ", "")}</p>
          <h1>{book.title}</h1>
          <p>{book.opening}</p>
          <span>{selectedCount ? `以 ${selectedCount} 条确认旧事为根` : "以八项排除边界与整套答卷为根"}</span>
        </header>

        <nav className="book__index" aria-label="命书章节">
          {book.chapters.map((chapter, index) => <a key={chapter.id} href={`#${chapter.id}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{chapter.title}</span></a>)}
        </nav>

        <section className="book__chapters">
          {book.chapters.map((chapter, index) => (
            <article key={chapter.id} id={chapter.id}>
              <header><b>{String(index + 1).padStart(2, "0")}</b><span>{chapter.horizon}</span></header>
              <h2>{chapter.title}</h2>
              <blockquote>{chapter.verse}</blockquote>
              <p>{chapter.interpretation}</p>
              <div className="chapter-signs"><strong>行至此处，可留意三象</strong>{chapter.triggers.map((trigger) => <span key={trigger}>{trigger}</span>)}</div>
              <small>此章依据：{chapter.evidenceEventIds.map((id) => EVENT_BY_ID[id]?.label).filter(Boolean).join(" · ") || "本轮无直接旧事证据"}</small>
            </article>
          ))}
        </section>

        <section className="book__closing">
          <p>{book.closing}</p>
          <button className="solid-action" onClick={onReset}>另起一卷<span>清除本机进度</span></button>
        </section>
      </main>
    </AppFrame>
  );
}

function rewindSession(session: DecoderSession) {
  let replay = createSession(session.intake, session.createdAt);
  for (const record of session.answers.slice(0, -1)) replay = answerCurrentQuestion(replay, record.answer, record.answeredAt);
  return { ...replay, completedAt: null };
}

function rewindToVerification(session: DecoderSession) {
  let replay = createSession(session.intake, session.createdAt);
  for (const record of session.answers.slice(0, BASELINE_TURNS)) replay = answerCurrentQuestion(replay, record.answer, record.answeredAt);
  return { ...replay, completedAt: null };
}

export function Experience() {
  const [view, setView] = useState<View>("landing");
  const [intake, setIntake] = useState<Intake>(emptyIntake);
  const [session, setSession] = useState<DecoderSession | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [book, setBook] = useState<DestinyBook | null>(null);

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { view: View; intake: Intake; session: DecoderSession | null; selected: string[]; book: DestinyBook | null };
      setView(parsed.view);
      setIntake(parsed.intake);
      setSession(parsed.session);
      setSelected(parsed.selected ?? []);
      setBook(parsed.book ?? null);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (view === "landing") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ view, intake, session, selected, book }));
  }, [view, intake, session, selected, book]);

  const start = () => {
    setSession(createSession(intake));
    setSelected([]);
    setBook(null);
    setView("reading");
  };

  const answer = (value: Answer) => {
    if (!session) return;
    const currentQuestion = session.currentQuestionId ? QUESTION_BY_ID[session.currentQuestionId] : null;
    const next = answerCurrentQuestion(session, value);
    setSession(next);
    if (currentQuestion?.id.startsWith("targeted-") && currentQuestion.eventIds.length === 1) {
      const eventId = currentQuestion.eventIds[0];
      setSelected((current) => value === "yes"
        ? current.includes(eventId) ? current : [...current, eventId]
        : value === "no" ? current.filter((id) => id !== eventId) : current
      );
    }
    if (next.completedAt) {
      setView("profile");
    }
  };

  const undo = () => {
    if (!session || session.answers.length === 0) return;
    const replay = rewindSession(session);
    setSession(replay);
    setSelected(confirmedTargetedEvents(replay));
  };

  const reviseLast = () => {
    if (!session) return;
    const replay = rewindSession(session);
    setSession(replay);
    setSelected(confirmedTargetedEvents(replay));
    setView("reading");
  };

  const reviewVerification = () => {
    if (!session) return;
    const replay = rewindToVerification(session);
    setSession(replay);
    setSelected([]);
    setView("reading");
  };

  const buildBook = () => {
    if (!session) return;
    setBook(buildDestinyBook(session, selected));
    setView("book");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const reset = () => {
    setView("landing");
    setIntake(emptyIntake);
    setSession(null);
    setSelected([]);
    setBook(null);
    window.localStorage.removeItem(STORAGE_KEY);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (view === "landing") return <Landing onBegin={() => setView("intake")} />;
  if (view === "intake") return <IntakeView value={intake} onChange={setIntake} onStart={start} onBack={() => setView("landing")} />;
  if (view === "reading" && session) return <ReadingView session={session} onAnswer={answer} onUndo={undo} onReset={reset} />;
  if (view === "profile" && session) return <ProfileView session={session} selected={selected} onBuildBook={buildBook} onReviseLast={reviseLast} onReviewAgain={reviewVerification} onReset={reset} />;
  if (view === "book" && book) return <BookView book={book} selectedCount={selected.length} onReset={reset} />;
  return <Landing onBegin={() => setView("intake")} />;
}
