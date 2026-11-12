import type { RequestHandler } from "express";
import { createOrganizerApplication, decideOrganizerApplication, getMyOrganizerApplication, listOrganizerApplications } from "../services/organizer-application.service.js";
import { AppError } from "../utils/app-error.js";
import { sendSuccess } from "../utils/api-response.js";
import { parseInput } from "../utils/validation.js";
import { organizerApplicationIdParamsSchema } from "../validators/organizer-application.validator.js";

function actorId(request: Parameters<RequestHandler>[0]): string {
  if (!request.user) throw new AppError("Authentication required", 401);
  return request.user.id;
}

export const createOrganizerApplicationController: RequestHandler = async (request, response) =>
  sendSuccess(response, await createOrganizerApplication(actorId(request), request.body), "Organizer application submitted", 201);

export const getMyOrganizerApplicationController: RequestHandler = async (request, response) =>
  sendSuccess(response, await getMyOrganizerApplication(actorId(request)), "Organizer application retrieved");

export const listOrganizerApplicationsController: RequestHandler = async (request, response) =>
  sendSuccess(response, await listOrganizerApplications(request.query), "Organizer applications retrieved");

export const decideOrganizerApplicationController: RequestHandler = async (request, response) => {
  const { applicationId } = parseInput(organizerApplicationIdParamsSchema, request.params);
  sendSuccess(response, await decideOrganizerApplication(applicationId, actorId(request), request.body), "Organizer application reviewed");
};
