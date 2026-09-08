"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/_design_system/Button";
import { Card, CardHeader, CardTitle } from "@/_design_system/Card";

const MAX_OUTPUT = 1600;

/** Recorta a imagem no browser (canvas) e devolve um JPEG quadrado até 1600px. */
export async function cropToBlob(src: string, area: Area, maxOutput = MAX_OUTPUT): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Não foi possível ler a imagem"));
    el.src = src;
  });
  const size = Math.round(Math.min(area.width, area.height));
  const out = Math.min(size, maxOutput);
  const canvas = document.createElement("canvas");
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, area.x, area.y, size, size, 0, 0, out, out);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem"))), "image/jpeg", 0.92)
  );
}

/**
 * Modal de recorte quadrado (react-easy-crop) com pré-visualização de como fica no avatar
 * circular do ecrã do pivot (fundo azul-escuro, contorno claro).
 */
export function PhotoCropper({ file, name, onCancel, onConfirm, busy }: { file: File; name: string; onCancel: () => void; onConfirm: (blob: Blob) => void; busy: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const onComplete = useCallback((_: Area, pixels: Area) => setArea(pixels), []);

  useEffect(() => {
    if (!src || !area) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const blob = await cropToBlob(src, area, 240);
        if (cancelled) return;
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
      } catch {
        /* pré-visualização é opcional */
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [src, area]);

  async function confirm() {
    if (!src || !area) return;
    setError(null);
    try {
      onConfirm(await cropToBlob(src, area));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro no recorte");
    }
  }

  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <Card className="w-full max-w-3xl">
        <CardHeader>
          <CardTitle>Recortar fotografia — {name}</CardTitle>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>Cancelar</Button>
        </CardHeader>
        <div className="grid gap-5 md:grid-cols-[1fr_220px]">
          <div>
            <div className="relative h-[380px] overflow-hidden rounded-xl bg-slate-900">
              {src && (
                <Cropper
                  image={src}
                  crop={crop}
                  zoom={zoom}
                  aspect={1}
                  cropShape="round"
                  showGrid={false}
                  onCropChange={setCrop}
                  onZoomChange={setZoom}
                  onCropComplete={onComplete}
                />
              )}
            </div>
            <label className="mt-3 flex items-center gap-3 text-xs text-slate-500">
              Zoom
              <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1" />
            </label>
            <p className="mt-1 text-xs text-slate-400">Arrasta para enquadrar; o recorte é sempre quadrado. Guardamos versões de 256px e 800px em WEBP.</p>
          </div>
          <div className="flex flex-col items-center gap-3 rounded-xl p-4" style={{ background: "linear-gradient(160deg,#0a1a4c 0%,#040b22 72%)" }}>
            <p className="text-xs font-semibold text-white/60">No ecrã do pivot</p>
            {[118, 72].map((size) => (
              <div
                key={size}
                className="grid place-items-center overflow-hidden rounded-full font-semibold text-white"
                style={{ width: size, height: size, border: "2px solid rgba(255,255,255,.35)", background: "linear-gradient(150deg,rgba(255,255,255,.16),rgba(255,255,255,.03))", fontSize: size * 0.3 }}
              >
                {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : "…"}
              </div>
            ))}
            <p className="text-center text-[11px] text-white/50">{name}</p>
          </div>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button onClick={confirm} disabled={busy || !area}>{busy ? "A carregar…" : "Guardar fotografia"}</Button>
        </div>
      </Card>
    </div>
  );
}
