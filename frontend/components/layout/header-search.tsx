"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function HeaderSearch() {
  const router = useRouter();
  const [value, setValue] = useState("");

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const q = value.trim();
    router.push(q ? `/events?search=${encodeURIComponent(q)}` : "/events");
  }

  return (
    <form className="topbar-search" role="search" onSubmit={submit}>
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm9 16-4-4" />
      </svg>
      <input
        type="search"
        aria-label="Search events"
        placeholder="Search for events, artists, venues"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </form>
  );
}
