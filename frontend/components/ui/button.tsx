"use client";

import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

type ButtonStyleProps = {
  variant?: "primary" | "secondary" | "dark" | "destructive";
  size?: "small" | "medium" | "large";
  loading?: boolean;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
};

type NativeButtonProps = ButtonStyleProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "disabled"> & {
    href?: never;
  };

type LinkButtonProps = ButtonStyleProps &
  Omit<
    AnchorHTMLAttributes<HTMLAnchorElement>,
    "className" | "children" | "href" | "aria-disabled"
  > & {
    href: string;
  };

export type ButtonProps = NativeButtonProps | LinkButtonProps;

export function Button({
  variant = "primary",
  size = "medium",
  loading = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const classes = [
    "ui-button",
    `ui-button--${variant}`,
    size === "medium" ? "" : `ui-button--${size}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {loading ? <span className="ui-button__spinner" aria-hidden="true" /> : null}
      {children}
    </>
  );

  if ("href" in props && typeof props.href === "string") {
    const { href, ...linkProps } = props;
    return (
      <Link
        {...linkProps}
        href={href}
        className={classes}
        aria-disabled={disabled || loading || undefined}
        tabIndex={disabled || loading ? -1 : linkProps.tabIndex}
        onClick={(event) => {
          if (disabled || loading) {
            event.preventDefault();
            return;
          }
          linkProps.onClick?.(event);
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button
      {...props}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {content}
    </button>
  );
}
