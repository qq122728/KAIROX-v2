"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  requireText?: string;
  tone?: "danger" | "warning";
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
};

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  cancelLabel = "取消",
  requireText,
  tone = "danger",
  busy = false,
  children,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    if (open) setTypedText("");
  }, [open]);

  if (!open) return null;

  const canConfirm = !requireText || typedText === requireText;

  return (
    <div className="admin-confirm-layer" role="presentation">
      <button
        aria-label="关闭确认弹窗"
        className="admin-confirm-backdrop"
        onClick={onClose}
        type="button"
      />
      <section aria-modal="true" className={`admin-confirm-dialog is-${tone}`} role="dialog">
        <div className="admin-confirm-icon">
          <AlertTriangle aria-hidden="true" size={20} strokeWidth={2.2} />
        </div>
        <div className="admin-confirm-content">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
          {children}
          {requireText ? (
            <label className="admin-confirm-input">
              <span>
                输入 <strong>{requireText}</strong> 以继续
              </span>
              <input
                autoComplete="off"
                onChange={(event) => setTypedText(event.target.value)}
                value={typedText}
              />
            </label>
          ) : null}
        </div>
        <footer className="admin-confirm-actions">
          <button className="admin-button admin-button-ghost" onClick={onClose} type="button">
            {cancelLabel}
          </button>
          <button
            className="admin-button admin-button-danger"
            disabled={!canConfirm || busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "处理中" : confirmLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

export default ConfirmDialog;
