import { Router } from "express";
import {
  CusProductStatus,
  type Customer,
  ErrCode,
  EventInsert,
  FeatureType,
  FeatureUsageType,
} from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { generateId, nullish } from "@/utils/genUtils.js";

import { EventService } from "./EventService.js";
import { StatusCodes } from "http-status-codes";
import { JobName } from "@/queue/JobName.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { creditSystemContainsFeature } from "@/internal/features/creditSystemUtils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import { getEventTimestamp } from "./eventUtils.js";
import { ExtendedRequest } from "@/utils/models/Request.js";
import { runUpdateUsageTask } from "@/trigger/updateUsageTask.js";
import { logger } from "@/external/logtail/logtailUtils.js";

export const eventsRouter: Router = Router();
export const usageRouter: Router = Router();

const getCusFeatureAndOrg = async ({
  req,
  customerId,
  featureId,
  entityId,
  customerData,
}: {
  req: ExtendedRequest;
  customerId: string;
  featureId: string;
  entityId: string;
  customerData: any;
}) => {
  // 1. Get customer
  const { org, features } = req;

  let customer = await getOrCreateCustomer({
    req,
    customerId,
    customerData,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],

    entityId,
    entityData: req.body.entity_data,
  });

  let feature = features.find((f) => f.id == featureId);
  let creditSystems = features.filter(
    (f) =>
      f.type == FeatureType.CreditSystem &&
      creditSystemContainsFeature({
        creditSystem: f,
        meteredFeatureId: featureId,
      }),
  );

  if (!feature) {
    throw new RecaseError({
      message: `Feature ${featureId} not found`,
      code: ErrCode.FeatureNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  return { customer, org, feature, creditSystems };
};

const createAndInsertEvent = async ({
  req,
  customer,
  featureId,
  value,
  set_usage,
  properties,
  idempotencyKey,
}: {
  req: any;
  customer: Customer;
  featureId: string;
  value?: number;
  set_usage?: boolean;
  properties: any;
  idempotencyKey?: string;
}) => {
  if (!customer.id) {
    throw new RecaseError({
      message: "Customer ID is required",
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  const timestamp = getEventTimestamp(req.body.timestamp);

  const newEvent: EventInsert = {
    id: generateId("evt"),
    org_id: req.orgId,
    org_slug: req.org.slug,
    env: req.env,
    internal_customer_id: customer.internal_id,

    created_at: timestamp.getTime(),
    timestamp: timestamp,

    idempotency_key: idempotencyKey,
    customer_id: customer.id,
    event_name: featureId,
    properties,
    value,
    set_usage: set_usage || false,
  };

  return await EventService.insert({ db: req.db, event: newEvent });
};

export const handleUsageEvent = async ({
  req,
  setUsage = false,
}: {
  req: any;
  setUsage?: boolean;
}) => {
  let {
    customer_id,
    customer_data,
    properties,
    feature_id,
    value,
    entity_id,
    idempotency_key,
  } = req.body;
  const { logtail: logger } = req;

  if (!customer_id || !feature_id) {
    throw new RecaseError({
      message: "customer_id and feature_id are required",
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  properties = properties || {};

  logger.info(`/track: customer ${customer_id}, feature ${feature_id}`);
  const startTime = Date.now();
  const { customer, org, feature, creditSystems } = await getCusFeatureAndOrg({
    req,
    customerId: customer_id,
    featureId: feature_id,
    customerData: customer_data,
    entityId: entity_id,
  });
  logger.info(`/track: get customer took ${Date.now() - startTime}ms`);
  const startTime2 = Date.now();

  let newEvent = await createAndInsertEvent({
    req,
    customer,
    featureId: feature_id,
    value,
    set_usage: setUsage,
    properties,
    idempotencyKey: idempotency_key,
  });
  logger.info(`/track: insert event took ${Date.now() - startTime2}ms`);

  const features = [feature, ...creditSystems];

  if (nullish(value) || isNaN(parseFloat(value))) {
    value = 1;
  } else {
    value = parseFloat(value);
  }

  const payload = {
    customerId: customer.id,
    internalCustomerId: customer.internal_id,
    features,
    org,
    env: req.env,
    properties,
    value,
    set_usage: setUsage,
    entityId: entity_id,
  };

  const featureUsageType = feature.config?.usage_type;
  // console.log(`Feature Usage Type: ${featureUsageType}`);
  if (featureUsageType === FeatureUsageType.Continuous) {
    await runUpdateUsageTask({
      payload,
      logger: console,
      db: req.db,
      throwError: true,
    });
  } else {
    await addTaskToQueue({
      jobName: JobName.UpdateUsage,
      payload,
    });
  }

  return { event: newEvent, affectedFeatures: features, org };
};

usageRouter.post("", async (req: any, res: any) => {
  try {
    await handleUsageEvent({ req, setUsage: true });
    res.status(StatusCodes.OK).json({ success: true });
  } catch (error) {
    return handleRequestError({
      req,
      res,
      error,
      action: "handleUsageEvent",
    });
  }
});
