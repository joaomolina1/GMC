"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { cn } from "@lib/utils";
import { sb } from "../_lib/contexto";
import { Av, Button, Card, inputSm, Loading, Note } from "./ui";

interface Linha {
  id: number;
  em: string;
  acao: string;
  detalhe: string;
  autor: string;
}

const PAG = 100;

export function Registo() {
  const [q, setQ] = useState("");
  const [limite, setLimite] = useState(PAG);
  const { data, isLoading, error } = useQuery({
    queryKey: ["escalas", "registo", q, limite],
    queryFn: async () => {
      let qb = sb().from("escala_registo").select("id, em, acao, detalhe, autor").order("em", { ascending: false }).limit(limite);
      const t = q.trim().replace(/[%,()]/g, " ");
      if (t) qb = qb.or(`acao.ilike.%${t}%,detalhe.ilike.%${t}%`);
      const { data, error } = await qb;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Linha[];
    },
    placeholderData: (p) => p,
  });

  return (
    <Card
      title="Registo de alterações"
      sub="Quem alterou o quê. Não pode ser editado nem apagado."
      actions={<input className={cn(inputSm, "w-56")} placeholder="Filtrar registo" value={q} onChange={(e) => setQ(e.target.value)} />}
    >
      {error && <Note kind="bad">{(error as Error).message}</Note>}
      {isLoading && <Loading />}
      {data && !data.length && <Note>Sem registos.</Note>}
      {data?.map((e) => {
        const dt = new Date(e.em);
        return (
          <div key={e.id} className="flex items-start gap-3 border-b border-line py-2.5 last:border-0">
            <Av>
              <History size={15} />
            </Av>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-slate-900">{e.acao}</div>
              <div className="text-xs text-slate-500">{e.detalhe}</div>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500">
              {dt.toLocaleDateString("pt-PT")} {dt.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })}
              <br />
              {e.autor || "sistema"}
            </div>
          </div>
        );
      })}
      {data && data.length >= limite && (
        <div className="pt-3 text-center">
          <Button size="sm" variant="outline" onClick={() => setLimite(limite + PAG)}>
            Ver mais
          </Button>
        </div>
      )}
    </Card>
  );
}
