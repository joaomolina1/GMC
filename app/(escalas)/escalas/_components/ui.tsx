"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@lib/utils";
import { Button } from "@/_design_system/Button";

export { Button };

export const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-slate-50";
export const inputSm =
  "rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 disabled:bg-slate-50";

export function Card({
  title,
  sub,
  actions,
  children,
  className,
  bodyClass,
  toolbar,
}: {
  title?: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  bodyClass?: string;
  toolbar?: React.ReactNode;
}) {
  return (
    <section className={cn("mb-5 overflow-hidden rounded-2xl border border-line bg-surface shadow-card", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[15px] font-semibold text-slate-900">{title}</h2>}
            {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-line bg-slate-50 px-5 py-3">{toolbar}</div>}
      {children !== undefined && <div className={cn(bodyClass ?? "px-5 py-4")}>{children}</div>}
    </section>
  );
}

type Kind = "ok" | "warn" | "bad" | "info" | "brand" | undefined;
const noteCls: Record<string, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-800",
  bad: "border-red-200 bg-red-50 text-red-800",
  info: "border-line bg-slate-50 text-slate-600",
  brand: "border-brand-100 bg-brand-50 text-brand-700",
};
const noteIcon = { ok: CheckCircle2, warn: AlertTriangle, bad: XCircle, info: Info, brand: Info };

export function Note({ kind = "info", children, className, icon = true }: { kind?: Kind; children: React.ReactNode; className?: string; icon?: boolean }) {
  const I = noteIcon[kind ?? "info"];
  return (
    <div className={cn("mb-2 flex gap-2.5 rounded-xl border px-3.5 py-2.5 text-sm", noteCls[kind ?? "info"], className)}>
      {icon && <I size={16} className="mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const tagCls: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  warn: "bg-amber-50 text-amber-700 ring-amber-200",
  bad: "bg-red-50 text-red-700 ring-red-200",
  info: "bg-slate-50 text-slate-600 ring-slate-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
};
export function Tag({ kind = "info", children, className }: { kind?: Kind; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", tagCls[kind ?? "info"], className)}>
      {children}
    </span>
  );
}

export function Kpi({ label, value, sub, frac }: { label: string; value: React.ReactNode; sub?: React.ReactNode; frac?: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3.5 shadow-card">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      {frac !== undefined && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={cn("h-full rounded-full", frac >= 1 ? "bg-emerald-500" : frac >= 0.8 ? "bg-amber-500" : "bg-red-500")}
            style={{ width: `${Math.max(0, Math.min(1, frac)) * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

export function Kpis({ children }: { children: React.ReactNode }) {
  return <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>;
}

export function Field({ label, children, hint, className }: { label: string; children: React.ReactNode; hint?: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

export function Check({ label, checked, onChange, disabled }: { label: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm transition-colors",
        checked ? "border-brand-200 bg-brand-50 text-brand-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input type="checkbox" className="accent-brand-500" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function SecHead({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0">{children}</div>;
}

const avCls = [
  "bg-brand-100 text-brand-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-800",
];
export const initials = (n: string) =>
  String(n || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
export function Av({ nome, idx = 0, children }: { nome?: string; idx?: number; children?: React.ReactNode }) {
  return (
    <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold", avCls[idx % avCls.length])}>
      {children ?? initials(nome ?? "")}
    </div>
  );
}

export function Loading({ texto = "A carregar…" }: { texto?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-sm text-slate-500">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-200 border-t-brand-500" />
      {texto}
    </div>
  );
}

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full border-collapse text-sm [&_td]:border-b [&_td]:border-line [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top [&_th]:border-b [&_th]:border-line [&_th]:bg-slate-50 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500 [&_tr:last-child_td]:border-b-0", className)}>
        {children}
      </table>
    </div>
  );
}

// ---------------------------------------------------------------- sobreposições
function Overlay({ onClose, children, side }: { onClose: () => void; children: React.ReactNode; side?: boolean }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setEl(document.body);
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  if (!el) return null;
  return createPortal(
    <div className={cn("fixed inset-0 z-[70] flex bg-slate-950/40", side ? "justify-end" : "items-end justify-center sm:items-center sm:p-4")} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      {children}
    </div>,
    el
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  open: boolean;
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose}>
      <div className={cn("flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl", wide ? "sm:max-w-4xl" : "sm:max-w-xl")} role="dialog" aria-modal>
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <h3 className="flex-1 text-base font-semibold text-slate-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-slate-50 px-5 py-3">{footer}</div>}
      </div>
    </Overlay>
  );
}

export function Drawer({ open, title, sub, onClose, children }: { open: boolean; title: React.ReactNode; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <Overlay onClose={onClose} side>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl animate-fade-in">
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="flex-1">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            {sub && <div className="text-xs text-slate-500">{sub}</div>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </Overlay>
  );
}

// ---------------------------------------------------------------- toasts e diálogos
type Toast = { id: number; msg: string; kind: "ok" | "bad" | "info" };
interface Dialogo {
  toast: (msg: string, kind?: Toast["kind"]) => void;
  confirmar: (o: { titulo: string; texto: React.ReactNode; ok?: string; perigo?: boolean }) => Promise<boolean>;
  pedirTexto: (o: { titulo: string; texto?: React.ReactNode; label: string; placeholder?: string; ok?: string; obrigatorio?: boolean }) => Promise<string | null>;
}
const DialogoCtx = createContext<Dialogo | null>(null);
export function useDialogo() {
  const d = useContext(DialogoCtx);
  if (!d) throw new Error("useDialogo fora do DialogoProvider");
  return d;
}

type Pedido =
  | { tipo: "confirmar"; titulo: string; texto: React.ReactNode; ok?: string; perigo?: boolean; resolve: (v: boolean) => void }
  | { tipo: "texto"; titulo: string; texto?: React.ReactNode; label: string; placeholder?: string; ok?: string; obrigatorio?: boolean; resolve: (v: string | null) => void };

export function DialogoProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState(false);
  const seq = useRef(0);

  const toast = useCallback((msg: string, kind: Toast["kind"] = "info") => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "bad" ? 7000 : 3500);
  }, []);
  const confirmar = useCallback<Dialogo["confirmar"]>((o) => new Promise((resolve) => setPedido({ tipo: "confirmar", ...o, resolve })), []);
  const pedirTexto = useCallback<Dialogo["pedirTexto"]>(
    (o) =>
      new Promise((resolve) => {
        setValor("");
        setErro(false);
        setPedido({ tipo: "texto", ...o, resolve });
      }),
    []
  );

  const fechar = () => {
    if (!pedido) return;
    if (pedido.tipo === "confirmar") pedido.resolve(false);
    else pedido.resolve(null);
    setPedido(null);
  };
  const aceitar = () => {
    if (!pedido) return;
    if (pedido.tipo === "confirmar") pedido.resolve(true);
    else {
      if (pedido.obrigatorio !== false && !valor.trim()) return setErro(true);
      pedido.resolve(valor.trim());
    }
    setPedido(null);
  };

  return (
    <DialogoCtx.Provider value={{ toast, confirmar, pedirTexto }}>
      {children}
      <Modal
        open={!!pedido}
        title={pedido?.titulo}
        onClose={fechar}
        footer={
          <>
            <Button variant="outline" size="sm" onClick={fechar}>
              Cancelar
            </Button>
            <Button size="sm" variant={pedido?.tipo === "confirmar" && pedido.perigo ? "danger" : "primary"} onClick={aceitar}>
              {pedido?.ok ?? "Confirmar"}
            </Button>
          </>
        }
      >
        {pedido?.texto && <div className="mb-3 text-sm text-slate-700">{pedido.texto}</div>}
        {pedido?.tipo === "texto" && (
          <Field label={pedido.label}>
            <textarea
              autoFocus
              rows={3}
              className={cn(inputCls, erro && "border-red-400")}
              placeholder={pedido.placeholder}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value);
                setErro(false);
              }}
            />
          </Field>
        )}
      </Modal>
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[90] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cn(
              "pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-rise",
              t.kind === "ok" ? "bg-emerald-600 text-white" : t.kind === "bad" ? "bg-red-600 text-white" : "bg-slate-900 text-white"
            )}
          >
            {t.msg}
          </div>
        ))}
      </div>
    </DialogoCtx.Provider>
  );
}
