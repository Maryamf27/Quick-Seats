import { Types } from "mongoose";
import { parseInput } from "../utils/validation.js";
import { objectIdSchema } from "../validators/common.validator.js";

export function validateEventId(value: unknown): string {
  return new Types.ObjectId(parseInput(objectIdSchema, value)).toString();
}

export function eventRoomName(eventId: string): string {
  return `event:${validateEventId(eventId)}`;
}
