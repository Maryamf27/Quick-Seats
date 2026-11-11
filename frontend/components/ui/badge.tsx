import type { HTMLAttributes, ReactNode } from "react";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: "default" | "success" | "warning" | "danger";
  children: ReactNode;
}

export function Badge({
  tone = "default",
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={["ui-badge", tone === "default" ? "" : `ui-badge--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
