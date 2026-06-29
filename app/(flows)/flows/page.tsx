import { Workflow } from "lucide-react";
import { Card } from "@/_design_system/Card";
import { Badge } from "@/_design_system/Badge";

export default function FlowsPage() {
  return (
    <Card className="flex flex-col items-center justify-center py-20 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <Workflow size={32} />
      </div>
      <Badge tone="brand" className="mt-5">
        Fase 5
      </Badge>
      <h2 className="mt-3 text-lg font-semibold text-slate-900">Flow Builder — Em breve</h2>
      <p className="mt-1 max-w-md text-sm text-slate-500">
        Editor visual de nós, execução, logs e versionamento. As tabelas flows, flow_versions e
        flow_runs já foram criadas.
      </p>
    </Card>
  );
}
