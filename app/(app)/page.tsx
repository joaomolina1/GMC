import { createClient } from "@lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import {
  Bot,
  MessageSquare,
  Zap,
  Euro,
  Plus,
  ArrowRight,
  Search,
  FileText,
  Eye,
  Library,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { formatCost } from "@lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ count: agentCount }, { count: conversationCount }, { data: usage }, { data: profile }] =
    await Promise.all([
      supabase.from("agents").select("*", { count: "exact", head: true }).eq("owner_id", user!.id),
      supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id),
      supabase
        .from("usage_logs")
        .select("cost_eur")
        .eq("user_id", user!.id)
        .gte("created_at", new Date(new Date().setDate(1)).toISOString()),
      supabase.from("profiles").select("full_name").eq("id", user!.id).single(),
    ]);

  const monthlyCost = (usage ?? []).reduce((sum, r) => sum + Number(r.cost_eur), 0);
  const firstName = (profile?.full_name ?? user?.email ?? "").split(" ")[0] || "Bem-vindo";

  const stats = [
    { label: "Agentes", value: agentCount ?? 0, icon: Bot, href: "/agents", tone: "brand" },
    {
      label: "Conversas",
      value: conversationCount ?? 0,
      icon: MessageSquare,
      href: "/agents",
      tone: "violet",
    },
    { label: "Skills Core", value: 4, icon: Zap, href: "/agents", tone: "amber" },
    { label: "Custo (mês)", value: formatCost(monthlyCost), icon: Euro, href: "/admin", tone: "emerald" },
  ] as const;

  const toneStyles: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600",
    violet: "bg-violet-50 text-violet-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };

  const skills = [
    { icon: Search, name: "Web Search", desc: "Pesquisa na internet em tempo real", tone: "bg-sky-50 text-sky-600" },
    { icon: FileText, name: "Read Document", desc: "PDF, Word, Excel e CSV", tone: "bg-rose-50 text-rose-600" },
    { icon: Eye, name: "Vision", desc: "Análise e interpretação de imagens", tone: "bg-violet-50 text-violet-600" },
    { icon: Library, name: "Knowledge Search", desc: "RAG semântico com embeddings Voyage AI", tone: "bg-emerald-50 text-emerald-600" },
  ];

  const quickActions = [
    { icon: Plus, label: "Novo agente", desc: "Criar do zero", href: "/agents/new" },
    { icon: Bot, label: "Os meus agentes", desc: "Ver e gerir", href: "/agents" },
    { icon: Sparkles, label: "Backoffice", desc: "Métricas e custos", href: "/admin" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 via-brand-500 to-accent-500 p-7 text-white shadow-[var(--shadow-card)] sm:p-8">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-16 right-24 h-52 w-52 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-white/80">Plataforma de Agentes IA · Grupo Media Capital</p>
            <h2 className="mt-1 text-2xl font-bold sm:text-3xl">Olá, {firstName} 👋</h2>
            <p className="mt-2 max-w-xl text-sm text-white/85">
              Crie, configure e converse com agentes de IA. Comece por criar o seu primeiro agente ou
              explore os existentes.
            </p>
          </div>
          <Link
            href="/agents/new"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-brand-700 shadow-sm transition-transform hover:scale-[1.02] active:scale-100"
          >
            <Plus size={18} />
            Novo agente
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href, tone }) => (
          <Link key={label} href={href}>
            <Card interactive className="h-full">
              <div className="flex items-center justify-between">
                <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${toneStyles[tone]}`}>
                  <Icon size={22} />
                </div>
                <ArrowRight size={18} className="text-slate-300" />
              </div>
              <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
              <p className="mt-1 text-sm text-slate-500">{label}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader>
          <CardTitle>Ações rápidas</CardTitle>
        </CardHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {quickActions.map(({ icon: Icon, label, desc, href }) => (
            <Link
              key={label}
              href={href}
              className="group flex items-center gap-3 rounded-xl border border-line bg-slate-50/60 p-4 transition-all hover:border-brand-200 hover:bg-brand-50/50"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-white shadow-sm transition-transform group-hover:scale-105">
                <Icon size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{label}</p>
                <p className="text-xs text-slate-500">{desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Two column */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Como começar</CardTitle>
          </CardHeader>
          <ol className="space-y-4">
            {[
              { t: "Criar um agente", d: "Defina nome, descrição e objetivo." },
              { t: "Configurar", d: "Prompt, skills e base de conhecimento." },
              { t: "Conversar e testar", d: "PDF, Vision, Web Search e RAG." },
              { t: "Publicar versão", d: "Com rollback sempre que precisar." },
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-slate-800">{step.t}</p>
                  <p className="text-sm text-slate-500">{step.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Skills Core (Fase 1–2)</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {skills.map(({ icon: Icon, name, desc, tone }) => (
              <div
                key={name}
                className="flex items-start gap-3 rounded-xl border border-line p-4 transition-colors hover:bg-slate-50"
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}>
                  <Icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{name}</p>
                  <p className="text-xs text-slate-500">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
