"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type NoticeKind = "ok" | "err";

interface NoticeApi {
  notify: (kind: NoticeKind, text: string) => void;
}

const Ctx = createContext<NoticeApi>({ notify: () => {} });

export function useNotify() {
  return useContext(Ctx).notify;
}

/** Mensagem temporária (sucesso/erro) partilhada por todas as secções do back-office. */
export function NoticeProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<{ kind: NoticeKind; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((kind: NoticeKind, text: string) => {
    setMessage({ kind, text });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(null), kind === "err" ? 7000 : 4000);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <Ctx.Provider value={value}>
      {message && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-sm ${message.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}
        >
          {message.text}
        </div>
      )}
      {children}
    </Ctx.Provider>
  );
}
