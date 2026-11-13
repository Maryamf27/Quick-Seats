"use client";

import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
  showPasswordToggle?: boolean;
}

export function Input({
  id,
  label,
  hint,
  error,
  showPasswordToggle = true,
  className,
  type,
  ...inputProps
}: InputProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={inputId}>
        {label}
      </label>
      {type === "password" && showPasswordToggle ? (
        <div className="ui-input-control">
          <input
            {...inputProps}
            id={inputId}
            type={passwordVisible ? "text" : "password"}
            className={["ui-input", "ui-input--password", className].filter(Boolean).join(" ")}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
          />
          <button
            className="ui-input__visibility"
            type="button"
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            title={passwordVisible ? "Hide password" : "Show password"}
            onClick={() => setPasswordVisible((visible) => !visible)}
            disabled={inputProps.disabled}
          >
            {passwordVisible ? (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 8.7 4.6 9.5 6-.3.6-1.2 1.8-2.5 2.9M6.2 6.3C4.1 7.7 2.8 9.7 2.5 11c.8 1.4 4.3 6 9.5 6 1 0 1.9-.2 2.8-.5" />
              </svg>
            ) : (
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                <circle cx="12" cy="12" r="2.5" />
              </svg>
            )}
          </button>
        </div>
      ) : (
        <input
          {...inputProps}
          id={inputId}
          type={type}
          className={["ui-input", className].filter(Boolean).join(" ")}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
      )}
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="ui-field__error" id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
