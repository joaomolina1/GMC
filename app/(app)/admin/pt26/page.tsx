"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BarChart3, CalendarDays, ExternalLink, Eye, Flag, HelpCircle, RefreshCw, Settings, Users } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { api, type Reference } from "./_components/api";
import { NoticeProvider, useNotify } from "./_components/Notice";
import { WeeksTab } from "./_components/WeeksTab";
import { PeopleTab } from "./_components/PeopleTab";
import { PartiesTab } from "./_components/PartiesTab";
import { QuestionsTab } from "./_components/QuestionsTab";
import { SettingsTab } from "./_components/SettingsTab";

type Tab = "weeks" | "people" | "parties" | "questions" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: "weeks", label: "Semanas", icon: CalendarDays },
  { id: "people", label: "Pessoas", icon: Users },
  { id: "parties", label: "Partidos", icon: Flag },
  { id: "questions", label: "Perguntas", icon: HelpCircle },
  { id: "settings", label: "Definições", icon: Settings },
];

export default function Pt26AdminPage() {
  return (
    <NoticeProvider>
      <Pt26Admin />
    </NoticeProvider>
  );
}

function Pt26Admin() {
  const notify = useNotify();
  const [tab, setTab] = useState<Tab>("weeks");
  const [ref, setRef] = useState<Reference | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<Reference>("/api/pt26/admin/reference");
      setRef(r);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro a carregar");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const liveHref = ref?.settings.live_token ? `/pt26/live?key=${encodeURIComponent(ref.settings.live_token)}` : "/pt26/live";

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-900">PT26 · Tracking poll</h2>
            <Badge tone="brand">Produção</Badge>
          </div>
          <p className="text-sm text-slate-500">
            Importar o Excel semanal, gerir fotografias e partidos, publicar a semana para o ecrã do pivot.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin" className="inline-flex h-10 items-center rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ‹ Backoffice
          </Link>
          <Link href="/pt26/live/preview" target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <Eye size={16} /> Pré-visualização (inclui rascunhos)
          </Link>
          <Link href={liveHref} target="_blank" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0a1a4c] px-4 text-sm font-medium text-white hover:bg-[#12307f]">
            <ExternalLink size={16} /> Ecrã do pivot
          </Link>
          <Button variant="outline" onClick={reload} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-white p-1 shadow-sm">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === id ? "bg-brand-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-2 px-3 text-xs text-slate-400 sm:flex">
          <BarChart3 size={14} /> 8 perguntas fixas · só semanas publicadas chegam ao pivot
        </span>
      </div>

      {!ref && loading && <p className="text-sm text-slate-400">A carregar…</p>}
      {ref && tab === "weeks" && <WeeksTab reference={ref} />}
      {ref && tab === "people" && <PeopleTab reference={ref} onChanged={reload} />}
      {ref && tab === "parties" && <PartiesTab reference={ref} onChanged={reload} />}
      {ref && tab === "questions" && <QuestionsTab reference={ref} onChanged={reload} />}
      {ref && tab === "settings" && <SettingsTab reference={ref} onChanged={reload} />}
    </div>
  );
}
