"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ConfirmAction = {
  id: string;
  label: string;
  /** destructive = red/danger emphasis */
  variant?: "primary" | "secondary" | "danger" | "ghost";
};

export type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  /** Primary confirm (single-action mode). Ignored if `actions` is set. */
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Multi-choice actions (e.g. delete one vs all). Cancel is separate. */
  actions?: ConfirmAction[];
  loading?: boolean;
  onCancel: () => void;
  onConfirm?: () => void;
  onAction?: (actionId: string) => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger,
  actions,
  loading,
  onCancel,
  onConfirm,
  onAction,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="presentation"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={cancelLabel}
        onClick={onCancel}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          "relative z-[1] w-full max-w-md rounded-2xl border border-white/10",
          "bg-[var(--surface)] p-5 shadow-2xl outline-none",
          "ring-1 ring-white/5"
        )}
      >
        <h2 id={titleId} className="font-display text-lg text-[var(--fg)]">
          {title}
        </h2>
        {description ? (
          <p id={descId} className="mt-2 text-sm text-[var(--fg-muted)]">
            {description}
          </p>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          {actions && actions.length > 0
            ? actions.map((a) => (
                <Button
                  key={a.id}
                  type="button"
                  disabled={loading}
                  variant={
                    a.variant === "danger"
                      ? "secondary"
                      : a.variant === "ghost"
                        ? "ghost"
                        : a.variant === "secondary"
                          ? "secondary"
                          : "default"
                  }
                  className={
                    a.variant === "danger"
                      ? "border border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                      : undefined
                  }
                  onClick={() => onAction?.(a.id)}
                >
                  {a.label}
                </Button>
              ))
            : (
                <Button
                  type="button"
                  disabled={loading}
                  className={
                    danger
                      ? "border border-rose-400/40 bg-rose-500/15 text-rose-100 hover:bg-rose-500/25"
                      : undefined
                  }
                  onClick={onConfirm}
                >
                  {confirmLabel}
                </Button>
              )}
        </div>
      </div>
    </div>
  );
}
