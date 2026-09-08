"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, XCircle } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Input } from "@/_design_system/Input";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import type { ImportReport, WeekRow } from "@lib/pt26/types";
import { formatNumberPt } from "@lib/pt26/format";
import { api, fmtDate, type Reference } from "./api";
import { useNotify } from "./Notice";

interface PreviewResponse {
  preview_id: string;
  expires_at: string;
  report: ImportReport;
}

/** Próxima segunda-feira depois da última semana (ou hoje). */
function suggestDate(weeks: WeekRow[]): string {
  const last = [...weeks].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  if (last) {
    const d = new Date(`${last.date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export function ImportWizard({
  reference,
  weeks,
  onDone,
  onCancel,
}: {
  reference: Reference;
  weeks: WeekRow[];
  onDone: (week: WeekRow) => void;
  onCancel: () => void;
}) {
  const notify = useNotify();
  const fileRef = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(() => suggestDate(weeks));
  const [label, setLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"preview" | "commit" | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);

  const existing = weeks.find((w) => w.date === date);
  const suggestedLabel = useMemo(() => {
    if (existing) return existing.label;
    const before = weeks.filter((w) => w.date < date).length;
    return `Semana ${before + 1}`;
  }, [weeks, date, existing]);

  useEffect(() => {
    setPreview(null);
  }, [date, file, label]);

  const peopleById = useMemo(() => new Map(reference.people.map((p) => [p.id, p])), [reference.people]);
  const partiesById = useMemo(() => new Map(reference.parties.map((p) => [p.id, p])), [reference.parties]);
  const questionByNumber = useMemo(() => new Map(reference.questions.map((q) => [q.number, q])), [reference.questions]);

  async function runPreview() {
    if (!file) return;
    setBusy("preview");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("date", date);
      if (label.trim()) form.append("label", label.trim());
      const r = await api<PreviewResponse>("/api/pt26/admin/import/preview", { method: "POST", body: form });
      setPreview(r);
      if (r.report.errors.length) notify("err", `${r.report.errors.length} erro(s) bloqueante(s) — corrige o ficheiro e volta a carregar.`);
      else notify("ok", `Pré-visualização pronta${r.report.warnings.length ? ` com ${r.report.warnings.length} aviso(s)` : ""}. Revê e confirma.`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro na pré-visualização");
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy("commit");
    try {
      const r = await api<{ week: WeekRow }>("/api/pt26/admin/import/commit", { method: "POST", body: JSON.stringify({ preview_id: preview.preview_id }) });
      notify("ok", `Semana ${fmtDate(r.week.date)} gravada em rascunho. Publica quando estiver validada.`);
      onDone(r.week);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro ao gravar");
    } finally {
      setBusy(null);
    }
  }

  const report = preview?.report;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Importar Excel semanal</CardTitle>
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancelar</Button>
      </CardHeader>

      <div className="grid gap-4 md:grid-cols-[180px_1fr_1fr]">
        <Input label="Data da semana" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        <Input label="Rótulo" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={suggestedLabel} hint={existing ? "Esta data já existe — será substituída" : `Sugestão: ${suggestedLabel}`} />
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-700">Ficheiro (.xlsx)</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <FileSpreadsheet size={16} /> {file ? "Trocar ficheiro" : "Escolher ficheiro"}
            </Button>
            <span className="truncate text-sm text-slate-600">{file ? `${file.name} · ${(file.size / 1024).toFixed(0)} KB` : "Nenhum ficheiro"}</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={runPreview} disabled={!file || !date || busy !== null}>
          <Upload size={16} /> {busy === "preview" ? "A ler…" : "Pré-visualizar"}
        </Button>
        <a href="/api/pt26/admin/import/template" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <FileSpreadsheet size={16} /> Descarregar template
        </a>
        <span className="text-xs text-slate-400">Sheets P1…P8 · colunas Quadro, Pessoa, Item, Valor, Titulo · a data vem deste formulário.</span>
      </div>

      {report && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={report.errors.length ? "danger" : "success"}>
              {report.errors.length ? <XCircle size={12} /> : <CheckCircle2 size={12} />}
              {report.errors.length ? `${report.errors.length} erro(s)` : "Sem erros"}
            </Badge>
            <Badge tone={report.warnings.length ? "warning" : "neutral"}>
              <AlertTriangle size={12} /> {report.warnings.length} aviso(s)
            </Badge>
            <Badge tone="neutral">{report.fileName}</Badge>
            <Badge tone="neutral">{report.weekLabel} · {fmtDate(report.weekDate)}</Badge>
            {report.weekExists && <Badge tone="warning">Substitui semana existente</Badge>}
          </div>

          {report.errors.length > 0 && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-semibold text-red-800">Erros bloqueantes</p>
              <ul className="space-y-1 text-sm text-red-700">
                {report.errors.map((e, i) => (
                  <li key={i}>
                    {e.sheet && <code className="mr-1 rounded bg-white/70 px-1 text-xs">{e.sheet}{e.row ? `:${e.row}` : ""}</code>}
                    {e.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.warnings.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-800">Avisos (não bloqueiam)</p>
              <ul className="space-y-1 text-sm text-amber-800">
                {report.warnings.map((w, i) => (
                  <li key={i}>
                    {w.sheet && <code className="mr-1 rounded bg-white/70 px-1 text-xs">{w.sheet}{w.row ? `:${w.row}` : ""}</code>}
                    {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {report.questions.map((q) => {
              const question = questionByNumber.get(q.number);
              return (
                <div key={q.number} className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <span className="grid h-6 w-6 place-items-center rounded-md bg-slate-100 text-xs">{q.number}</span>
                    {question?.title ?? `Pergunta ${q.number}`}
                    <Badge tone="neutral">{q.kind}</Badge>
                    {q.sheet && <span className="ml-auto text-xs font-normal text-slate-400">sheet {q.sheet}</span>}
                  </p>
                  {q.quadros.length === 0 && <p className="text-xs text-red-600">Sem dados.</p>}
                  {q.quadros.map((quadro) => (
                    <table key={quadro.idx} className="mb-2 w-full text-xs">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wider text-slate-400">
                          <th className="py-1 pr-2">
                            Q{quadro.idx}
                            {quadro.title ? ` · ${quadro.title}` : ""}
                            {quadro.personName ? ` · ${quadro.personName}${quadro.personId ? "" : " (sem match)"}` : ""}
                          </th>
                          <th className="py-1 pr-2 text-right">Valor</th>
                          <th className="py-1 text-right">Match</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quadro.items.map((it) => (
                          <tr key={it.row} className="border-t border-slate-100">
                            <td className="py-1 pr-2 text-slate-800">
                              {it.key}
                              {it.raw !== it.key && <span className="ml-1 text-slate-400">(«{it.raw}»)</span>}
                            </td>
                            <td className="py-1 pr-2 text-right font-medium tabular-nums text-slate-900">{formatNumberPt(it.value, q.kind === "PARTY" || q.kind === "RANKING" ? 1 : 0)}</td>
                            <td className="py-1 text-right">
                              {it.personId ? (
                                <span className="text-emerald-700">{peopleById.get(it.personId)?.name ?? "pessoa"}</span>
                              ) : it.partyId ? (
                                <span className="text-emerald-700">{partiesById.get(it.partyId)?.acronym ?? "partido"}</span>
                              ) : it.matched ? (
                                <span className="text-slate-400">resposta</span>
                              ) : (
                                <span className="text-amber-700">sem match</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ))}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
            <span className="mr-auto text-xs text-slate-400">A confirmação grava tudo numa transação e deixa a semana em rascunho.</span>
            <Button variant="outline" onClick={onCancel} disabled={busy !== null}>Cancelar</Button>
            <Button onClick={commit} disabled={busy !== null || report.errors.length > 0}>
              {busy === "commit" ? "A gravar…" : report.weekExists ? "Confirmar e substituir semana" : "Confirmar import"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
