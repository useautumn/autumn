import { Router } from "express";
import {
  APIVersion,
  AppEnv,
  CreateEventSchema,
  CusProductStatus,
  EntityData,
  ErrCode,
  Event,
  Feature,
  FeatureType,
  FullCustomer,
  Organization,
} from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";

import { EventService } from "./EventService.js";

import { SupabaseClient } from "@supabase/supabase-js";
import { OrgService } from "@/internal/orgs/OrgService.js";

import { subDays } from "date-fns";
import { handleUsageEvent } from "./usageRouter.js";
import { StatusCodes } from "http-status-codes";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { creditSystemContainsFeature } from "@/internal/features/creditSystemUtils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { JobName } from "@/queue/JobName.js";
import { orgToVersion } from "@/utils/versionUtils.js";
import { clearOrgCache } from "@/internal/orgs/orgUtils/clearOrgCache.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

export const eventsRouter = Router();

const getEventAndCustomer = async ({
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
    db,
    org,
    env,
    customerId: customer_id,
    customerData: customer_data,
    logger,
    entityId,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    entityData,
    features,
  });

  // 3. Insert event
  const parsedEvent = CreateEventSchema.parse(event_data);

  let eventTimestamp = Date.now();
  if (parsedEvent.timestamp) {
    let thirtyDaysAgo = subDays(new Date(), 30).getTime();
    if (parsedEvent.timestamp > thirtyDaysAgo) {
      eventTimestamp = parsedEvent.timestamp;
    }
  }

  const newEvent: Event = {
    ...parsedEvent,
    properties: parsedEvent.properties || {},
    id: generateId("evt"),
    org_id: org.id,
    env: env,
    internal_customer_id: customer.internal_id,
    timestamp: eventTimestamp,
  };

  await EventService.insert({ db, event: newEvent });

  return { customer, event: newEvent };
};

const getAffectedFeatures = async ({
  req,
  event,
}: {
  req: any;
  event: Event;
}) => {
  let features = await FeatureService.getFromReq(req);

  let featuresWithEvent = features.filter((feature) => {
    return (
      feature.type == FeatureType.Metered &&
      feature.config.filters.some((filter: any) => {
        return filter.value.includes(event.event_name);
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
        }),
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

  const org = await OrgService.getFromReq(req);
  const features = await FeatureService.getFromReq(req);
  const { customer, event } = await getEventAndCustomer({
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

  const affectedFeatures = await getAffectedFeatures({
    req,
    event,
  });

  if (affectedFeatures.length == 0) {
    throw new RecaseError({
      message: `No features found for event_name ${event.event_name}`,
      code: ErrCode.InvalidEventName,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  if (affectedFeatures.length > 0) {
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
  }
};

eventsRouter.post("", async (req: any, res: any) => {
  try {
    const body = req.body;
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
