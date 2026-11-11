import type { RequestHandler } from "express";
import {
  createEvent,
  deleteEvent,
  getEventById,
  listEvents,
  updateEvent,
} from "../services/event.service.js";
import { getSeatMap } from "../services/seat-map.service.js";
import { generateSeatsForEvent } from "../services/seat-generation.service.js";
import { sendSuccess } from "../utils/api-response.js";
import { parseInput } from "../utils/validation.js";
import { eventIdParamsSchema } from "../validators/common.validator.js";
import { listEventsQuerySchema } from "../validators/event.validator.js";
import { AppError } from "../utils/app-error.js";

function getActor(request: Parameters<RequestHandler>[0]) {
  if (!request.user) {
    throw new AppError("Authentication required", 401);
  }
  return request.user;
}

export const createEventController: RequestHandler = async (request, response) => {
  const payload = request.user
    ? {
        ...request.body,
        organizerId: request.user.id,
      }
    : request.body;

  const event = await createEvent(payload);
  return sendSuccess(response, event, "Event created successfully", 201);
};

export const listEventsController: RequestHandler = async (request, response) => {
  const query = parseInput(listEventsQuerySchema, request.query);
  const result = await listEvents(query);
  return sendSuccess(response, result, "Events retrieved successfully");
};

export const getEventController: RequestHandler = async (request, response) => {
  const { eventId } = parseInput(eventIdParamsSchema, request.params);
  const event = await getEventById(eventId);
  return sendSuccess(response, event, "Event retrieved successfully");
};

export const updateEventController: RequestHandler = async (request, response) => {
  const { eventId } = parseInput(eventIdParamsSchema, request.params);
  const actor = getActor(request);
  const event = await updateEvent(eventId, request.body, actor.id, actor.role);
  return sendSuccess(response, event, "Event updated successfully");
};

export const deleteEventController: RequestHandler = async (request, response) => {
  const { eventId } = parseInput(eventIdParamsSchema, request.params);
  const actor = getActor(request);
  await deleteEvent(eventId, actor.id, actor.role);
  return sendSuccess(response, null, "Event deleted successfully");
};

export const generateEventSeatsController: RequestHandler = async (
  request,
  response,
) => {
  const { eventId } = parseInput(eventIdParamsSchema, request.params);
  const actor = getActor(request);
  const result = await generateSeatsForEvent(eventId, actor.id, actor.role);
  return sendSuccess(response, result, "Seats generated successfully");
};

export const getEventSeatMapController: RequestHandler = async (
  request,
  response,
) => {
  const { eventId } = parseInput(eventIdParamsSchema, request.params);
  const result = await getSeatMap(eventId, request.query);
  return sendSuccess(response, result, "Seat map retrieved successfully");
};
