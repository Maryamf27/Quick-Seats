import { EventModel } from "../../models/event.model.js";
import { AppError } from "../../utils/app-error.js";
import { SOCKET_EVENTS } from "../socket.events.js";
import { eventRoomName, validateEventId } from "../socket.rooms.js";
import type { QuickSeatsSocket } from "../socket.types.js";

function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  return "Unable to update event room membership";
}

export function registerEventRoomHandlers(socket: QuickSeatsSocket): void {
  socket.on(SOCKET_EVENTS.EVENT_JOIN, async (payload, acknowledge) => {
    if (typeof acknowledge !== "function") {
      return;
    }

    try {
      const eventId = validateEventId(payload?.eventId);
      const eventExists = await EventModel.exists({
        _id: eventId,
        status: "PUBLISHED",
      });

      if (!eventExists) {
        acknowledge({ success: false, error: "Event not found" });
        return;
      }

      await socket.join(eventRoomName(eventId));
      acknowledge({ success: true, eventId });
    } catch (error: unknown) {
      acknowledge({ success: false, error: getErrorMessage(error) });
      if (!(error instanceof AppError)) {
        const errorType = error instanceof Error ? error.name : "UnknownError";
        console.error(`Socket event-room join failed (${errorType})`);
      }
    }
  });

  socket.on(SOCKET_EVENTS.EVENT_LEAVE, async (payload, acknowledge) => {
    if (typeof acknowledge !== "function") {
      return;
    }

    try {
      const eventId = validateEventId(payload?.eventId);
      await socket.leave(eventRoomName(eventId));
      acknowledge({ success: true, eventId });
    } catch (error: unknown) {
      acknowledge({ success: false, error: getErrorMessage(error) });
      if (!(error instanceof AppError)) {
        const errorType = error instanceof Error ? error.name : "UnknownError";
        console.error(`Socket event-room leave failed (${errorType})`);
      }
    }
  });
}
