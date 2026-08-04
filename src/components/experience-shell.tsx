"use client";

import { useEffect, useRef, useState } from "react";

import { SHICHEN, shichenLabel } from "@/lib/tieban-v3-ritual";
import type { Gender } from "@/lib/types";
import type { TiebanIntake } from "@/lib/tieban-v3-types";

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
          <h1 className="tb-display-lines"><span>前尘有数，</span><em>刻分待明。</em></h1>
          <p className="tb-landing__verse tb-display-lines"><span>一珠动处分辰刻，</span><span>十二卷中见旧痕。</span></p>
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

export function IntakeView({ value, onChange, onStart, onBack, starting = false, startError = "" }: {
  value: TiebanIntake;
  onChange: (next: TiebanIntake) => void;
  onStart: () => void;
  onBack: () => void;
  starting?: boolean;
  startError?: string;
}) {
  const [error, setError] = useState("");
  const birth = dateParts(value.birthDate);
  const birthDays = Array.from({ length: daysInMonth(birth.year, birth.month) }, (_, index) => index + 1);
  const start = () => {
    if (starting) return;
    if (!validBirthDate(value.birthDate)) {
      setError("生辰未明，请先落下出生年月日。");
      return;
    }
    setError("");
    onStart();
  };

  return (
    <main className="tb-shell tb-intake">
      <header className="tb-topline"><button className="tb-text-button" onClick={onBack} disabled={starting}>卷首</button><Brand subdued /><span>起例</span></header>
      <section className="tb-intake__body">
        <div className="tb-section-mark"><b>壹</b><span>四柱起例</span></div>
        <div className="tb-intake__intro">
          <p className="tb-eyebrow">乾集 · 起例</p>
          <h1 className="tb-display-lines"><span>请定年月，</span><span>再择大概时辰。</span></h1>
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
          <div className="tb-gender-field"><span>命主</span><div>{([["male", "乾"], ["female", "坤"], ["unspecified", "不定"]] as Array<[Gender, string]>).map(([gender, label]) => <button key={gender} className={value.gender === gender ? "is-selected" : ""} onClick={() => onChange({ ...value, gender })}>{label}</button>)}</div></div>
        </div>
        <div className="tb-shichen-select"><span>约在何时</span><span className="tb-select-rule"><PaperSelect ariaLabel="约在何时" value={value.birthShichen} options={SHICHEN.map((label, index) => ({ value: index, label: `${label}时 · ${SHICHEN_RANGES[index]}` }))} onChange={(birthShichen) => onChange({ ...value, birthShichen })} placement="up" /><i aria-hidden="true">择</i></span></div>
        {error || startError ? <p className="tb-form-error" role="alert">{error || startError}</p> : null}
        <button className="tb-primary-action" onClick={start} disabled={starting} aria-busy={starting}><span>{starting ? "起数中" : "起数"}</span></button>
      </section>
      <footer className="tb-footer"><span>一命一卷</span><span>{shichenLabel(value.birthShichen)}</span></footer>
    </main>
  );
}

export function AnswerKey({ tone, label, note, onClick }: { tone: "yes" | "no"; label: string; note?: string; onClick: () => void }) {
  return <button className={`tb-answer-key tb-answer-key--${tone}`} onClick={onClick}><b>{label}</b>{note ? <small>{note}</small> : null}</button>;
}
