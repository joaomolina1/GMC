"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Clock, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Button } from "@/_design_system/Button";
import { Input } from "@/_design_system/Input";

function Entrar() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState("");
  const [aEntrar, setAEntrar] = useState(false);

  async function submeter(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    setAEntrar(true);
    const { error } = await createClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error) {
      setErro(/invalid/i.test(error.message) ? "Email ou palavra-passe incorretos." : error.message);
      setAEntrar(false);
      return;
    }
    const next = params.get("next");
    router.replace(next && next.startsWith("/escalas") && !next.startsWith("//") ? next : "/escalas");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-accent-500 p-12 text-white lg:flex">
        <div className="absolute -right-20 top-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
            <CalendarDays size={20} />
          </div>
          <div>
            <div className="font-semibold">Escalas</div>
            <div className="text-xs text-white/70">Grupo Media Capital</div>
          </div>
        </div>
        <div className="relative">
          <h2 className="text-3xl font-bold leading-tight">Turnos, folgas e ausências num só sítio</h2>
          <ul className="mt-8 space-y-3 text-sm text-white/90">
            {[
              [Clock, "Consulte os seus turnos e próximos horários"],
              [CalendarDays, "Peça férias, indisponibilidades ou registe baixas"],
              [ShieldCheck, "Regras de descanso e folgas verificadas automaticamente"],
              [Users, "Coordenação com grelha semanal e sugestão de escala"],
            ].map(([Icon, t]) => {
              const I = Icon as typeof Clock;
              return (
                <li key={t as string} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
                    <I size={18} />
                  </span>
                  {t as string}
                </li>
              );
            })}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© Grupo Media Capital</p>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-600 to-accent-500 text-white">
              <CalendarDays size={20} />
            </div>
            <div className="font-semibold text-slate-900">Escalas</div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Entrar</h1>
          <p className="mt-1 text-sm text-slate-500">Use o seu email profissional e a sua palavra-passe.</p>
          <form onSubmit={submeter} className="mt-8 space-y-4">
            <Input label="Email" type="email" autoComplete="username" placeholder="nome@tvi.pt" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input label="Palavra-passe" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            {erro && <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{erro}</div>}
            <Button type="submit" size="lg" className="w-full" disabled={aEntrar}>
              {aEntrar ? "A entrar..." : "Entrar"}
            </Button>
          </form>
          <p className="mt-6 text-center text-xs text-slate-400">Esqueceu a palavra-passe? Peça à coordenação para a repor.</p>
        </div>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Entrar />
    </Suspense>
  );
}
