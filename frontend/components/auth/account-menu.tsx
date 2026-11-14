"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import type { UserRole } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { getRoleLabel } from "@/lib/auth/role-label";

type MenuItem = { href: string; label: string; icon: ReactNode };

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

const icons = {
  dashboard: (
    <Icon>
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    </Icon>
  ),
  ticket: (
    <Icon>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h13A2.5 2.5 0 0 1 21 8.5v1a2.5 2.5 0 0 0 0 5v1a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 15.5v-1a2.5 2.5 0 0 0 0-5z" />
      <path d="M14.5 6v12" strokeDasharray="2.2 2.6" />
    </Icon>
  ),
  calendar: (
    <Icon>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Icon>
  ),
  user: (
    <Icon>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Icon>
  ),
  plus: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </Icon>
  ),
  signOut: (
    <Icon>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 16l-4-4 4-4M6 12h10" />
    </Icon>
  ),
};

export function getAccountMenuItems(role: UserRole): MenuItem[] {
  const settings = { href: "/account", label: "Account settings", icon: icons.user };
  if (role === "ORGANIZER") {
    return [
      { href: "/organizer/dashboard", label: "Organizer dashboard", icon: icons.dashboard },
      { href: "/organizer/events", label: "My events", icon: icons.calendar },
      { href: "/organizer/bookings", label: "Event bookings", icon: icons.ticket },
      settings,
    ];
  }
  if (role === "ADMIN") {
    return [
      { href: "/admin/dashboard", label: "Admin dashboard", icon: icons.dashboard },
      settings,
    ];
  }
  return [
    { href: "/dashboard", label: "Dashboard", icon: icons.dashboard },
    { href: "/dashboard/bookings", label: "My bookings", icon: icons.ticket },
    settings,
    { href: "/become-organizer", label: "Become an organizer", icon: icons.plus },
  ];
}

export function getInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0]?.[0] ?? "U");
  return letters.toUpperCase();
}

export function AccountMenu() {
  const { user, signOut } = useAuth();
  const { notify } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>("[role='menuitem']")?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Home" && event.key !== "End") return;
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>("[role='menuitem']") ?? []);
      if (items.length === 0) return;
      event.preventDefault();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
        : event.key === "ArrowDown" ? (index + 1) % items.length
        : (index - 1 + items.length) % items.length;
      items[next]?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      notify("You have been signed out on this device. The service could not confirm the logout.", "warning");
    } finally {
      setSigningOut(false);
      setOpen(false);
      router.replace("/");
    }
  }

  const firstName = user.fullName.split(" ")[0];

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="account-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`Account menu for ${user.fullName}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="account-menu__avatar" aria-hidden="true">{getInitials(user.fullName)}</span>
        <span className="account-menu__name">{firstName}</span>
        <svg className="account-menu__chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <div className="account-menu__panel" id={menuId} role="menu" aria-label="Account" ref={menuRef}>
          <div className="account-menu__identity">
            <span className="account-menu__avatar account-menu__avatar--large" aria-hidden="true">{getInitials(user.fullName)}</span>
            <span className="account-menu__identity-copy">
              <strong>{user.fullName}</strong>
              <small>{user.email}</small>
            </span>
            <span className="account-menu__role">{getRoleLabel(user.role)}</span>
          </div>
          <div className="account-menu__items">
            {getAccountMenuItems(user.role).map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  role="menuitem"
                  className={`account-menu__item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="account-menu__footer">
            <button
              type="button"
              role="menuitem"
              className="account-menu__item account-menu__item--danger"
              disabled={signingOut}
              onClick={() => void handleSignOut()}
            >
              {icons.signOut}
              <span>{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
