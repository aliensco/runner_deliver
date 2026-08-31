import type { ButtonHTMLAttributes, FormEvent, ReactNode } from "react";
import { AlertCircle, Check, ChevronRight, LoaderCircle, X } from "lucide-react";
import { statusLabel } from "../lib/format";
import type { OrderStatus } from "../lib/types";

export function Button({
  children,
  kind = "primary",
  size = "md",
  loading = false,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  return (
    <button
      {...props}
      className={`button button-${kind} button-${size} ${className}`}
      disabled={loading || props.disabled}
    >
      {loading ? <LoaderCircle className="spin" size={17} /> : null}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = "neutral",
  dot = false
}: {
  children: ReactNode;
  tone?: string;
  dot?: boolean;
}) {
  return (
    <span className={`badge badge-${tone}`}>
      {dot ? <span className="badge-dot" /> : null}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge tone={status} dot>
      {statusLabel[status]}
    </Badge>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  className = "",
  children
}: {
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`panel ${className}`}>
      {title || action ? (
        <div className="panel-heading">
          <div>
            {title ? <h2>{title}</h2> : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function LoadingState({ label = "正在加载数据" }: { label?: string }) {
  return (
    <div className="state-block">
      <LoaderCircle className="spin" />
      <strong>{label}</strong>
      <span>请稍候</span>
    </div>
  );
}

export function EmptyState({
  title = "暂无数据",
  description = "当前筛选条件下没有记录",
  action
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="state-block state-empty">
      <span className="empty-orbit"><Check size={20} /></span>
      <strong>{title}</strong>
      <span>{description}</span>
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-block state-error">
      <AlertCircle />
      <strong>数据加载失败</strong>
      <span>{message}</span>
      {retry ? <Button kind="secondary" onClick={retry}>重新加载</Button> : null}
    </div>
  );
}

export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  wide = false
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭">
            <X size={20} />
          </button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}

export function Field({
  label,
  hint,
  required,
  children,
  full = false
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <label className={`field ${full ? "field-full" : ""}`}>
      <span className="field-label">{label}{required ? <em>*</em> : null}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function FormActions({
  onCancel,
  submitLabel = "保存",
  loading = false,
  danger = false
}: {
  onCancel: () => void;
  submitLabel?: string;
  loading?: boolean;
  danger?: boolean;
}) {
  return (
    <div className="form-actions">
      <Button type="button" kind="ghost" onClick={onCancel}>取消</Button>
      <Button type="submit" kind={danger ? "danger" : "primary"} loading={loading}>
        {submitLabel}
      </Button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "确认",
  loading,
  danger = false,
  onConfirm,
  onClose
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose}>
      <div className="confirm-mark"><AlertCircle size={24} /></div>
      <div className="form-actions">
        <Button kind="ghost" onClick={onClose}>返回</Button>
        <Button kind={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}

export function RowLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="row-link" onClick={onClick}>
      {children}
      <ChevronRight size={17} />
    </button>
  );
}

export function submit<T extends HTMLFormElement>(handler: () => void) {
  return (event: FormEvent<T>) => {
    event.preventDefault();
    handler();
  };
}
