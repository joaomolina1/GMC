import Image from "next/image";
import { cn } from "@lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: 24, md: 32, lg: 48 };

export function Logo({ className, size = "md" }: LogoProps) {
  const h = sizes[size];
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
