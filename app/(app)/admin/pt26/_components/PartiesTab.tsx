"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, ImageIcon, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Input } from "@/_design_system/Input";
import type { PartyRow } from "@lib/pt26/types";
import { api, partyLogoUrl, type Reference } from "./api";
import { useNotify } from "./Notice";

interface Form {
  id?: string;
  acronym: string;
  name: string;
  color: string;
  sort_order: number;
}

export function PartiesTab({ reference, onChanged }: { reference: Reference; onChanged: () => Promise<void> }) {
  const notify = useNotify();
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parties = useMemo(() => [...reference.parties].sort((a, b) => a.sort_order - b.sort_order), [reference.parties]);
  const selected = parties.find((p) => p.id === form?.id) ?? null;
  const leaders = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of reference.people) if (p.party_id && (p.kind === "LEADER" || (p.kind === "PM" && !m.has(p.party_id)))) m.set(p.party_id, p.name);
    return m;
  }, [reference.people]);

  async function save() {
    if (!form) return;
    setBusy("save");
    try {
      const r = await api<{ party: PartyRow }>("/api/pt26/admin/parties", {
        method: "POST",
        body: JSON.stringify({ ...form, acronym: form.acronym.trim(), name: form.name.trim(), sort_order: Number(form.sort_order) }),
      });
      await onChanged();
      setForm({ ...r.party });
      notify("ok", `«${r.party.acronym}» guardado.`);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: PartyRow) {
    if (!window.confirm(`Apagar «${p.acronym}»? Os resultados associados ficam sem partido (sem cor/logótipo).`)) return;
    setBusy("delete");
    try {
      await api(`/api/pt26/admin/parties?id=${p.id}`, { method: "DELETE" });
      setForm(null);
      await onChanged();
      notify("ok", "Partido apagado.");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function move(p: PartyRow, dir: -1 | 1) {
    const i = parties.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= parties.length) return;
    const other = parties[j];
    setBusy("reorder");
    try {
      await Promise.all([
        api("/api/pt26/admin/parties", { method: "POST", body: JSON.stringify({ id: p.id, acronym: p.acronym, name: p.name, color: p.color, sort_order: j + 1 }) }),
        api("/api/pt26/admin/parties", { method: "POST", body: JSON.stringify({ id: other.id, acronym: other.acronym, name: other.name, color: other.color, sort_order: i + 1 }) }),
      ]);
      await onChanged();
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro ao reordenar");
    } finally {
      setBusy(null);
    }
  }

  async function uploadLogo(file: File) {
    if (!selected) return;
    setBusy("logo");
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api(`/api/pt26/admin/parties/${selected.id}/logo`, { method: "POST", body: fd });
      await onChanged();
      notify("ok", "Logótipo atualizado.");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setBusy(null);
    }
  }

  async function removeLogo() {
    if (!selected) return;
    setBusy("logo");
    try {
      await api(`/api/pt26/admin/parties/${selected.id}/logo`, { method: "DELETE" });
      await onChanged();
      notify("ok", "Logótipo removido.");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card padding="none">
        <div className="flex items-center justify-between px-6 pt-5">
          <CardHeader className="!mb-0">
            <CardTitle>Partidos ({parties.length})</CardTitle>
          </CardHeader>
          <Button size="sm" className="mb-4" onClick={() => setForm({ acronym: "", name: "", color: "#5b8cff", sort_order: (parties.at(-1)?.sort_order ?? 0) + 1 })}>
            <Plus size={14} /> Novo partido
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-y border-line bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="px-6 py-3 font-medium">Ordem</th>
              <th className="px-6 py-3 font-medium">Partido</th>
              <th className="px-6 py-3 font-medium">Cor</th>
              <th className="px-6 py-3 font-medium">Logótipo</th>
              <th className="px-6 py-3 font-medium">Líder</th>
              <th className="px-6 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {parties.map((p, i) => {
              const logo = partyLogoUrl(reference.mediaBase, p);
              return (
                <tr key={p.id} className={`hover:bg-slate-50/60 ${form?.id === p.id ? "bg-brand-50/40" : ""}`}>
                  <td className="px-6 py-2">
                    <div className="flex items-center gap-1 text-slate-400">
                      <span className="w-5 text-xs font-semibold">{i + 1}</span>
                      <button type="button" disabled={i === 0 || busy === "reorder"} onClick={() => move(p, -1)} className="rounded p-0.5 hover:bg-slate-200 disabled:opacity-25" aria-label="Subir"><ChevronUp size={14} /></button>
                      <button type="button" disabled={i === parties.length - 1 || busy === "reorder"} onClick={() => move(p, 1)} className="rounded p-0.5 hover:bg-slate-200 disabled:opacity-25" aria-label="Descer"><ChevronDown size={14} /></button>
                    </div>
                  </td>
                  <td className="px-6 py-2">
                    <p className="font-semibold text-slate-900">{p.acronym}</p>
                    <p className="text-xs text-slate-500">{p.name}</p>
                  </td>
                  <td className="px-6 py-2">
                    <span className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <span className="h-5 w-5 rounded-full border border-white shadow" style={{ background: p.color }} /> {p.color}
                    </span>
                  </td>
                  <td className="px-6 py-2">
                    {logo ? (
                      <span className="inline-grid h-9 w-9 place-items-center rounded-lg bg-slate-800 p-1"><img src={logo} alt="" className="max-h-full max-w-full" /></span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-2 text-xs text-slate-600">{leaders.get(p.id) ?? <span className="text-slate-400">—</span>}</td>
                  <td className="px-6 py-2 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setForm({ id: p.id, acronym: p.acronym, name: p.name, color: p.color, sort_order: p.sort_order })}>Editar</Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line px-6 py-3 text-xs text-slate-500">A ordem define a sequência por defeito no template Excel e a cor é usada nas barras e avatares do ecrã. O líder é a pessoa com tipo «Líder partidário» (ou PM) ligada ao partido.</p>
      </Card>

      {form ? (
        <Card className="self-start">
          <CardHeader>
            <CardTitle>{form.id ? `Editar — ${form.acronym}` : "Novo partido"}</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setForm(null)}>Fechar</Button>
          </CardHeader>
          <div className="grid gap-4">
            <Input label="Sigla" value={form.acronym} onChange={(e) => setForm({ ...form, acronym: e.target.value })} required hint="Tem de coincidir com o Excel (ex.: PS, O/B/N)" />
            <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <div className="grid grid-cols-[64px_1fr] items-end gap-2">
              <Input label="Cor" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-10 p-1" />
              <Input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} pattern="^#[0-9a-fA-F]{6}$" placeholder="#rrggbb" />
            </div>
            <Input label="Ordem" type="number" min={0} value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            {form.id && selected && (
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500"><ImageIcon size={14} /> Logótipo (PNG transparente ou SVG)</p>
                <div className="flex items-center gap-3">
                  <span className="grid h-16 w-16 place-items-center rounded-xl p-2" style={{ background: "linear-gradient(160deg,#0a1a4c 0%,#040b22 72%)" }}>
                    {partyLogoUrl(reference.mediaBase, selected) ? <img src={partyLogoUrl(reference.mediaBase, selected) ?? ""} alt="" className="max-h-full max-w-full" /> : <span className="text-xs text-white/50">{selected.acronym}</span>}
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy === "logo"}>{busy === "logo" ? "A carregar…" : selected.logo_path ? "Substituir" : "Carregar"}</Button>
                    {selected.logo_path && <Button size="sm" variant="ghost" onClick={removeLogo} disabled={busy === "logo"}>Remover</Button>}
                    <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/webp,.svg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void uploadLogo(f); }} />
                  </div>
                </div>
              </div>
            )}
            {!form.id && <p className="text-xs text-slate-400">Guarda primeiro para poder carregar o logótipo.</p>}
          </div>
          <div className="mt-5 flex justify-end gap-2">
            {form.id && selected && (
              <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50" onClick={() => remove(selected)} disabled={busy !== null}>
                <Trash2 size={14} /> Apagar
              </Button>
            )}
            <Button onClick={save} disabled={busy === "save" || !form.acronym.trim() || !form.name.trim() || !/^#[0-9a-fA-F]{6}$/.test(form.color)}>{busy === "save" ? "A guardar…" : "Guardar"}</Button>
          </div>
        </Card>
      ) : (
        <Card className="self-start text-sm text-slate-500">
          <Badge tone="neutral">Dica</Badge>
          <p className="mt-2">As cores vêm do protótipo (PS rosa, CHEGA azul, AD laranja…). Sem logótipo, o ecrã mostra as iniciais do líder no círculo com a cor do partido.</p>
        </Card>
      )}
    </div>
  );
}
