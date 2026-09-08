"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, ImageOff, Link2, Plus, RefreshCw, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Input, Select } from "@/_design_system/Input";
import { PERSON_KINDS, type PersonKind, type PersonRow } from "@lib/pt26/types";
import { PERSON_KIND_LABEL, api, initials, personPhotoUrl, type Reference } from "./api";
import { useNotify } from "./Notice";
import { PhotoCropper } from "./PhotoCropper";

interface UnmatchedItem {
  item: string;
  source: "result" | "quadro";
  occurrences: { week_date: string; week_label: string; question_number: number; quadro_idx: number }[];
}

interface Form {
  id?: string;
  name: string;
  role: string;
  kind: PersonKind;
  party_id: string;
  aliases: string;
}

const emptyForm = (): Form => ({ name: "", role: "", kind: "MINISTER", party_id: "", aliases: "" });

export function PeopleTab({ reference, onChanged }: { reference: Reference; onChanged: () => Promise<void> }) {
  const notify = useNotify();
  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [unmatched, setUnmatched] = useState<UnmatchedItem[]>([]);
  const [aliasTarget, setAliasTarget] = useState<Record<string, string>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const people = useMemo(() => [...reference.people].sort((a, b) => a.name.localeCompare(b.name)), [reference.people]);
  const selected = people.find((p) => p.id === selectedId) ?? null;
  const partyById = useMemo(() => new Map(reference.parties.map((p) => [p.id, p])), [reference.parties]);

  const loadUnmatched = useCallback(async () => {
    try {
      const r = await api<{ items: UnmatchedItem[] }>("/api/pt26/admin/unmatched");
      setUnmatched(r.items);
    } catch {
      /* secção opcional */
    }
  }, []);

  useEffect(() => {
    void loadUnmatched();
  }, [loadUnmatched]);

  const visible = people.filter((p) => !filter || p.name.toLowerCase().includes(filter.toLowerCase()) || (p.role ?? "").toLowerCase().includes(filter.toLowerCase()));
  const withoutPhoto = people.filter((p) => !p.photo_path).length;

  function edit(p: PersonRow) {
    setSelectedId(p.id);
    setForm({ id: p.id, name: p.name, role: p.role ?? "", kind: p.kind, party_id: p.party_id ?? "", aliases: p.aliases.join(", ") });
  }
  function create(prefill?: Partial<Form>) {
    setSelectedId(null);
    setForm({ ...emptyForm(), ...prefill });
  }

  async function save() {
    if (!form) return;
    setBusy("save");
    try {
      const payload = {
        id: form.id,
        name: form.name.trim(),
        role: form.role.trim() || null,
        kind: form.kind,
        party_id: form.party_id || null,
        aliases: form.aliases.split(/[,;\n]/).map((a) => a.trim()).filter(Boolean),
      };
      const r = await api<{ person: PersonRow }>("/api/pt26/admin/people", { method: "POST", body: JSON.stringify(payload) });
      await onChanged();
      setSelectedId(r.person.id);
      setForm({ id: r.person.id, name: r.person.name, role: r.person.role ?? "", kind: r.person.kind, party_id: r.person.party_id ?? "", aliases: r.person.aliases.join(", ") });
      notify("ok", `«${r.person.name}» guardado.`);
      await rematch(false);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setBusy(null);
    }
  }

  async function remove(p: PersonRow) {
    if (!window.confirm(`Apagar «${p.name}»? Os resultados que lhe estavam associados ficam sem pessoa (sem foto).`)) return;
    setBusy("delete");
    try {
      await api(`/api/pt26/admin/people?id=${p.id}`, { method: "DELETE" });
      setForm(null);
      setSelectedId(null);
      await onChanged();
      notify("ok", "Pessoa apagada.");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function uploadPhoto(blob: Blob) {
    if (!selected) return;
    setBusy("photo");
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], `${selected.id}.jpg`, { type: "image/jpeg" }));
      await api(`/api/pt26/admin/people/${selected.id}/photo`, { method: "POST", body: fd });
      setCropFile(null);
      await onChanged();
      notify("ok", "Fotografia atualizada (256px e 800px WEBP).");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro no upload");
    } finally {
      setBusy(null);
    }
  }

  async function removePhoto() {
    if (!selected || !window.confirm(`Remover a fotografia de «${selected.name}»?`)) return;
    setBusy("photo");
    try {
      await api(`/api/pt26/admin/people/${selected.id}/photo`, { method: "DELETE" });
      await onChanged();
      notify("ok", "Fotografia removida.");
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  async function rematch(announce = true) {
    try {
      const r = await api<{ updatedResults: number; updatedQuadros: number }>("/api/pt26/admin/rematch", { method: "POST" });
      await loadUnmatched();
      if (announce || r.updatedResults + r.updatedQuadros > 0) {
        notify("ok", `Reemparelhamento: ${r.updatedResults} item(ns) e ${r.updatedQuadros} quadro(s) associados.`);
      }
    } catch (e) {
      if (announce) notify("err", e instanceof Error ? e.message : "Erro");
    }
  }

  async function addAlias(item: UnmatchedItem) {
    const personId = aliasTarget[item.item];
    if (!personId) return;
    setBusy(`alias-${item.item}`);
    try {
      await api("/api/pt26/admin/people/alias", { method: "POST", body: JSON.stringify({ person_id: personId, alias: item.item }) });
      await onChanged();
      notify("ok", `«${item.item}» adicionado como alias.`);
      await rematch(false);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      {cropFile && selected && <PhotoCropper file={cropFile} name={selected.name} busy={busy === "photo"} onCancel={() => setCropFile(null)} onConfirm={uploadPhoto} />}

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <Card padding="sm" className="self-start">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Pessoas ({people.length})</p>
            <Button size="sm" onClick={() => create()}>
              <Plus size={14} /> Nova
            </Button>
          </div>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Pesquisar…" className="mb-2 py-2 text-sm" />
          {withoutPhoto > 0 && (
            <p className="mb-2 flex items-center gap-1.5 px-1 text-xs text-amber-700">
              <ImageOff size={12} /> {withoutPhoto} sem fotografia
            </p>
          )}
          <div className="flex max-h-[600px] flex-col gap-1 overflow-y-auto">
            {visible.map((p) => {
              const url = personPhotoUrl(reference.mediaBase, p);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => edit(p)}
                  className={`flex items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors ${selectedId === p.id ? "bg-brand-50 ring-1 ring-brand-100" : "hover:bg-slate-50"}`}
                >
                  <span className="relative grid h-10 w-10 flex-none place-items-center overflow-hidden rounded-full bg-slate-800 text-xs font-semibold text-white">
                    {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : initials(p.name)}
                    {!p.photo_path && <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-amber-500" title="Sem fotografia" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                    <span className="block truncate text-xs text-slate-500">{p.role ?? PERSON_KIND_LABEL[p.kind]}{p.party_id ? ` · ${partyById.get(p.party_id)?.acronym ?? ""}` : ""}</span>
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-400">Sem resultados.</p>}
          </div>
        </Card>

        <div className="space-y-6">
          {form ? (
            <Card>
              <CardHeader>
                <CardTitle>{form.id ? `Editar — ${form.name}` : "Nova pessoa"}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setForm(null)}>Fechar</Button>
              </CardHeader>
              <div className="grid gap-5 md:grid-cols-[200px_1fr]">
                <div className="flex flex-col items-center gap-3 rounded-xl p-4" style={{ background: "linear-gradient(160deg,#0a1a4c 0%,#040b22 72%)" }}>
                  <div className="grid h-[118px] w-[118px] place-items-center overflow-hidden rounded-full text-3xl font-semibold text-white" style={{ border: "2px solid rgba(255,255,255,.35)", background: "linear-gradient(150deg,rgba(255,255,255,.16),rgba(255,255,255,.03))" }}>
                    {selected && personPhotoUrl(reference.mediaBase, selected) ? (
                      <img src={personPhotoUrl(reference.mediaBase, selected, 256) ?? ""} alt={selected.name} className="h-full w-full object-cover" />
                    ) : (
                      initials(form.name || "?")
                    )}
                  </div>
                  <p className="text-center text-xs text-white/60">{selected?.photo_path ? "Como aparece no ecrã do pivot" : "Sem fotografia — mostra as iniciais"}</p>
                  {form.id ? (
                    <div className="flex flex-col gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy === "photo"}>
                        <Camera size={14} /> {selected?.photo_path ? "Substituir foto" : "Carregar foto"}
                      </Button>
                      {selected?.photo_path && (
                        <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10 hover:text-white" onClick={removePhoto} disabled={busy === "photo"}>
                          Remover foto
                        </Button>
                      )}
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (!f) return;
                          if (f.size > 10 * 1024 * 1024) return notify("err", "A imagem excede 10 MB.");
                          setCropFile(f);
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-center text-[11px] text-white/50">Guarda primeiro para poder carregar a fotografia.</p>
                  )}
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <Input label="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required hint="Tem de coincidir com o Excel (ou usar aliases)" />
                  <Input label="Cargo" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Ministro das Finanças" />
                  <Select label="Tipo" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as PersonKind })}>
                    {PERSON_KINDS.map((k) => (
                      <option key={k} value={k}>{PERSON_KIND_LABEL[k]}</option>
                    ))}
                  </Select>
                  <Select label="Partido" value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })}>
                    <option value="">— sem partido —</option>
                    {reference.parties.map((p) => (
                      <option key={p.id} value={p.id}>{p.acronym} · {p.name}</option>
                    ))}
                  </Select>
                  <div className="md:col-span-2">
                    <Input label="Aliases (separados por vírgula)" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} placeholder="Joaquim Miranda Sarmento, J. Miranda Sarmento" hint="Nomes alternativos que podem vir no Excel" />
                  </div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                {form.id && selected && (
                  <Button variant="ghost" className="mr-auto text-red-600 hover:bg-red-50" onClick={() => remove(selected)} disabled={busy !== null}>
                    <Trash2 size={14} /> Apagar
                  </Button>
                )}
                <Button onClick={save} disabled={busy === "save" || !form.name.trim()}>{busy === "save" ? "A guardar…" : "Guardar"}</Button>
              </div>
            </Card>
          ) : (
            <Card className="text-sm text-slate-500">Escolhe uma pessoa na lista para editar ou carregar a fotografia, ou cria uma nova.</Card>
          )}

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle>Itens sem correspondência</CardTitle>
                <Badge tone={unmatched.length ? "warning" : "success"}>{unmatched.length}</Badge>
              </div>
              <Button variant="outline" size="sm" onClick={() => rematch(true)}>
                <RefreshCw size={14} /> Reemparelhar
              </Button>
            </CardHeader>
            <p className="mb-3 text-xs text-slate-500">Nomes que vieram nos imports e não correspondem a nenhuma pessoa ou partido — aparecem sem imagem no ecrã. Cria a pessoa ou associa como alias.</p>
            {unmatched.length === 0 && <p className="text-sm text-slate-400">Tudo emparelhado.</p>}
            <ul className="divide-y divide-line">
              {unmatched.map((u) => (
                <li key={`${u.source}-${u.item}`} className="flex flex-wrap items-center gap-2 py-2.5">
                  <div className="min-w-[200px] flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {u.item} {u.source === "quadro" && <Badge tone="neutral">cara do quadro</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {u.occurrences.slice(0, 3).map((o) => `${o.week_label} · P${o.question_number} Q${o.quadro_idx}`).join(" · ")}
                      {u.occurrences.length > 3 ? ` · +${u.occurrences.length - 3}` : ""}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => create({ name: u.item, kind: u.occurrences[0]?.question_number === 6 || u.occurrences[0]?.question_number >= 7 ? "MINISTER" : "OTHER" })}>
                    <UserPlus size={14} /> Criar pessoa
                  </Button>
                  <div className="flex items-center gap-1">
                    <Select value={aliasTarget[u.item] ?? ""} onChange={(e) => setAliasTarget({ ...aliasTarget, [u.item]: e.target.value })} className="min-w-[180px] py-1.5 text-xs">
                      <option value="">Alias de…</option>
                      {people.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </Select>
                    <Button size="sm" variant="outline" onClick={() => addAlias(u)} disabled={!aliasTarget[u.item] || busy === `alias-${u.item}`}>
                      <Link2 size={14} /> Associar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
