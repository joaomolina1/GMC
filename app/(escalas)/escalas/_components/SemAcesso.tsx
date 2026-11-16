"use client";

import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Button } from "@/_design_system/Button";

export function SemAcessoEscalas() {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <CalendarDays size={22} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Sem acesso às Escalas</h1>
        <p className="mt-2 text-sm text-slate-500">
          A sua conta não está associada a nenhuma pessoa ativa da escala. Contacte a coordenação.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={async () => {
            await createClient().auth.signOut();
            router.replace("/escalas/entrar");
            router.refresh();
          }}
        >
          Terminar sessão
        </Button>
      </div>
    </div>
  );
}
