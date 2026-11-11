import { eventsApi } from "./endpoints/events";
import type { SeatMapQuery } from "./endpoints/events";
import type { ApiRequestOptions } from "./client";
import type { SeatMapResult } from "./types";

export const seatsApi = {
  getEventMap(
    eventId: string,
    query: SeatMapQuery = {},
    options?: ApiRequestOptions,
  ): Promise<SeatMapResult> {
    return eventsApi.seatMap(eventId, query, options);
  },
};

export type { SeatMapQuery } from "./endpoints/events";
export type { SeatMapResult } from "./types";
