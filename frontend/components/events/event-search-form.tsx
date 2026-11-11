"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EventSearchForm({
  initialSearch = "",
  compact = false,
}: {
  initialSearch?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (search.trim()) {
      params.set("search", search.trim());
    }
    router.push(`/events${params.size > 0 ? `?${params.toString()}` : ""}`);
  }

  return (
    <form
      className={["event-search", compact ? "event-search--compact" : ""]
        .filter(Boolean)
        .join(" ")}
      role="search"
      onSubmit={submit}
    >
      <Input
        label="Search events"
        type="search"
        name="search"
        placeholder="Artist, event, or experience"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <Button type="submit" size="large">
        Search events
      </Button>
    </form>
  );
}
