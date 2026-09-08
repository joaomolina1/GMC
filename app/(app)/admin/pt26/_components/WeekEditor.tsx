"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Input, Select } from "@/_design_system/Input";
import { parseNumber } from "@lib/pt26/normalize";
import type { ImportLogRow, QuadroRow, ResultRow, WeekRow } from "@lib/pt26/types";
import { api, fmtDate, fmtDateTime, type Reference } from "./api";
import { useNotify } from "./Notice";

interface Detail {
  week: WeekRow;
  quadros: (QuadroRow & { question_number: number; results: (ResultRow & { value: number })[] })[];
  logs: ImportLogRow[];
}

interface EditResult {
  uid: string;
  item_key: string;
  value: string;
  person_id: string | null;
  party_id: string | null;
}

interface EditQuadro {
  uid: string;
  question_number: number;
  idx: number;
  title: string;
  person_id: string | null;
  results: EditResult[];
}

let uidCounter = 0;
const uid = () => `u${++uidCounter}`;

export function WeekEditor({ reference, weekId, onClose, onSaved }: { reference: Reference; weekId: string; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [label, setLabel] = useState("");
  const [quadros, setQuadros] = useState<EditQuadro[]>([]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api<Detail>(`/api/pt26/admin/weeks/${weekId}`);
      setDetail(d);
      setLabel(d.week.label);
      setQuadros(
        d.quadros.map((q) => ({
          uid: uid(),
          question_number: q.question_number,
          idx: q.idx,
          title: q.title ?? "",
          person_id: q.person_id,
          results: q.results.map((r) => ({ uid: uid(), item_key: r.item_key, value: String(r.value).replace(".", ","), person_id: r.person_id, party_id: r.party_id })),
        }))
      );
      setDirty(false);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro a carregar a semana");
    }
  }, [weekId, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const questions = useMemo(() => [...reference.questions].sort((a, b) => a.number - b.number), [reference.questions]);
  const people = useMemo(() => [...reference.people].sort((a, b) => a.name.localeCompare(b.name)), [reference.people]);

  function update(fn: (list: EditQuadro[]) => EditQuadro[]) {
    setQuadros((prev) => fn(prev));
    setDirty(true);
  }
  const patchQuadro = (id: string, patch: Partial<EditQuadro>) => update((l) => l.map((q) => (q.uid === id ? { ...q, ...patch } : q)));
  const patchResult = (qid: string, rid: string, patch: Partial<EditResult>) =>
    update((l) => l.map((q) => (q.uid === qid ? { ...q, results: q.results.map((r) => (r.uid === rid ? { ...r, ...patch, ...(patch.item_key !== undefined ? { person_id: null, party_id: null } : {}) } : r)) } : q)));
  const moveResult = (qid: string, rid: string, dir: -1 | 1) =>
    update((l) =>
      l.map((q) => {
        if (q.uid !== qid) return q;
        const i = q.results.findIndex((r) => r.uid === rid);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= q.results.length) return q;
        const results = [...q.results];
        [results[i], results[j]] = [results[j], results[i]];
        return { ...q, results };
      })
    );
  const removeResult = (qid: string, rid: string) => update((l) => l.map((q) => (q.uid === qid ? { ...q, results: q.results.filter((r) => r.uid !== rid) } : q)));
  const addResult = (qid: string) => update((l) => l.map((q) => (q.uid === qid ? { ...q, results: [...q.results, { uid: uid(), item_key: "", value: "", person_id: null, party_id: null }] } : q)));
  const addQuadro = (questionNumber: number) =>
    update((l) => {
      const existing = l.filter((q) => q.question_number === questionNumber);
      const idx = (existing.at(-1)?.idx ?? 0) + 1;
      return [...l, { uid: uid(), question_number: questionNumber, idx, title: "", person_id: null, results: [] }];
    });
  const removeQuadro = (qid: string) => update((l) => l.filter((q) => q.uid !== qid));

  async function save() {
    setBusy(true);
    try {
      const payload = {
        label: label.trim() || undefined,
        quadros: quadros.map((q) => ({
          question_number: q.question_number,
          idx: q.idx,
          title: q.title.trim() || null,
          person_id: q.person_id,
          results: q.results
            .filter((r) => r.item_key.trim())
            .map((r) => {
              const v = parseNumber(r.value);
              if (v === null) throw new Error(`P${q.question_number} quadro ${q.idx}: valor inválido em «${r.item_key}» (${r.value || "vazio"}).`);
              return { item_key: r.item_key.trim(), value: v, person_id: r.person_id, party_id: r.party_id };
            }),
        })),
      };
      await api(`/api/pt26/admin/weeks/${weekId}`, { method: "PUT", body: JSON.stringify(payload) });
      notify("ok", "Semana guardada.");
      await load();
      onSaved();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  }

  if (!detail) return <Card><p className="text-sm text-slate-400">A carregar semana…</p></Card>;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Editar {detail.week.label} · {fmtDate(detail.week.date)}</CardTitle>
          <Badge tone={detail.week.status === "PUBLISHED" ? "success" : "neutral"}>{detail.week.status === "PUBLISHED" ? "Publicada" : "Rascunho"}</Badge>
          {dirty && <Badge tone="warning">Alterações por guardar</Badge>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Fechar</Button>
          <Button size="sm" onClick={save} disabled={busy || !dirty}>{busy ? "A guardar…" : "Guardar semana"}</Button>
        </div>
      </CardHeader>

      <div className="mb-5 grid gap-4 md:grid-cols-[240px_1fr]">
        <Input label="Rótulo" value={label} onChange={(e) => { setLabel(e.target.value); setDirty(true); }} />
        <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
          <p className="font-semibold text-slate-700">Ficheiro de origem</p>
          <p>{detail.week.source_file_name ?? "—"} · importado {fmtDateTime(detail.week.imported_at)}</p>
          {detail.logs[0]?.report?.warnings?.length ? <p className="mt-1 text-amber-700">{detail.logs[0].report.warnings.length} aviso(s) no último import.</p> : null}
        </div>
      </div>

      <div className="space-y-4">
        {questions.map((q) => {
          const list = quadros.filter((x) => x.question_number === q.number).sort((a, b) => a.idx - b.idx);
          const decimals = q.kind === "PARTY" || q.kind === "RANKING" ? 1 : 0;
          return (
            <div key={q.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-xs font-semibold">{q.number}</span>
                <p className="text-sm font-semibold text-slate-900">{q.title}</p>
                <Badge tone="neutral">{q.kind}</Badge>
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => addQuadro(q.number)}>
                  <Plus size={14} /> Quadro
                </Button>
              </div>
              {list.length === 0 && <p className="text-xs text-slate-400">Sem quadros nesta semana.</p>}
              <div className="grid gap-3 lg:grid-cols-2">
                {list.map((quadro) => (
                  <div key={quadro.uid} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3">
                    <div className="mb-2 flex flex-wrap items-end gap-2">
                      <span className="text-xs font-semibold text-slate-500">Quadro {quadro.idx}</span>
                      <div className="min-w-[160px] flex-1">
                        <Input value={quadro.title} onChange={(e) => patchQuadro(quadro.uid, { title: e.target.value })} placeholder="Título do quadro (opcional)" className="py-1.5 text-xs" />
                      </div>
                      {(q.kind === "MINISTER" || q.kind === "APPROVAL") && (
                        <div className="min-w-[200px] flex-1">
                          <Select value={quadro.person_id ?? ""} onChange={(e) => patchQuadro(quadro.uid, { person_id: e.target.value || null })} className="py-1.5 text-xs">
                            <option value="">{q.kind === "MINISTER" ? "Pessoa (cara do quadro)…" : "Pessoa (opcional)…"}</option>
                            {people.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </Select>
                        </div>
                      )}
                      <Button variant="ghost" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => removeQuadro(quadro.uid)} aria-label="Remover quadro">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                    <table className="w-full text-xs">
                      <tbody>
                        {quadro.results.map((r, i) => (
                          <tr key={r.uid}>
                            <td className="py-1 pr-2">
                              <input
                                value={r.item_key}
                                onChange={(e) => patchResult(quadro.uid, r.uid, { item_key: e.target.value })}
                                placeholder="Item (sigla, nome ou resposta)"
                                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
                              />
                            </td>
                            <td className="w-24 py-1 pr-2">
                              <input
                                value={r.value}
                                onChange={(e) => patchResult(quadro.uid, r.uid, { value: e.target.value })}
                                placeholder={decimals ? "0,0" : "0"}
                                inputMode="decimal"
                                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right text-xs tabular-nums"
                              />
                            </td>
                            <td className="w-16 py-1 pr-1 text-[11px] text-slate-400">{r.person_id ? "pessoa" : r.party_id ? "partido" : ""}</td>
                            <td className="w-24 py-1 text-right">
                              <button type="button" disabled={i === 0} onClick={() => moveResult(quadro.uid, r.uid, -1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-20" aria-label="Subir"><ChevronUp size={14} /></button>
                              <button type="button" disabled={i === quadro.results.length - 1} onClick={() => moveResult(quadro.uid, r.uid, 1)} className="rounded p-1 text-slate-400 hover:bg-slate-200 disabled:opacity-20" aria-label="Descer"><ChevronDown size={14} /></button>
                              <button type="button" onClick={() => removeResult(quadro.uid, r.uid)} className="rounded p-1 text-red-500 hover:bg-red-50" aria-label="Remover"><Trash2 size={14} /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Button variant="ghost" size="sm" onClick={() => addResult(quadro.uid)}>
                      <Plus size={14} /> Item
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {detail.logs.length > 0 && (
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-xs text-slate-500">
          <p className="mb-1 font-semibold text-slate-700">Imports desta semana</p>
          <ul className="space-y-0.5">
            {detail.logs.map((l) => (
              <li key={l.id}>
                {fmtDateTime(l.created_at)} · {l.file_name} · <Badge tone={l.status === "COMMITTED" ? "success" : "danger"}>{l.status === "COMMITTED" ? "gravado" : "falhou"}</Badge>
                {l.report?.warnings?.length ? ` · ${l.report.warnings.length} aviso(s)` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
