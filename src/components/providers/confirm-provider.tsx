"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ConfirmDialog,
  type ConfirmAction,
} from "@/components/ui/confirm-dialog";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
};

export type ConfirmChoiceOptions = {
  title: string;
  description?: string;
  cancelLabel?: string;
  actions: ConfirmAction[];
};

type ConfirmContextValue = {
  /** Classic yes/no. Returns true if confirmed. */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  /** Multi-action chooser. Returns action id or null if cancelled. */
  confirmChoice: (opts: ConfirmChoiceOptions) => Promise<string | null>;
};

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type Pending =
  | {
      mode: "yesno";
      opts: ConfirmOptions;
      resolve: (v: boolean) => void;
    }
  | {
      mode: "choice";
      opts: ConfirmChoiceOptions;
      resolve: (v: string | null) => void;
    };

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  pendingRef.current = pending;

  const close = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    if (p.mode === "yesno") p.resolve(false);
    else p.resolve(null);
    setPending(null);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ mode: "yesno", opts, resolve });
    });
  }, []);

  const confirmChoice = useCallback((opts: ConfirmChoiceOptions) => {
    return new Promise<string | null>((resolve) => {
      setPending({ mode: "choice", opts, resolve });
    });
  }, []);

  const value = useMemo(
    () => ({ confirm, confirmChoice }),
    [confirm, confirmChoice]
  );

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={!!pending}
        title={pending?.opts.title || ""}
        description={pending?.opts.description}
        cancelLabel={
          pending?.opts.cancelLabel ||
          (pending?.mode === "yesno"
            ? pending.opts.cancelLabel
            : undefined) ||
          "Cancel"
        }
        confirmLabel={
          pending?.mode === "yesno" ? pending.opts.confirmLabel : undefined
        }
        danger={pending?.mode === "yesno" ? pending.opts.danger : false}
        actions={pending?.mode === "choice" ? pending.opts.actions : undefined}
        onCancel={close}
        onConfirm={() => {
          if (pending?.mode === "yesno") {
            pending.resolve(true);
            setPending(null);
          }
        }}
        onAction={(id) => {
          if (pending?.mode === "choice") {
            pending.resolve(id);
            setPending(null);
          }
        }}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}
