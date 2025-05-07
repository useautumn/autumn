import { Router } from "express";
import {
  CusProductStatus,
  Customer,
  ErrCode,
  Event,
  FeatureType,
} from "@autumn/shared";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import { generateId, nullish } from "@/utils/genUtils.js";

import { EventService } from "./EventService.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { StatusCodes } from "http-status-codes";
import { QueueManager } from "@/queue/QueueManager.js";

import { JobName } from "@/queue/JobName.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { creditSystemContainsFeature } from "@/internal/features/creditSystemUtils.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
export const eventsRouter = Router();
export const usageRouter = Router();

const getCusFeatureAndOrg = async ({
  req,
  customerId,
  featureId,
  entityId,
  customerData,
}: {
  req: any;
  customerId: string;
  featureId: string;
  entityId: string;
  customerData: any;
}) => {
  // 1. Get customer
  let org = await OrgService.getFromReq(req);
  let [customer, features] = await Promise.all([
    getOrCreateCustomer({
      sb: req.sb,
      org,
      env: req.env,
      customerId,
      customerData,
      logger: req.logtail,
      entityId,
      inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    }),
    FeatureService.getFromReq(req),
  ]);

  let feature = features.find((f) => f.id == featureId);
  let creditSystems = features.filter(
    (f) =>
      f.type == FeatureType.CreditSystem &&
      creditSystemContainsFeature({
        creditSystem: f,
        meteredFeatureId: featureId,
      })
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
}: {
  req: any;
  customer: Customer;
  featureId: string;
  value?: number;
  set_usage?: boolean;
  properties: any;
}) => {
  if (!customer.id) {
    throw new RecaseError({
      message: "Customer ID is required",
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  const newEvent: Event = {
    id: generateId("evt"),
    org_id: req.orgId,
    env: req.env,
    internal_customer_id: customer.internal_id,
    timestamp: Date.now(),
    customer_id: customer.id,
    event_name: featureId,
    properties,
    value,
    set_usage: set_usage || false,
  };

  await EventService.insertEvent(req.sb, newEvent);

  return newEvent;
};

export const handleUsageEvent = async ({
  req,
  setUsage = false,
}: {
  req: any;
  setUsage?: boolean;
}) => {
  let { customer_id, customer_data, properties, feature_id, value, entity_id } =
    req.body;
  if (!customer_id || !feature_id) {
    throw new RecaseError({
      message: "customer_id and feature_id are required",
      code: ErrCode.InvalidInputs,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  properties = properties || {};

  const { customer, org, feature, creditSystems } = await getCusFeatureAndOrg({
    req,
    customerId: customer_id,
    featureId: feature_id,
    customerData: customer_data,
    entityId: entity_id,
  });

  let newEvent = await createAndInsertEvent({
    req,
    customer,
    featureId: feature_id,
    value,
    set_usage: setUsage,
    properties,
  });

  const features = [feature, ...creditSystems];

  const queue = await QueueManager.getQueue({ useBackup: false });

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

  await addTaskToQueue({
    jobName: JobName.UpdateUsage,
    payload,
  });

  // try {
  //   // Add timeout to queue operation
  //   await queue.add(JobName.UpdateUsage, payload);
  // } catch (error: any) {
  //   try {
  //     console.log("Adding update-balance to backup queue");
  //     const backupQueue = await QueueManager.getQueue({ useBackup: true });
  //     await backupQueue.add(JobName.UpdateUsage, payload);
  //   } catch (error: any) {
  //     throw new RecaseError({
  //       message: "Failed to add update-usage to queue (backup)",
  //       code: "EVENT_QUEUE_ERROR",
  //       statusCode: 500,
  //       data: {
  //         message: error.message,
  //       },
  //     });
  //   }
  // }

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
