"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/states";
import { API_UNAUTHORIZED_EVENT } from "@/lib/api/client";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { seatsApi } from "@/lib/api/seats";
import type { EventSeat, SeatStatus } from "@/lib/api/types";
import {
  getSelectedSeatIdsNowUnavailable,
  parseSeatUpdatePayload,
  reconcileSeatStatus,
  SOCKET_EVENTS,
  updateSeatSummary,
} from "@/lib/socket/contract";
import {
  getQuickSeatsSocket,
  releaseQuickSeatsSocket,
} from "@/lib/socket/client";
import type { QuickSeatsSocket } from "@/lib/socket/client";
import type { SeatUpdateEventName } from "@/lib/socket/contract";

const SEAT_MAP_PAGE_SIZE = 100;

interface SeatMapProps {
  eventId: string;
  selectedSeats: EventSeat[];
  onToggleSeat: (seat: EventSeat) => void;
  onSeatsUnavailable: (seatIds: string[]) => void;
}

async function synchronizeSelectedSeats(
  eventId: string,
  selections: EventSeat[],
  startingVersion: number,
  updates: Map<string, SeatStatusPatch>,
  signal: AbortSignal,
  isActive: () => boolean,
): Promise<{ unavailableIds: string[]; missingCount: number }> {
  if (selections.length === 0) {
    return { unavailableIds: [], missingCount: 0 };
  }

  const sections = new Map<string, EventSeat[]>();
  for (const seat of selections) {
    const sectionSeats = sections.get(seat.section) ?? [];
    sectionSeats.push(seat);
    sections.set(seat.section, sectionSeats);
  }

  try {
    const latestStatuses = new Map<string, SeatStatus>();
    for (const [section, sectionSeats] of sections) {
      const targetIds = new Set(sectionSeats.map((seat) => seat.id));
      let totalPages = 1;
      for (let sectionPage = 1; sectionPage <= totalPages; sectionPage += 1) {
        const map = await seatsApi.getEventMap(
          eventId,
          {
            section,
            page: sectionPage,
            limit: SEAT_MAP_PAGE_SIZE,
          },
          { signal },
        );
        totalPages = map.pagination.totalPages;
        for (const seat of map.seats) {
          if (targetIds.has(seat.id)) {
            latestStatuses.set(seat.id, seat.status);
          }
        }

        if ([...targetIds].every((seatId) => latestStatuses.has(seatId))) {
          break;
        }
      }
    }

    if (!isActive() || signal.aborted) {
      return { unavailableIds: [], missingCount: 0 };
    }
    const unavailableIds = selections
      .filter((seat) => {
        const socketUpdate = updates.get(seat.id);
        const status =
          socketUpdate && socketUpdate.version > startingVersion
            ? socketUpdate.status
            : latestStatuses.get(seat.id);
        return status !== "AVAILABLE";
      })
      .map((seat) => seat.id);
    return {
      unavailableIds,
      missingCount: selections.length - latestStatuses.size,
    };
  } catch (error: unknown) {
    if (!isActive() || signal.aborted) {
      return { unavailableIds: [], missingCount: 0 };
    }
    throw error;
  }
}

type ConnectionStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "disconnected"
  | "unavailable"
  | "unauthorized";

interface SeatStatusPatch {
  status: SeatStatus;
  occurredAt: number;
  version: number;
}

const SEAT_EVENTS: SeatUpdateEventName[] = [
  SOCKET_EVENTS.SEAT_HELD,
  SOCKET_EVENTS.SEAT_RELEASED,
  SOCKET_EVENTS.SEAT_EXPIRED,
  SOCKET_EVENTS.SEAT_BOOKED,
];

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "The seat map could not be loaded. Please try again.";
}

function seatStatusLabel(seat: EventSeat): string {
  switch (seat.status) {
    case "AVAILABLE":
      return "Available";
    case "HELD":
      return "Temporarily held";
    case "BOOKED":
      return "Booked";
  }
}

function connectionLabel(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Live updates connected";
    case "connecting":
      return "Connecting to live updates";
    case "reconnecting":
      return "Reconnecting";
    case "unauthorized":
      return "Sign-in required for live updates";
    case "unavailable":
    case "disconnected":
      return "Live updates unavailable";
  }
}

export function SeatMap({
  eventId,
  selectedSeats,
  onToggleSeat,
  onSeatsUnavailable,
}: SeatMapProps) {
  const { accessToken, status: authStatus } = useAuth();
  const [page, setPage] = useState(1);
  const [retryIndex, setRetryIndex] = useState(0);
  const [syncVersion, setSyncVersion] = useState(0);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [connectionMessage, setConnectionMessage] = useState("");
  const requestKey = `${eventId}:${page}:${retryIndex}`;
  const requestKeyRef = useRef(requestKey);
  const [response, setResponse] = useState<{
    key: string;
    result: Awaited<ReturnType<typeof seatsApi.getEventMap>>;
  } | null>(null);
  const [requestError, setRequestError] = useState<{
    key: string;
    message: string;
  } | null>(null);
  const result = response?.key === requestKey ? response.result : null;
  const error =
    !result && requestError?.key === requestKey ? requestError.message : "";
  const loading = !result && !error;
  const visibleConnectionStatus: ConnectionStatus =
    authStatus === "loading" ? "connecting" : connectionStatus;
  const seatUpdates = useRef(new Map<string, SeatStatusPatch>());
  const updateVersion = useRef(0);
  const selectedSyncController = useRef<AbortController | null>(null);
  const selectedSeatsRef = useRef(selectedSeats);
  const onSeatsUnavailableRef = useRef(onSeatsUnavailable);
  const selectedIds = useMemo(
    () => new Set(selectedSeats.map((seat) => seat.id)),
    [selectedSeats],
  );

  useEffect(() => {
    requestKeyRef.current = requestKey;
  }, [requestKey]);

  useEffect(() => {
    selectedSeatsRef.current = selectedSeats;
    onSeatsUnavailableRef.current = onSeatsUnavailable;
  }, [onSeatsUnavailable, selectedSeats]);

  useEffect(() => {
    const controller = new AbortController();
    const requestVersion = updateVersion.current;
    void seatsApi
      .getEventMap(
        eventId,
        { page, limit: SEAT_MAP_PAGE_SIZE },
        { signal: controller.signal },
      )
      .then((nextResult) => {
        if (!controller.signal.aborted) {
          const currentResult = { ...nextResult, seats: [...nextResult.seats] };
          for (const [seatId, patch] of seatUpdates.current) {
            if (patch.version <= requestVersion) {
              continue;
            }
            const reconciled = reconcileSeatStatus(
              currentResult.seats,
              seatId,
              patch.status,
            );
            if (!reconciled.changed) {
              continue;
            }
            const oldSeat = currentResult.seats.find((seat) => seat.id === seatId);
            if (oldSeat) {
              currentResult.overallSummary = updateSeatSummary(
                currentResult.overallSummary,
                oldSeat.status,
                patch.status,
              );
              currentResult.summary = updateSeatSummary(
                currentResult.summary,
                oldSeat.status,
                patch.status,
              );
            }
            currentResult.seats = reconciled.seats;
          }
          setResponse({ key: requestKey, result: currentResult });
          const unavailableIds = getSelectedSeatIdsNowUnavailable(
            selectedSeatsRef.current,
            currentResult.seats.map(({ id, status }) => ({
              seatId: id,
              status,
              lockedUntil: null,
            })),
          );
          if (unavailableIds.length > 0) {
            onSeatsUnavailableRef.current(unavailableIds);
          }
        }
      })
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) {
          setRequestError({ key: requestKey, message: getErrorMessage(requestError) });
          if (syncVersion > 0) {
            setConnectionMessage(
              "Live updates are connected, but the latest seat map could not be synchronized.",
            );
          }
        }
      });

    return () => controller.abort();
  }, [eventId, page, requestKey, syncVersion]);

  useEffect(() => {
    if (authStatus === "loading") {
      return;
    }

    let socket: QuickSeatsSocket;
    try {
      socket = getQuickSeatsSocket(accessToken);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Live updates are unavailable.";
      const errorTimer = window.setTimeout(() => {
        setConnectionStatus("disconnected");
        setConnectionMessage(errorMessage);
      }, 0);
      return () => window.clearTimeout(errorTimer);
    }

    let active = true;
    let hasConnected = false;
    let joined = false;
    let joinRequestId = 0;
    let joinTimeout: ReturnType<typeof setTimeout> | null = null;
    function onSeatUpdate(eventName: SeatUpdateEventName, value: unknown) {
      const payload = parseSeatUpdatePayload(value, eventId, eventName);
      if (!payload || !active) {
        return;
      }

      const occurredAt = Date.parse(payload.occurredAt);
      const changedSeats: Array<{
        seatId: string;
        status: SeatStatus;
        lockedUntil: string | null;
      }> = [];
      for (const seat of payload.seats) {
        const previousPatch = seatUpdates.current.get(seat.seatId);
        if (
          previousPatch &&
          (previousPatch.occurredAt > occurredAt ||
            (previousPatch.occurredAt === occurredAt &&
              previousPatch.status === seat.status))
        ) {
          continue;
        }
        const patch = {
          status: seat.status,
          occurredAt,
          version: ++updateVersion.current,
        };
        seatUpdates.current.set(seat.seatId, patch);
        changedSeats.push(seat);

        setResponse((current) => {
          if (!current || current.key !== requestKeyRef.current) {
            return current;
          }
          const currentSeat = current.result.seats.find(
            (item) => item.id === seat.seatId,
          );
          if (!currentSeat || currentSeat.status === seat.status) {
            return current;
          }
          const updated = reconcileSeatStatus(
            current.result.seats,
            seat.seatId,
            seat.status,
          );
          return {
            ...current,
            result: {
              ...current.result,
              seats: updated.seats,
              summary: updateSeatSummary(
                current.result.summary,
                currentSeat.status,
                seat.status,
              ),
              overallSummary: updateSeatSummary(
                current.result.overallSummary,
                currentSeat.status,
                seat.status,
              ),
            },
          };
        });
      }

      const unavailableIds = getSelectedSeatIdsNowUnavailable(
        selectedSeatsRef.current,
        changedSeats,
      );
      if (unavailableIds.length > 0) {
        onSeatsUnavailableRef.current(unavailableIds);
      }
    }

    const listeners = SEAT_EVENTS.map((eventName) => {
      const listener = (payload: unknown) => onSeatUpdate(eventName, payload);
      socket.on(eventName, listener);
      return { eventName, listener };
    });

    function onConnect() {
      if (!active) {
        return;
      }
      const wasReconnect = hasConnected;
      hasConnected = true;
      joined = false;
      setConnectionStatus(wasReconnect ? "reconnecting" : "connecting");
      const currentJoinRequest = ++joinRequestId;
      if (joinTimeout) {
        clearTimeout(joinTimeout);
      }
      joinTimeout = setTimeout(() => {
        if (active && currentJoinRequest === joinRequestId && !joined) {
          setConnectionStatus("unavailable");
          setConnectionMessage("The event live-update room did not respond.");
        }
      }, 10000);
      socket.emit(SOCKET_EVENTS.EVENT_JOIN, { eventId }, (acknowledgement) => {
        if (!active || currentJoinRequest !== joinRequestId) {
          return;
        }
        if (joinTimeout) {
          clearTimeout(joinTimeout);
          joinTimeout = null;
        }
        if (
          !acknowledgement.success ||
          acknowledgement.eventId !== eventId
        ) {
          setConnectionStatus("unavailable");
          setConnectionMessage(
            acknowledgement.error || "Could not join this event's live updates.",
          );
          return;
        }
        joined = true;
        setConnectionStatus("connected");
        setConnectionMessage("");
        setSyncVersion((version) => version + 1);
        checkSelectedSeatsAfterConnection();
      });
    }

    function onDisconnect(reason: string) {
      if (!active) {
        return;
      }
      joined = false;
      if (reason === "io server disconnect") {
        setConnectionStatus("disconnected");
        setConnectionMessage("The live connection was closed by the server.");
        return;
      }
      setConnectionStatus("reconnecting");
      setConnectionMessage("Reconnecting to live seat updates…");
    }

    function onReconnectAttempt() {
      if (active) {
        setConnectionStatus("reconnecting");
        setConnectionMessage("Reconnecting to live seat updates…");
      }
    }

    function checkSelectedSeatsAfterConnection() {
      selectedSyncController.current?.abort();
      const controller = new AbortController();
      selectedSyncController.current = controller;
      const startingVersion = updateVersion.current;
      const selections = [...selectedSeatsRef.current];
      void synchronizeSelectedSeats(
        eventId,
        selections,
        startingVersion,
        seatUpdates.current,
        controller.signal,
        () => active,
      )
        .then(({ unavailableIds, missingCount }) => {
          if (!active || controller.signal.aborted) {
            return;
          }
          if (unavailableIds.length > 0) {
            onSeatsUnavailableRef.current(unavailableIds);
            setConnectionMessage(
              "A selected seat was no longer available and was removed from your selection.",
            );
          } else if (missingCount > 0) {
            onSeatsUnavailableRef.current(selections.map((seat) => seat.id));
            setConnectionMessage(
              "Some selected seats could not be confirmed and were removed from your selection.",
            );
          }
        })
        .catch(() => {
          if (active && !controller.signal.aborted) {
            setConnectionMessage(
              "The live connection returned, but selected seats could not be verified against the latest seat map.",
            );
          }
        });
    }

    function onConnectError(error: Error) {
      if (!active) {
        return;
      }
      const authFailure =
        accessToken !== null &&
        /invalid|expired|authentication token|authenticated user no longer exists/i.test(
          error.message,
        );
      setConnectionStatus(authFailure ? "unauthorized" : "reconnecting");
      setConnectionMessage(
        authFailure
          ? "Your sign-in has expired. Sign in again to restore live updates."
          : "Live seat updates could not connect. Retrying…",
      );
      if (authFailure) {
        socket.io.reconnection(false);
        socket.disconnect();
        window.dispatchEvent(new Event(API_UNAUTHORIZED_EVENT));
      }
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);
    socket.io.on("reconnect_attempt", onReconnectAttempt);
    socket.connect();

    return () => {
      active = false;
      joinRequestId += 1;
      selectedSyncController.current?.abort();
      if (joinTimeout) {
        clearTimeout(joinTimeout);
      }
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.io.off("reconnect_attempt", onReconnectAttempt);
      for (const { eventName, listener } of listeners) {
        socket.off(eventName, listener);
      }
      if (socket.connected && joined) {
        socket.emit(SOCKET_EVENTS.EVENT_LEAVE, { eventId }, () => {});
      }
      releaseQuickSeatsSocket(socket);
    };
  }, [accessToken, authStatus, eventId]);

  const rows = useMemo(() => {
    const grouped = new Map<string, Map<string, EventSeat[]>>();
    for (const seat of result?.seats ?? []) {
      let sectionRows = grouped.get(seat.section);
      if (!sectionRows) {
        sectionRows = new Map();
        grouped.set(seat.section, sectionRows);
      }
      const rowSeats = sectionRows.get(seat.row) ?? [];
      rowSeats.push(seat);
      sectionRows.set(seat.row, rowSeats);
    }

    return [...grouped].map(([section, sectionRows]) => ({
      section,
      rows: [...sectionRows].map(([row, seats]) => ({
        row,
        seats: seats.sort((left, right) => left.seatNumber - right.seatNumber),
      })),
    }));
  }, [result]);

  function retry() {
    setRetryIndex((index) => index + 1);
  }

  return (
    <section className="seat-map-panel" aria-labelledby="seat-map-title">
      <div className="seat-map-panel__heading">
        <div>
          <span className="eyebrow">Choose your seats</span>
          <h2 id="seat-map-title">Seat map</h2>
        </div>
        <div className={`seat-live-status seat-live-status--${visibleConnectionStatus}`} role="status" aria-live="polite">
          <span aria-hidden="true" />
          <div>
            <strong>{connectionLabel(visibleConnectionStatus)}</strong>
            {connectionMessage ? <small>{connectionMessage}</small> : null}
            {visibleConnectionStatus === "unauthorized" ? (
              <a href="/login">Sign in</a>
            ) : null}
          </div>
        </div>
        {result ? (
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={retry}
          >
            Refresh availability
          </Button>
        ) : null}
      </div>

      <div className="seat-map-legend" aria-label="Seat status legend">
        <span><i className="seat-map-legend__swatch seat-map-legend__swatch--available" />Available</span>
        <span><i className="seat-map-legend__swatch seat-map-legend__swatch--selected" />Selected by you</span>
        <span><i className="seat-map-legend__swatch seat-map-legend__swatch--unavailable" />Held or booked</span>
      </div>
      {loading ? (
        <LoadingState label="Loading current seat availability…" />
      ) : error ? (
        <ErrorState
          title="Seat availability is unavailable"
          description={error}
          onRetry={retry}
        />
      ) : result && result.overallSummary.total === 0 ? (
        <div className="seat-map-empty" role="status">
          <h3>No seat layout is available yet.</h3>
          <p>The organizer has not generated seats for this event.</p>
        </div>
      ) : result && result.seats.length === 0 ? (
        <div className="seat-map-empty" role="status">
          <h3>No seats on this page.</h3>
          <Button type="button" variant="secondary" onClick={() => setPage(1)}>
            Return to the first page
          </Button>
        </div>
      ) : result ? (
        <>
          <div className="seat-map-stage" aria-hidden="true">
            <span>Stage this way</span>
          </div>
          <div className="seat-map-sections">
            {rows.map(({ section, rows: sectionRows }) => (
              <section className="seat-map-section" key={section}>
                <h3>{section}</h3>
                <div className="seat-map-section__rows">
                  {sectionRows.map(({ row, seats }) => (
                    <div className="seat-map-row" role="group" aria-label={`${section}, row ${row}`} key={row}>
                      <span className="seat-map-row__label" aria-hidden="true">{row}</span>
                      <div className="seat-map-row__seats">
                        {seats.map((seat) => {
                          const selected = selectedIds.has(seat.id);
                          const available = seat.status === "AVAILABLE";
                          const disabled = !available && !selected;
                          return (
                            <button
                              className={[
                                "seat-map-seat",
                                selected ? "seat-map-seat--selected" : "",
                                !available ? `seat-map-seat--${seat.status.toLowerCase()}` : "",
                              ].filter(Boolean).join(" ")}
                              type="button"
                              key={seat.id}
                              aria-label={`${section}, row ${row}, seat ${seat.seatNumber}, ${seat.category}, ${seatStatusLabel(seat)}, ${formatPriceLabel(seat.price)}`}
                              aria-pressed={selected}
                              title={`${seat.category} · ${seatStatusLabel(seat)} · ${formatPriceLabel(seat.price)}`}
                              disabled={disabled}
                              onClick={() => onToggleSeat(seat)}
                            >
                              {seat.seatNumber}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="seat-map-pagination">
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={loading || page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous seats
            </Button>
            <span aria-live="polite">
              Showing {result.pagination.total === 0 ? 0 : (page - 1) * result.pagination.limit + 1}–
              {Math.min(page * result.pagination.limit, result.pagination.total)} of {result.pagination.total} seats
            </span>
            <Button
              type="button"
              size="small"
              variant="secondary"
              disabled={loading || page >= result.pagination.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              More seats
            </Button>
          </div>
          <p className="seat-map-notice" role="note">
            Selecting a seat does not reserve it. Availability is checked again
            by the backend when the seat-holding step is available.
          </p>
        </>
      ) : null}
    </section>
  );
}

function formatPriceLabel(price: number): string {
  return `Amount ${price}`;
}
