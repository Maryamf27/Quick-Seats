"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { getLoginHref } from "@/lib/auth/navigation";

type SignInLinkProps = {
  children?: ReactNode;
  className?: string;
  asButton?: boolean;
  size?: "small" | "medium" | "large";
};

/** Links to /login and brings the user back to the page they were on. */
export function SignInLink({ children = "Sign in", className, asButton = false, size }: SignInLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const href = getLoginHref(pathname ?? "/");

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    const { pathname: path, search, hash } = window.location;
    router.push(getLoginHref(`${path}${search}${hash}`));
  }

  if (asButton) {
    return (
      <Button href={href} size={size} className={className} onClick={handleClick}>
        {children}
      </Button>
    );
  }
  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}
