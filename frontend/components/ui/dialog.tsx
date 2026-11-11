"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
}: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = description ? `${generatedId}-description` : undefined;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="ui-dialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="ui-dialog__inner">
        <div className="ui-dialog__header">
          <div>
            <h2 className="ui-dialog__title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="ui-dialog__description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            className="ui-icon-button"
            type="button"
            aria-label="Close dialog"
            onClick={() => dialogRef.current?.close()}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
