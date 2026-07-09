import Image from "next/image";
import { cn } from "@lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "mark";
}

const heights = { sm: 28, md: 36, lg: 52 };

/** Expanded sidebar / login — logo_expandido.png (236×149) */
const EXPANDED_ASPECT = 236 / 149;

export function Logo({ className, size = "md", variant = "full" }: LogoProps) {
  const h = heights[size];

  if (variant === "mark") {
    return (
      <Image
        src="/logo_comp.jpeg"
        alt="Media Capital"
        width={h}
        height={h}
        className={cn("object-contain", className)}
        priority
      />
    );
  }

  const w = Math.round(h * EXPANDED_ASPECT);

  return (
    <Image
      src="/logo_expandido.png"
      alt="Media Capital"
      width={w}
      height={h}
      className={cn("object-contain", className)}
      priority
    />
  );
}
