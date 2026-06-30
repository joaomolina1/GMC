"use client";

import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { cn } from "@lib/utils";
import { Button } from "@/_design_system/Button";

interface SystemPromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

const textareaClass =
  "w-full resize-none rounded-xl border border-slate-200 bg-white px-3.5 py-3 font-mono text-sm leading-relaxed text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10";

export function SystemPromptEditor({ value, onChange, className }: SystemPromptEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const modalRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (expanded) {
      modalRef.current?.focus();
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [expanded]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && expanded) setExpanded(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  return (
    <>
      <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-slate-700">System prompt</label>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="Abrir em ecrã grande"
          >
            <Maximize2 size={14} />
            Expandir
          </button>
        </div>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(textareaClass, "min-h-0 flex-1")}
          placeholder="Instruções do agente..."
        />
        <p className="mt-1.5 shrink-0 text-[11px] text-slate-400">
          {value.length.toLocaleString("pt-PT")} caracteres
        </p>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-8">
          <div className="flex h-full max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">System prompt</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Edite as instruções do agente em ecrã completo
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-5">
              <textarea
                ref={modalRef}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className={cn(textareaClass, "min-h-0 flex-1 text-base")}
                placeholder="Instruções do agente..."
              />
              <p className="mt-2 text-xs text-slate-400">
                {value.length.toLocaleString("pt-PT")} caracteres · Esc para fechar
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
              <Button variant="outline" onClick={() => setExpanded(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
