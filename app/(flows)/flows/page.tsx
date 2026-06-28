import { Card, CardHeader, CardTitle } from "@/_design_system/Card";

export default function FlowsPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Flow Builder</h2>
      <Card>
        <CardHeader><CardTitle>Fase 5 — Em breve</CardTitle></CardHeader>
        <p className="text-gray-500">
          Editor visual de nós, execução, logs e versionamento.
          Tabelas flows, flow_versions, flow_runs já criadas.
        </p>
      </Card>
    </div>
  );
}
