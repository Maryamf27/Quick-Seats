"use client";

import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export interface ConfirmationOptions {
  title: string;
  description: string;
  confirmLabel: string;
}

export function useConfirmDialog(): {
  confirm: (options: ConfirmationOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [request, setRequest] = useState<ConfirmationOptions | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const finish = useCallback((confirmed: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setRequest(null);
    resolve?.(confirmed);
  }, []);

  const confirm = useCallback((options: ConfirmationOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setRequest(options);
    });
  }, []);

  return {
    confirm,
    dialog: request ? (
      <Dialog
        open
        role="alertdialog"
        onClose={() => finish(false)}
        title={request.title}
        description={request.description}
      >
        <div className="ui-confirm-dialog__actions">
          <Button variant="secondary" onClick={() => finish(false)}>
            Keep it
          </Button>
          <Button variant="destructive" onClick={() => finish(true)}>
            {request.confirmLabel}
          </Button>
        </div>
      </Dialog>
    ) : null,
  };
}
