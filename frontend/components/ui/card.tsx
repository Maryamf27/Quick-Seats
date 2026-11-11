import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: "standard" | "elevated" | "interactive";
  children: ReactNode;
}

export function Card({
  variant = "standard",
  className,
  children,
  ...props
}: CardProps) {
  return (
    <div
      {...props}
      className={[
        "ui-card",
        variant === "standard" ? "" : `ui-card--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
