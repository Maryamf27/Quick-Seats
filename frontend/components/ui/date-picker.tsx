"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { Select } from "@/components/ui/select";

export interface DatePickerProps {
  /** "YYYY-MM-DD", or "YYYY-MM-DDTHH:mm" when withTime is set. Empty string = no value. */
  value: string;
  onChange: (value: string) => void;
  /** "YYYY-MM-DD" bounds (inclusive). */
  min?: string;
  max?: string;
  withTime?: boolean;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  "aria-label"?: string;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseDate(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

function parseTime(value: string): { h: number; min: number } {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  return match ? { h: Number(match[1]), min: Number(match[2]) } : { h: 9, min: 0 };
}

function formatDisplay(value: string, withTime: boolean): string {
  const date = parseDate(value);
  if (!date) return "";
  const base = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date.y, date.m, date.d));
  if (!withTime) return base;
  const { h, min } = parseTime(value);
  return `${base}, ${pad(h)}:${pad(min)}`;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: pad(h) }));
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => ({ value: String(i * 5), label: pad(i * 5) }));


export function DatePicker({
  value,
  onChange,
  min,
  max,
  withTime = false,
  placeholder,
  disabled,
  required,
  id,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const generatedId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);

  const selected = parseDate(value);
  const today = new Date();
  const initial = selected ?? { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
  const [view, setView] = useState({ y: initial.y, m: initial.m });
  const [focusKey, setFocusKey] = useState<string>("");
  const time = parseTime(value);

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const margin = 8;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const left = Math.min(Math.max(rect.left, margin), window.innerWidth - width - margin);
    const below = window.innerHeight - rect.bottom - margin - 6;
    const above = rect.top - margin - 6;
    const placeAbove = below < 360 && above > below;
    const available = placeAbove ? above : below;
    setPos({
      left,
      width,
      maxHeight: Math.max(240, available),
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      // Clicks inside a portaled Select list (hour/minute) must not close the calendar.
      if ((target as HTMLElement).closest?.(".ui-select__list")) return;
      setOpen(false);
    }
    function handleScroll(event: Event) {
      if (panelRef.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement)?.closest?.(".ui-select__list")) return;
      reposition();
    }
    document.addEventListener("pointerdown", handlePointer);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointer);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (open && focusKey) panelRef.current?.querySelector<HTMLButtonElement>(`[data-day="${focusKey}"]`)?.focus();
  }, [open, focusKey, view]);

  function openPicker() {
    if (disabled) return;
    const base = parseDate(value) ?? { y: today.getFullYear(), m: today.getMonth(), d: today.getDate() };
    setView({ y: base.y, m: base.m });
    setFocusKey(toKey(base.y, base.m, base.d));
    setOpen(true);
  }

  const outOfRange = (key: string) => Boolean((min && key < min) || (max && key > max));

  function emit(key: string, h = time.h, minute = time.min) {
    onChange(withTime ? `${key}T${pad(h)}:${pad(minute)}` : key);
  }

  function pickDay(key: string) {
    if (outOfRange(key)) return;
    emit(key);
    if (!withTime) {
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  function shiftMonth(delta: number) {
    setView((current) => {
      const date = new Date(current.y, current.m + delta, 1);
      return { y: date.getFullYear(), m: date.getMonth() };
    });
  }

  function moveFocus(key: string, days: number) {
    const parsed = parseDate(key);
    if (!parsed) return;
    const next = new Date(parsed.y, parsed.m, parsed.d + days);
    const nextKey = toKey(next.getFullYear(), next.getMonth(), next.getDate());
    setView({ y: next.getFullYear(), m: next.getMonth() });
    setFocusKey(nextKey);
  }

  function handleGridKey(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in deltas) {
      event.preventDefault();
      moveFocus(key, deltas[event.key]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  }

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(view.y, view.m, 1));
  const display = formatDisplay(value, withTime);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={["ui-select", "ui-datepicker__trigger", open ? "ui-select--open" : ""].filter(Boolean).join(" ")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        <span className={display ? "ui-select__value" : "ui-select__value ui-select__value--placeholder"}>
          {display || placeholder || (withTime ? "Pick date & time" : "Pick a date")}
        </span>
        <svg className="ui-select__chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M2 6.5h12M5.5 1.8v2.4M10.5 1.8v2.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && pos
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={ariaLabel ?? "Choose date"}
              id={`${generatedId}-panel`}
              className="ui-datepicker"
              style={{ top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            >
              <div className="ui-datepicker__header">
                <button type="button" className="ui-datepicker__nav" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
                <strong aria-live="polite">{monthLabel}</strong>
                <button type="button" className="ui-datepicker__nav" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
              </div>
              <div className="ui-datepicker__grid" role="grid">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="ui-datepicker__weekday" role="columnheader">{day}</span>
                ))}
                {cells.map((day, index) => {
                  if (day === null) return <span key={`blank-${index}`} />;
                  const key = toKey(view.y, view.m, day);
                  const isSelected = selected ? toKey(selected.y, selected.m, selected.d) === key : false;
                  return (
                    <button
                      key={key}
                      type="button"
                      data-day={key}
                      role="gridcell"
                      tabIndex={key === focusKey ? 0 : -1}
                      aria-selected={isSelected}
                      aria-current={key === todayKey ? "date" : undefined}
                      disabled={outOfRange(key)}
                      className={[
                        "ui-datepicker__day",
                        isSelected ? "ui-datepicker__day--selected" : "",
                        key === todayKey ? "ui-datepicker__day--today" : "",
                      ].filter(Boolean).join(" ")}
                      onClick={() => pickDay(key)}
                      onKeyDown={(event) => handleGridKey(event, key)}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              {withTime ? (
                <div className="ui-datepicker__time">
                  <span>Time</span>
                  <Select
                    aria-label="Hour"
                    value={String(time.h)}
                    options={HOUR_OPTIONS}
                    onChange={(h) => selected && emit(toKey(selected.y, selected.m, selected.d), Number(h), time.min)}
                    disabled={!selected}
                  />
                  <span aria-hidden="true">:</span>
                  <Select
                    aria-label="Minute"
                    value={String(Math.round(time.min / 5) * 5 % 60)}
                    options={MINUTE_OPTIONS}
                    onChange={(m) => selected && emit(toKey(selected.y, selected.m, selected.d), time.h, Number(m))}
                    disabled={!selected}
                  />
                </div>
              ) : null}
              <div className="ui-datepicker__footer">
                {!required && value ? (
                  <button type="button" className="ui-datepicker__link" onClick={() => { onChange(""); setOpen(false); }}>Clear</button>
                ) : <span />}
                {withTime ? (
                  <button type="button" className="ui-datepicker__done" onClick={() => { setOpen(false); triggerRef.current?.focus(); }}>Done</button>
                ) : (
                  <button
                    type="button"
                    className="ui-datepicker__link"
                    disabled={outOfRange(todayKey)}
                    onClick={() => pickDay(todayKey)}
                  >
                    Today
                  </button>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
