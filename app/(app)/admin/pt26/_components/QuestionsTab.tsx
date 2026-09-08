"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Input } from "@/_design_system/Input";
import type { QuestionRow } from "@lib/pt26/types";
import { KIND_LABEL, api, type Reference } from "./api";
import { useNotify } from "./Notice";

export function QuestionsTab({ reference, onChanged }: { reference: Reference; onChanged: () => Promise<void> }) {
  const notify = useNotify();
  const [drafts, setDrafts] = useState<Record<string, { title: string; subtitle: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const next: typeof drafts = {};
    for (const q of reference.questions) next[q.id] = { title: q.title, subtitle: q.subtitle ?? "" };
    setDrafts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference.questions]);

  async function save(q: QuestionRow) {
    const d = drafts[q.id];
    if (!d) return;
    setBusy(q.id);
    try {
      await api("/api/pt26/admin/questions", { method: "PATCH", body: JSON.stringify({ id: q.id, title: d.title.trim(), subtitle: d.subtitle.trim() || null }) });
      await onChanged();
      notify("ok", `Pergunta ${q.number} guardada.`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perguntas (8 fixas)</CardTitle>
        <Badge tone="neutral">Tipo e ordem só de leitura</Badge>
      </CardHeader>
      <div className="divide-y divide-line">
        {[...reference.questions]
          .sort((a, b) => a.number - b.number)
          .map((q) => {
            const d = drafts[q.id] ?? { title: q.title, subtitle: q.subtitle ?? "" };
            const dirty = d.title !== q.title || d.subtitle !== (q.subtitle ?? "");
            return (
              <div key={q.id} className="grid items-end gap-3 py-4 md:grid-cols-[48px_1fr_1fr_auto]">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">{q.number}</div>
                <Input label="Título" value={d.title} onChange={(e) => setDrafts({ ...drafts, [q.id]: { ...d, title: e.target.value } })} />
                <Input label="Subtítulo" value={d.subtitle} onChange={(e) => setDrafts({ ...drafts, [q.id]: { ...d, subtitle: e.target.value } })} placeholder="opcional" />
                <div className="flex items-center gap-2 pb-0.5">
                  <Badge tone="neutral">{KIND_LABEL[q.kind] ?? q.kind}{q.kind === "RANKING" ? (q.sign > 0 ? " +" : " −") : ""}</Badge>
                  <Button size="sm" onClick={() => save(q)} disabled={busy === q.id || !dirty || !d.title.trim()}>{busy === q.id ? "…" : "Guardar"}</Button>
                </div>
              </div>
            );
          })}
      </div>
    </Card>
  );
}
