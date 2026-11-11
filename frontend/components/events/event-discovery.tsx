"use client";

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { eventsApi } from "@/lib/api/events";
import { ApiError } from "@/lib/api/errors";
import type { EventListResult, EventRecord } from "@/lib/api/types";
import { EventCard } from "./event-card";
import { EventSearchForm } from "./event-search-form";

const DISCOVERY_PAGE_SIZE = 12;

interface DiscoveryFilters {
  search: string;
  category: string;
  city: string;
  from: string;
  to: string;
  sortBy: "startDate" | "createdAt";
  order: "asc" | "desc";
  page: number;
}

function parseFilters(params: URLSearchParams): DiscoveryFilters {
  const pageValue = Number(params.get("page") ?? 1);
  const sortBy = params.get("sortBy");
  const order = params.get("order");
  return {
    search: params.get("search") ?? "",
    category: params.get("category") ?? "",
    city: params.get("city") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    sortBy: sortBy === "createdAt" ? "createdAt" : "startDate",
    order: order === "desc" ? "desc" : "asc",
    page: Number.isSafeInteger(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

function toQuery(filters: DiscoveryFilters) {
  return {
    page: filters.page,
    limit: DISCOVERY_PAGE_SIZE,
    search: filters.search.trim() || undefined,
    category: filters.category || undefined,
    city: filters.city.trim() || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sortBy: filters.sortBy,
    order: filters.order,
  };
}

function buildUrl(filters: DiscoveryFilters): string {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.category) params.set("category", filters.category);
  if (filters.city.trim()) params.set("city", filters.city.trim());
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.sortBy !== "startDate") params.set("sortBy", filters.sortBy);
  if (filters.order !== "asc") params.set("order", filters.order);
  if (filters.page > 1) params.set("page", String(filters.page));
  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

function getResultError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "Events could not be loaded. Please try again.";
}

function getCategories(events: EventRecord[]): string[] {
  return [...new Set(events.map((event) => event.category.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function DiscoveryContent({
  home = false,
}: {
  home?: boolean;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  const query = useMemo(
    () => ({
      ...toQuery(filters),
      page: home ? 1 : filters.page,
      limit: home ? 6 : DISCOVERY_PAGE_SIZE,
    }),
    [filters, home],
  );
  const queryKey = JSON.stringify(query);
  const [response, setResponse] = useState<{
    key: string;
    result: EventListResult;
  } | null>(null);
  const [requestError, setRequestError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const [retryIndex, setRetryIndex] = useState(0);
  const requestId = useRef(0);
  const activeController = useRef<AbortController | null>(null);
  const requestKey = `${queryKey}:${retryIndex}`;
  const result = response?.key === requestKey ? response.result : null;
  const error = requestError?.key === requestKey ? requestError.message : "";
  const loading = !result && !error;

  useEffect(() => {
    activeController.current?.abort();
    const currentRequestId = ++requestId.current;
    const controller = new AbortController();
    activeController.current = controller;

    void eventsApi
      .list(query, { signal: controller.signal })
      .then((nextResult) => {
        if (currentRequestId === requestId.current) {
          setResponse({ key: requestKey, result: nextResult });
        }
      })
      .catch((requestError: unknown) => {
        if (currentRequestId === requestId.current && !controller.signal.aborted) {
          setRequestError({ key: requestKey, message: getResultError(requestError) });
        }
      })
      .finally(() => {
        if (currentRequestId === requestId.current) {
          activeController.current = null;
        }
      });

    return () => {
      controller.abort();
      requestId.current += 1;
    };
  }, [query, requestKey]);

  const pageEvents = useMemo(() => result?.events ?? [], [result]);
  const categories = useMemo(() => getCategories(pageEvents), [pageEvents]);
  const hasActiveFilters = Boolean(
    filters.search ||
      filters.category ||
      filters.city ||
      filters.from ||
      filters.to ||
      filters.sortBy !== "startDate" ||
      filters.order !== "asc",
  );

  function updateFilters(
    changes: Partial<DiscoveryFilters>,
    replace = false,
  ) {
    const next = { ...filters, ...changes };
    if (
      changes.search !== undefined ||
      changes.category !== undefined ||
      changes.city !== undefined ||
      changes.from !== undefined ||
      changes.to !== undefined ||
      changes.sortBy !== undefined ||
      changes.order !== undefined
    ) {
      next.page = 1;
    }
    const url = buildUrl(next);
    if (url !== `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`) {
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    }
  }

  function clearFilters() {
    router.push(pathname, { scroll: false });
  }

  function applyCity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const city = new FormData(event.currentTarget).get("city");
    if (typeof city === "string") {
      updateFilters({ city: city.trim() });
    }
  }

  const eventsSection = (
    <>
      {home ? (
        <div className="discovery-intro">
          <div>
            <span className="eyebrow">Good things are happening</span>
            <h2 className="section-heading">Find your next favourite memory.</h2>
          </div>
          <p className="discovery-intro__body">
            Browse upcoming events drawn directly from the QuickSeats event
            listings.
          </p>
        </div>
      ) : (
        <div className="events-page__intro">
          <span className="eyebrow">The live calendar</span>
          <h1 className="events-page__title">Find your next unforgettable experience.</h1>
          <p className="events-page__description">
            Search published events, then narrow by category, city, date, or
            order.
          </p>
          <EventSearchForm
            key={filters.search}
            initialSearch={filters.search}
            compact
          />
        </div>
      )}

      {!home ? (
        <section className="event-filters" aria-label="Filter events">
          <form
            className="event-filter__city"
            key={filters.city}
            onSubmit={applyCity}
          >
            <label htmlFor="event-city">City</label>
            <div>
              <input
                id="event-city"
                name="city"
                type="search"
                defaultValue={filters.city}
                placeholder="Filter by city"
              />
              <Button type="submit" size="small" variant="secondary">
                Apply
              </Button>
            </div>
          </form>
          <label className="event-filter__control">
            <span>From</span>
            <input
              type="date"
              value={filters.from}
              max={filters.to || undefined}
              onChange={(event) => updateFilters({ from: event.target.value })}
            />
          </label>
          <label className="event-filter__control">
            <span>To</span>
            <input
              type="date"
              value={filters.to}
              min={filters.from || undefined}
              onChange={(event) => updateFilters({ to: event.target.value })}
            />
          </label>
          <label className="event-filter__control">
            <span>Sort by</span>
            <select
              value={`${filters.sortBy}:${filters.order}`}
              onChange={(event) => {
                const [sortBy, order] = event.target.value.split(":");
                updateFilters({
                  sortBy: sortBy === "createdAt" ? "createdAt" : "startDate",
                  order: order === "desc" ? "desc" : "asc",
                });
              }}
            >
              <option value="startDate:asc">Soonest first</option>
              <option value="startDate:desc">Latest date first</option>
              <option value="createdAt:desc">Recently added</option>
              <option value="createdAt:asc">Oldest added</option>
            </select>
          </label>
          {hasActiveFilters ? (
            <Button type="button" size="small" variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </section>
      ) : null}

      {!home && categories.length > 0 ? (
        <nav className="event-categories" aria-label="Categories in these results">
          <span>Categories in these results</span>
          <div className="event-categories__list">
            <Button
              type="button"
              size="small"
              variant={filters.category ? "secondary" : "dark"}
              aria-pressed={!filters.category}
              onClick={() => updateFilters({ category: "" })}
            >
              All
            </Button>
            {categories.map((category) => (
              <Button
                key={category}
                type="button"
                size="small"
                variant={filters.category.toLowerCase() === category.toLowerCase() ? "dark" : "secondary"}
                aria-pressed={filters.category.toLowerCase() === category.toLowerCase()}
                onClick={() => updateFilters({ category })}
              >
                {category}
              </Button>
            ))}
          </div>
        </nav>
      ) : null}

      <div className={home ? "events-home__results" : "events-page__results"}>
        <div className="events-results__heading">
          <h2>{home ? "Upcoming events" : "Events"}</h2>
          {!loading && result ? (
            <span>
              {result.pagination.total}{" "}
              {result.pagination.total === 1 ? "event" : "events"}
            </span>
          ) : null}
        </div>

        {loading && !result ? (
          <LoadingState label="Finding events…" />
        ) : error && !result ? (
          <ErrorState
            title="Events are unavailable right now"
            description={error}
            onRetry={() => setRetryIndex((index) => index + 1)}
          />
        ) : pageEvents.length === 0 ? (
          <div className="events-empty">
            <h3>{hasActiveFilters ? "No events match those filters." : "No published events yet."}</h3>
            <p>
              {hasActiveFilters
                ? "Try another search or clear some filters."
                : "Check back soon for upcoming experiences."}
            </p>
            {hasActiveFilters ? (
              <Button type="button" variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {error ? (
              <p className="events-inline-error" role="status">
                The latest results could not be refreshed. Showing the last
                successfully loaded results.
              </p>
            ) : null}
            <div className={home ? "event-grid event-grid--home" : "event-grid"}>
              {pageEvents.map((event) => (
                <EventCard key={event._id} event={event} />
              ))}
            </div>
            {!home && result ? (
              <nav className="event-pagination" aria-label="Event pages">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loading || filters.page <= 1}
                  onClick={() => updateFilters({ page: filters.page - 1 })}
                >
                  Previous
                </Button>
                <span aria-live="polite">
                  Page {result.pagination.page} of {Math.max(result.pagination.totalPages, 1)}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    loading ||
                    result.pagination.totalPages === 0 ||
                    filters.page >= result.pagination.totalPages
                  }
                  onClick={() => updateFilters({ page: filters.page + 1 })}
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </>
        )}
      </div>

      {home ? (
        <div className="events-home__more">
          <Button href="/events" variant="secondary">
            Explore all events
          </Button>
        </div>
      ) : null}
    </>
  );

  return eventsSection;
}

export function EventDiscovery({ home = false }: { home?: boolean }) {
  return (
    <Suspense fallback={<LoadingState label="Preparing event discovery…" />}>
      <DiscoveryContent home={home} />
    </Suspense>
  );
}
