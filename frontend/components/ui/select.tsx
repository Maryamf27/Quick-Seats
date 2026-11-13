"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  id?: string;
  name?: string;
  "aria-label"?: string;
  className?: string;
}

interface PopoverPosition {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "below" | "above";
}

const GAP = 6;
const VIEWPORT_MARGIN = 8;


export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  disabled,
  required,
  id,
  name,
  className,
  "aria-label": ariaLabel,
}: SelectProps) {
  const generatedId = useId();
  const listId = `${generatedId}-list`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(rect.width, 160), viewportWidth - VIEWPORT_MARGIN * 2);
    const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), viewportWidth - width - VIEWPORT_MARGIN);
    const spaceBelow = viewportHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
    const spaceAbove = rect.top - GAP - VIEWPORT_MARGIN;
    const placeAbove = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(280, placeAbove ? spaceAbove : spaceBelow));
    setPosition({
      top: placeAbove ? rect.top - GAP : rect.bottom + GAP,
      left,
      width,
      maxHeight,
      placement: placeAbove ? "above" : "below",
    });
  }, []);

  useLayoutEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleScroll(event: Event) {
      if (listRef.current?.contains(event.target as Node)) return;
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
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, position]);

  function openList() {
    if (disabled) return;
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : nextEnabled(-1, 1));
    setOpen(true);
  }

  function nextEnabled(from: number, step: 1 | -1): number {
    for (let index = from + step; index >= 0 && index < options.length; index += step) {
      if (!options[index].disabled) return index;
    }
    return from;
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openList();
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActiveIndex((index) => nextEnabled(index, 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        setActiveIndex((index) => nextEnabled(index, -1));
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(nextEnabled(-1, 1));
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(nextEnabled(options.length, -1));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        choose(activeIndex);
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        break;
      case "Tab":
        setOpen(false);
        break;
      default:
        if (event.key.length === 1) {
          const char = event.key.toLowerCase();
          const start = activeIndex + 1;
          const ordered = [...options.keys()].map((_, i) => (start + i) % options.length);
          const match = ordered.find((i) => !options[i].disabled && options[i].label.toLowerCase().startsWith(char));
          if (match !== undefined) setActiveIndex(match);
        }
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className={["ui-select", open ? "ui-select--open" : "", className].filter(Boolean).join(" ")}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={handleKeyDown}
      >
        <span className={selected ? "ui-select__value" : "ui-select__value ui-select__value--placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className="ui-select__chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      {open && position
        ? createPortal(
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              aria-label={ariaLabel}
              className="ui-select__list"
              style={{
                top: position.placement === "below" ? position.top : undefined,
                bottom: position.placement === "above" ? window.innerHeight - position.top : undefined,
                left: position.left,
                width: position.width,
                maxHeight: position.maxHeight,
              }}
            >
              {options.map((option, index) => (
                <li
                  key={option.value || `empty-${index}`}
                  role="option"
                  data-index={index}
                  aria-selected={option.value === value}
                  aria-disabled={option.disabled || undefined}
                  className={[
                    "ui-select__option",
                    option.value === value ? "ui-select__option--selected" : "",
                    index === activeIndex ? "ui-select__option--active" : "",
                    option.disabled ? "ui-select__option--disabled" : "",
                  ].filter(Boolean).join(" ")}
                  onPointerEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => choose(index)}
                >
                  <span>{option.label}</span>
                  {option.value === value ? (
                    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none">
                      <path d="m3.5 8.5 3 3 6-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </li>
              ))}
            </ul>,
            document.body,
          )
        : null}
    </>
  );
}
