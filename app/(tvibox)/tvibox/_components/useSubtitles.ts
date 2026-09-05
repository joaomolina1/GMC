"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "tvibox.cc";
const EVENT = "tvibox:cc";

function read(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Legendas: desligadas por defeito e só lembradas durante a sessão do separador
 * (sessionStorage). Não há persistência na conta — cada sessão começa sem legendas.
 */
export function useSubtitles(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(read());
    const sync = () => setOn(read());
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const set = useCallback((next: boolean) => {
    try {
      window.sessionStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* modo privado sem storage: fica só em memória */
    }
    setOn(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [on, set];
}
