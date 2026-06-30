import Image from "next/image";
import { cn } from "@lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "mark";
}

const sizes = { sm: 28, md: 34, lg: 48 };

export function Logo({ className, size = "md", variant = "full" }: LogoProps) {
  const h = sizes[size];

  if (variant === "mark") {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 font-bold text-white shadow-sm",
          className
        )}
        style={{ width: h, height: h, fontSize: h * 0.5 }}
        aria-label="Media Capital"
      >
        m
        <span
          className="absolute rounded-full bg-accent-500"
          style={{ width: h * 0.22, height: h * 0.22, top: h * 0.16, right: h * 0.16 }}
        />
      </div>
    );
  }

  return (
    <Image
      src="/logo.svg"
      alt="Media Capital"
      width={h * 4.2}
      height={h}
      className={cn("object-contain", className)}
      priority
    />
  );
}
