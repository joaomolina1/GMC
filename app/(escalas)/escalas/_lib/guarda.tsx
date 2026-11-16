"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal } from "../_components/ui";

/**
 * Guarda de saída: enquanto uma página tem alterações por gravar, sair dela
 * (menu, links, terminar sessão) pergunta se é para guardar ou descartar.
 * Fechar o separador ou recarregar mostra o aviso nativo do navegador.
 */
interface Registo {
  sujo: boolean;
  guardar: () => Promise<boolean>;
  descartar?: () => void;
}

interface Guarda {
  registar: (r: Registo | null) => void;
  /** Corre `acao` já, ou depois de o utilizador decidir o que fazer às alterações. */
  sair: (acao: () => void) => void;
}

const Ctx = createContext<Guarda | null>(null);

export function useGuarda() {
  const g = useContext(Ctx);
  if (!g) throw new Error("useGuarda fora do GuardaProvider");
  return g;
}

/** Regista a página atual: `sujo` e a função que grava (devolve true se gravou). */
export function useGuardaSaida(sujo: boolean, guardar: () => Promise<boolean>, descartar?: () => void) {
  const { registar } = useGuarda();
  const ref = useRef({ guardar, descartar });
  ref.current = { guardar, descartar };
  useEffect(() => {
    registar({ sujo, guardar: () => ref.current.guardar(), descartar: () => ref.current.descartar?.() });
  }, [sujo, registar]);
  useEffect(() => () => registar(null), [registar]);
}

export function GuardaProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const atual = useRef<Registo | null>(null);
  const [pendente, setPendente] = useState<(() => void) | null>(null);
  const [aGravar, setAGravar] = useState(false);

  const registar = useCallback((r: Registo | null) => {
    atual.current = r;
  }, []);

  const sair = useCallback((acao: () => void) => {
    if (atual.current?.sujo) setPendente(() => acao);
    else acao();
  }, []);

  // Links internos (menu lateral, cartões, etc.): intercetados antes do Next.js os seguir.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!atual.current?.sujo || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPendente(() => () => router.push(url.pathname + url.search + url.hash));
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!atual.current?.sujo) return;
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [router]);

  const continuar = (acao: () => void) => {
    atual.current = null;
    setPendente(null);
    acao();
  };

  return (
    <Ctx.Provider value={{ registar, sair }}>
      {children}
      <Modal
        open={!!pendente}
        title="Alterações por guardar"
        onClose={() => !aGravar && setPendente(null)}
        footer={
          <>
            <Button variant="outline" size="sm" disabled={aGravar} onClick={() => setPendente(null)}>
              Continuar a editar
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={aGravar}
              onClick={() => {
                atual.current?.descartar?.();
                if (pendente) continuar(pendente);
              }}
            >
              Descartar
            </Button>
            <Button
              size="sm"
              disabled={aGravar}
              onClick={async () => {
                if (!pendente || !atual.current) return;
                setAGravar(true);
                const ok = await atual.current.guardar().catch(() => false);
                setAGravar(false);
                if (ok) continuar(pendente);
              }}
            >
              {aGravar ? "A guardar…" : "Guardar e sair"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-700">Tem alterações que ainda não foram guardadas. O que quer fazer antes de sair?</p>
      </Modal>
    </Ctx.Provider>
  );
}
