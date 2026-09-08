"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarDays, CheckCircle2, FileSpreadsheet, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import type { WeekRow } from "@lib/pt26/types";
import { api, fmtDate, fmtDateTime, type Reference } from "./api";
import { ImportWizard } from "./ImportWizard";
import { WeekEditor } from "./WeekEditor";
import { useNotify } from "./Notice";

interface WeekListItem extends WeekRow {
  quadros: number;
  warnings: number;
  unmatched: number;
  last_import_at: string | null;
}

export function WeeksTab({ reference }: { reference: Reference }) {
  const notify = useNotify();
  const [weeks, setWeeks] = useState<WeekListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ weeks: WeekListItem[] }>("/api/pt26/admin/weeks");
      setWeeks(r.weeks);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro a carregar semanas");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePublish(w: WeekListItem) {
    const publish = w.status !== "PUBLISHED";
    if (publish && w.warnings > 0 && !window.confirm(`Esta semana tem ${w.warnings} aviso(s) do import. Publicar mesmo assim?`)) return;
    setBusy(`pub-${w.id}`);
    try {
      await api(`/api/pt26/admin/weeks/${w.id}/publish`, { method: "PATCH", body: JSON.stringify({ published: publish }) });
      notify("ok", publish ? `${w.label} publicada — já aparece ao pivot.` : `${w.label} despublicada.`);
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function remove(w: WeekListItem) {
    if (!window.confirm(`Apagar «${w.label}» (${fmtDate(w.date)}) com todos os quadros e resultados? Esta ação é irreversível.`)) return;
    setBusy(`del-${w.id}`);
    try {
      await api(`/api/pt26/admin/weeks/${w.id}?confirm=1`, { method: "DELETE" });
      if (editingId === w.id) setEditingId(null);
      notify("ok", "Semana apagada.");
      await load();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  const published = weeks.filter((w) => w.status === "PUBLISHED").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <div className="flex items-center gap-2 text-slate-400"><CalendarDays size={16} /><span className="text-xs font-medium uppercase tracking-wider">Semanas</span></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{weeks.length}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400"><CheckCircle2 size={16} /><span className="text-xs font-medium uppercase tracking-wider">Publicadas</span></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{published}</p>
        </Card>
        <Card>
          <div className="flex items-center gap-2 text-slate-400"><FileSpreadsheet size={16} /><span className="text-xs font-medium uppercase tracking-wider">Rascunhos</span></div>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{weeks.length - published}</p>
        </Card>
      </div>

      {importing && (
        <ImportWizard
          reference={reference}
          weeks={weeks}
          onCancel={() => setImporting(false)}
          onDone={(week) => {
            setImporting(false);
            setEditingId(week.id);
            void load();
          }}
        />
      )}

      {editingId && <WeekEditor reference={reference} weekId={editingId} onClose={() => setEditingId(null)} onSaved={load} />}

      <Card padding="none">
        <div className="flex flex-wrap items-center justify-between gap-2 px-6 pt-5">
          <CardHeader className="!mb-0">
            <CardTitle>Semanas</CardTitle>
          </CardHeader>
          <div className="mb-4 flex gap-2">
            <a href="/api/pt26/admin/import/template" className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileSpreadsheet size={14} /> Template Excel
            </a>
            <Button size="sm" onClick={() => setImporting(true)} disabled={importing}>
              <Plus size={14} /> Importar Excel
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-medium">Semana</th>
                <th className="px-6 py-3 font-medium">Estado</th>
                <th className="px-6 py-3 font-medium">Ficheiro</th>
                <th className="px-6 py-3 font-medium">Import</th>
                <th className="px-6 py-3 font-medium">Avisos</th>
                <th className="px-6 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {weeks.map((w) => (
                <tr key={w.id} className={`hover:bg-slate-50/60 ${editingId === w.id ? "bg-brand-50/40" : ""}`}>
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-900">{w.label}</p>
                    <p className="text-xs text-slate-500">{fmtDate(w.date)} · {w.quadros} quadros</p>
                  </td>
                  <td className="px-6 py-3">
                    <Badge tone={w.status === "PUBLISHED" ? "success" : "neutral"}>{w.status === "PUBLISHED" ? "Publicada" : "Rascunho"}</Badge>
                  </td>
                  <td className="max-w-[220px] truncate px-6 py-3 text-slate-600" title={w.source_file_name ?? ""}>{w.source_file_name ?? "—"}</td>
                  <td className="px-6 py-3 text-slate-500">{fmtDateTime(w.imported_at ?? w.last_import_at)}</td>
                  <td className="px-6 py-3">
                    {w.warnings > 0 ? (
                      <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={14} /> {w.warnings}{w.unmatched ? ` · ${w.unmatched} sem match` : ""}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="inline-flex flex-wrap justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(editingId === w.id ? null : w.id)}>
                        <Pencil size={14} /> Valores
                      </Button>
                      <Button variant={w.status === "PUBLISHED" ? "outline" : "primary"} size="sm" onClick={() => togglePublish(w)} disabled={busy === `pub-${w.id}` || w.quadros === 0}>
                        {w.status === "PUBLISHED" ? "Despublicar" : "Publicar"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => remove(w)} disabled={busy === `del-${w.id}`} aria-label="Apagar">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && weeks.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-10 text-center text-slate-400">
                    Ainda não há semanas. Importa o primeiro Excel (ou descarrega o template para o preencher).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-6 py-4 text-xs leading-relaxed text-slate-500">
          <p className="font-semibold text-slate-700">Fluxo semanal</p>
          <ol className="mt-1 list-decimal space-y-0.5 pl-4">
            <li><b>Importar Excel</b> — escolhe a data, carrega o ficheiro e revê a pré-visualização (erros bloqueiam; avisos não).</li>
            <li><b>Valores</b> — corrige à mão se preciso (itens, ordem, títulos dos quadros). Reimportar substitui tudo e volta a rascunho.</li>
            <li><b>Publicar</b> — só semanas publicadas aparecem ao pivot; valida antes em «Pré-visualização».</li>
          </ol>
        </div>
      </Card>
    </div>
  );
}
