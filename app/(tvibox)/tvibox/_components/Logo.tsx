import { cn } from "@lib/utils";

interface Props {
  /** Tamanho da fonte em px (a marca escala proporcionalmente). */
  size?: number;
  /** "row": tvi box lado a lado; "stack": box por baixo (à TVI Ficção). */
  layout?: "row" | "stack";
  className?: string;
}

/**
 * Marca TVI BOX: letras minúsculas pesadas com o corte diagonal da identidade TVI
 * (azul / laranja / amarelo em "tvi", vermelho em "box").
 */
export function TviBoxLogo({ size = 22, layout = "row", className }: Props) {
  return (
    <span
      className={cn("tb-logo", layout === "stack" && "stack", className)}
      style={{ fontSize: size }}
      aria-label="TVI BOX"
      role="img"
    >
      <span className="w tvi" aria-hidden>
        <span className="base">tvi</span>
        <span className="cut">
          <i>t</i>
          <i>v</i>
          <i>i</i>
        </span>
      </span>
      <span className="w box" aria-hidden>
        <span className="base">box</span>
        <span className="cut">
          <i>b</i>
          <i>o</i>
          <i>x</i>
        </span>
      </span>
    </span>
  );
}
