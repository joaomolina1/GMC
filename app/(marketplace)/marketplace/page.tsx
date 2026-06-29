import { Card, CardHeader, CardTitle } from "@/_design_system/Card";

export default function MarketplacePage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Marketplace</h2>
      <Card>
        <CardHeader><CardTitle>Fase 3 — Em breve</CardTitle></CardHeader>
        <p className="text-gray-500">
          Agentes públicos, pesquisa, tags, favoritos, seguir e clonar.
          A arquitetura de dados já está preparada.
        </p>
      </Card>
    </div>
  );
}
