"use client";

import { useState } from "react";
import { useWallet } from "./WalletProvider";

export function SaveSeriesButton({ seriesId, initialSaved }: { seriesId: string; initialSaved: boolean }) {
  const { api, toast } = useWallet();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    const on = !saved;
    setSaved(on);
    setBusy(true);
    try {
      await api("/api/tvibox/list", { seriesId, on });
      toast(on ? "Guardado em A Minha Lista" : "Removido de A Minha Lista");
    } catch {
      setSaved(!on);
      toast("Não foi possível guardar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" className={saved ? "on" : ""} onClick={toggle} aria-pressed={saved} aria-label="Guardar série">
      🔖
    </button>
  );
}
