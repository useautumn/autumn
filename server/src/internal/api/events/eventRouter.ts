import { Router } from "express";

import {
  APIVersion,
  AppEnv,
  CreateEventSchema,
  CusProductStatus,
  EntityData,
  ErrCode,
  EventInsert,
  Feature,
  FeatureType,
  FullCustomer,
  Organization,
} from "@autumn/shared";

import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { generateId, notNullish } from "@/utils/genUtils.js";
import { EventService } from "./EventService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { handleUsageEvent } from "./usageRouter.js";
import { StatusCodes } from "http-status-codes";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { creditSystemContainsFeature } from "@/internal/features/creditSystemUtils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { getEventTimestamp } from "./eventUtils.js";

export const eventsRouter: Router = Router();

const getEventAndCustomer = async ({
  req,
  db,
  org,
  env,
  features,
  customer_id,
  customer_data,
  event_data,
  logger,
  entityId,
  entityData,
}: {
  req: ExtendedRequest;
  db: DrizzleCli;
  org: Organization;
  features: Feature[];
  env: AppEnv;
  customer_id: string;
  customer_data: any;
  event_data: any;
  entityId: string;
  logger: any;
  entityData?: EntityData;
}) => {
  if (!customer_id) {
    throw new RecaseError({
      message: "Customer ID is required",
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  let customer: FullCustomer;

  // 2. Check if customer ID is valid
  customer = await getOrCreateCustomer({
    req,
    customerId: customer_id,
    customerData: customer_data,
    entityId,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    entityData,
  });

  // 3. Insert event
  const parsedEvent = CreateEventSchema.parse(event_data);
  const timestamp = getEventTimestamp(parsedEvent.timestamp);

  let internalEntityId = null;
  if (event_data.entity_id) {
    internalEntityId = customer.entities.find(
      (e) => e.id === event_data.entity_id
    )?.internal_id;
  }

  const newEvent: EventInsert = {
    ...parsedEvent,
    properties: parsedEvent.properties || {},
    id: generateId("evt"),
    org_id: org.id,
    org_slug: org.slug,
    env: env,
    internal_customer_id: customer.internal_id,
    created_at: timestamp.getTime(),
    timestamp: timestamp,
    internal_entity_id: internalEntityId,
  };

  let event = await EventService.insert({ db, event: newEvent });

  return { customer, event };
};

const getAffectedFeatures = async ({
  req,
  eventName,
}: {
  req: any;
  eventName: string;
}) => {
  let features = await FeatureService.getFromReq(req);

  let featuresWithEvent = features.filter((feature) => {
    return (
      feature.type == FeatureType.Metered &&
      feature.config.filters.some((filter: any) => {
        return filter.value.includes(eventName);
      })
    );
  });

  let creditSystems = features.filter((cs: Feature) => {
    return (
      cs.type == FeatureType.CreditSystem &&
      featuresWithEvent.some((f) =>
        creditSystemContainsFeature({
          creditSystem: cs,
          meteredFeatureId: f.id,
        })
      )
    );
  });

  return [...featuresWithEvent, ...creditSystems];
};

export const handleEventSent = async ({
  req,
  customer_id,
  customer_data,
  event_data,
}: {
  req: any;
  customer_id: string;
  customer_data: any;
  event_data: any;
}) => {
  if (event_data.feature_id) {
    return handleUsageEvent({
      req,
    });
  }

  const { env, db } = req;

  let eventName = event_data.event_name;

  const org = await OrgService.getFromReq(req);
  const features = await FeatureService.getFromReq(req);

  const affectedFeatures = await getAffectedFeatures({
    req,
    eventName,
  });

  if (affectedFeatures.length == 0) {
    throw new RecaseError({
      message: `No features found for event_name ${event_data.event_name}`,
      code: ErrCode.InvalidEventName,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  const { customer, event } = await getEventAndCustomer({
    req,
    db,
    org,
    env,
    customer_id,
    customer_data,
    event_data,
    logger: req.logtail,
    entityId: event_data.entity_id,
    entityData: event_data.entity_data,
    features,
  });

  const payload = {
    internalCustomerId: customer.internal_id,
    customerId: customer.id,
    entityId: event_data.entity_id,
    features: affectedFeatures,
    event,
    org,
    env,
  };

  await addTaskToQueue({
    jobName: JobName.UpdateBalance,
    payload,
  });

  return { event, affectedFeatures, org };
};

eventsRouter.post("", async (req: any, res: any) => {
  try {
    const body = req.body;

    if (!body.event_name && !body.feature_id) {
      throw new RecaseError({
        message: "event_name or feature_id is required",
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (notNullish(body.event_name) && notNullish(body.feature_id)) {
      throw new RecaseError({
        message:
          "either `event_name` or `feature_id` should be provided, not both",
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (!body.customer_id) {
      throw new RecaseError({
        message: "customer_id is required",
        code: ErrCode.InvalidInputs,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    let { event, org }: any = await handleEventSent({
      req,
      customer_id: body.customer_id,
      customer_data: body.customer_data,
      event_data: body,
    });

    let apiVersion = orgToVersion({
      org,
      reqApiVersion: req.apiVersion,
    });

    let response: any = {
      id: event?.id,
      code: "event_received",
      customer_id: body.customer_id,
      entity_id: body.entity_id,
    };

    if (body.feature_id) {
      response.feature_id = body.feature_id;
    } else {
      response.event_name = event.event_name;
    }

    if (apiVersion >= APIVersion.v1_1) {
      res.status(200).json(response);
    } else {
      res.status(200).json({ success: true });
    }

    return;
  } catch (error) {
    handleRequestError({ req, res, error, action: "POST event failed" });
    return;
  }
});
