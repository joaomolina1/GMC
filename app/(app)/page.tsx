import { createClient } from "@lib/supabase/server";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";
import { Bot, MessageSquare, Zap, Euro } from "lucide-react";
import Link from "next/link";
import { formatCost } from "@lib/utils";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ count: agentCount }, { count: conversationCount }, { data: usage }] = await Promise.all([
    supabase.from("agents").select("*", { count: "exact", head: true }).eq("owner_id", user!.id),
    supabase.from("conversations").select("*", { count: "exact", head: true }).eq("user_id", user!.id),
    supabase
      .from("usage_logs")
      .select("cost_eur")
      .eq("user_id", user!.id)
      .gte("created_at", new Date(new Date().setDate(1)).toISOString()),
  ]);

  const monthlyCost = (usage ?? []).reduce((sum, r) => sum + Number(r.cost_eur), 0);

  const stats = [
    { label: "Agentes", value: agentCount ?? 0, icon: Bot, href: "/agents" },
    { label: "Conversas", value: conversationCount ?? 0, icon: MessageSquare, href: "/agents" },
    { label: "Skills Core", value: 4, icon: Zap, href: "/agents" },
    { label: "Custo (mês)", value: formatCost(monthlyCost), icon: Euro, href: "/admin/costs" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-gray-500">Bem-vindo à plataforma de agentes IA do Grupo Media Capital</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <Card className="transition-shadow hover:shadow-md">
              <div className="flex items-center gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#0066B3]/10 text-[#0066B3]">
                  <Icon size={20} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">{label}</p>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Início Rápido</CardTitle>
          </CardHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-600">
            <li>Criar um novo agente em <Link href="/agents/new" className="text-[#0066B3] hover:underline">Agentes → Novo</Link></li>
            <li>Configurar prompt, skills e knowledge base</li>
            <li>Conversar com o agente e testar skills (PDF, Vision, Web Search, RAG)</li>
            <li>Publicar versão e fazer rollback se necessário</li>
          </ol>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Skills Core (Fase 1)</CardTitle>
          </CardHeader>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>🔍 <strong>Web Search</strong> — pesquisa na internet</li>
            <li>📄 <strong>Read Document</strong> — PDF, Word, Excel, CSV</li>
            <li>👁 <strong>Vision</strong> — análise de imagens</li>
            <li>📚 <strong>Knowledge Search</strong> — RAG semântico</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
