"use client";

import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { createClient } from "@lib/supabase/client";
import { Logo } from "@/_components/Logo";
import { Button } from "@/_design_system/Button";

export default function SemAcesso() {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center">
          <Logo variant="full" size="md" />
        </div>
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <Lock size={22} />
        </div>
        <h1 className="text-xl font-bold text-slate-900">Sem acesso</h1>
        <p className="mt-2 text-sm text-slate-500">
          A sua conta ainda não tem nenhuma área da plataforma atribuída. Contacte o administrador.
        </p>
        <Button
          variant="outline"
          className="mt-6"
          onClick={async () => {
            await createClient().auth.signOut();
            router.replace("/login");
          }}
        >
          Terminar sessão
        </Button>
      </div>
    </div>
  );
}
