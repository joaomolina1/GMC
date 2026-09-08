"use client";

import { useEffect, useState } from "react";
import { Copy, KeyRound, RefreshCw } from "lucide-react";
import { Badge } from "@/_design_system/Badge";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Input, Textarea } from "@/_design_system/Input";
import type { SettingsRow } from "@lib/pt26/types";
import { api, type Reference } from "./api";
import { useNotify } from "./Notice";

export function SettingsTab({ reference, onChanged }: { reference: Reference; onChanged: () => Promise<void> }) {
  const notify = useNotify();
  const [footer, setFooter] = useState(reference.settings.footer_text ?? "");
  const [year, setYear] = useState(reference.settings.logo_year ?? "26");
  const [token, setToken] = useState(reference.settings.live_token ?? "");
  const [busy, setBusy] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    setFooter(reference.settings.footer_text ?? "");
    setYear(reference.settings.logo_year ?? "26");
    setToken(reference.settings.live_token ?? "");
  }, [reference.settings]);

  const liveUrl = `${origin}/pt26/live${token ? `?key=${encodeURIComponent(token)}` : ""}`;

  async function patch(body: Record<string, unknown>, ok: string) {
    setBusy(JSON.stringify(body));
    try {
      const r = await api<{ settings: SettingsRow }>("/api/pt26/admin/settings", { method: "PATCH", body: JSON.stringify(body) });
      setToken(r.settings.live_token ?? "");
      await onChanged();
      notify("ok", ok);
    } catch (e) {
      notify("err", e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><KeyRound size={16} className="text-slate-400" /><CardTitle>Acesso do ecrã do pivot</CardTitle></div>
          <Badge tone={token ? "success" : "warning"}>{token ? "Protegido por token" : "Aberto (sem token)"}</Badge>
        </CardHeader>
        <p className="mb-3 text-sm text-slate-500">O ecrã tátil não tem login: abre-se com este URL. Regenerar o token invalida o URL anterior. Sem token, qualquer pessoa com o link vê os resultados publicados.</p>
        <Input label="Token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="vazio = sem proteção" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => patch({ live_token: token }, "Token guardado.")} disabled={busy !== null || token === (reference.settings.live_token ?? "")}>Guardar token</Button>
          <Button size="sm" variant="outline" onClick={() => window.confirm("Regenerar o token? O URL atual do ecrã deixa de funcionar.") && patch({ regenerate_token: true }, "Token regenerado — atualiza o atalho do ecrã.")} disabled={busy !== null}>
            <RefreshCw size={14} /> Regenerar
          </Button>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 p-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-400">URL do ecrã</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-slate-700">{liveUrl}</code>
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(liveUrl); notify("ok", "URL copiado."); }}><Copy size={14} /></Button>
          </div>
          <p className="mt-2 text-xs text-slate-400">Abre em ecrã inteiro (F11) num browser Chromium a 1920×1080. Os dados carregam-se de uma vez ao abrir; toque no logo volta ao início.</p>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Apresentação</CardTitle>
        </CardHeader>
        <div className="grid gap-4">
          <Textarea label="Rodapé / fonte da sondagem" value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Ex.: Sondagem Aximage para TVI/CNN · n=1.012 · margem de erro ±3,1%" className="min-h-[80px]" hint="Opcional. Mostrado discretamente na base do ecrã." />
          <Input label="Ano no logótipo" value={year} onChange={(e) => setYear(e.target.value)} maxLength={4} hint="PORTUGAL + este sufixo (ex.: 26)" className="max-w-[120px]" />
        </div>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => patch({ footer_text: footer, logo_year: year.trim() || "26" }, "Apresentação guardada.")} disabled={busy !== null || (footer === (reference.settings.footer_text ?? "") && year === reference.settings.logo_year)}>Guardar</Button>
        </div>
      </Card>
    </div>
  );
}
