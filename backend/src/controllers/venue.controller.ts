import type { RequestHandler } from "express";
import { createVenue, deleteVenue, getVenueById, listVenues, updateVenue } from "../services/venue.service.js";
import { sendSuccess } from "../utils/api-response.js";
import { parseInput } from "../utils/validation.js";
import { idParamsSchema } from "../validators/common.validator.js";
import { listVenuesQuerySchema } from "../validators/venue.validator.js";

export const createVenueController: RequestHandler = async (request, response) => {
  const venue = await createVenue(request.body);
  return sendSuccess(response, venue, "Venue created successfully", 201);
};

export const listVenuesController: RequestHandler = async (request, response) => {
  const query = parseInput(listVenuesQuerySchema, request.query);
  const result = await listVenues(query);
  return sendSuccess(response, result, "Venues retrieved successfully");
};

export const getVenueController: RequestHandler = async (request, response) => {
  const { id } = parseInput(idParamsSchema, request.params);
  const venue = await getVenueById(id);
  return sendSuccess(response, venue, "Venue retrieved successfully");
};

export const updateVenueController: RequestHandler = async (request, response) => {
  const { id } = parseInput(idParamsSchema, request.params);
  const venue = await updateVenue(id, request.body);
  return sendSuccess(response, venue, "Venue updated successfully");
};

export const deleteVenueController: RequestHandler = async (request, response) => {
  const { id } = parseInput(idParamsSchema, request.params);
  await deleteVenue(id);
  return sendSuccess(response, null, "Venue deleted successfully");
};
