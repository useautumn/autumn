import { Router } from "express";
import {
  AppEnv,
  Customer,
  ErrCode,
  Event,
  EventSchema,
  Feature,
  FeatureType,
} from "@autumn/shared";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";

import { EventService } from "./EventService.js";
import { StatusCodes } from "http-status-codes";
import { CusService } from "@/internal/customers/CusService.js";
import { Client } from "pg";
import { Queue } from "bullmq";
import { createNewCustomer } from "../customers/cusUtils.js";

export const eventsRouter = Router();

const getEventAndCustomer = async (req: any) => {
  const body = req.body;
  const orgId = req.orgId;
  const env = req.env;

  let newEvent: Event;
  let customer: Customer;
  try {
    // 1. Validate request body
    EventSchema.omit({
      id: true,
      org_id: true,
      env: true,
      properties: true,
    }).parse(req.body);
    newEvent = {
      id: generateId("evt"),
      org_id: orgId,
      env: env,
      timestamp: Date.now(),
      properties: body.properties || {},

      event_name: body.event_name,
      customer_id: body.customer_id,
    };
  } catch (error: any) {
    throw new RecaseError({
      message: "Invalid request body -> " + formatZodError(error),
      code: ErrCode.InvalidEvent,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  // 2. Check if customer ID is valid
  customer = await CusService.getCustomer({
    sb: req.sb,
    orgId: orgId,
    customerId: body.customer_id,
    env: env,
  });

  if (!customer) {
    customer = await createNewCustomer({
      sb: req.sb,
      orgId: req.orgId,
      env: req.env,
      customer: {
        id: body.customer_id,
        name: body.customer_data?.name,
        email: body.customer_data?.email,
        fingerprint: body.customer_data?.fingerprint,
      },
    });
  }

  // 3. Insert event
  await EventService.insertEvent(req.sb, newEvent);

  return { customer, event: newEvent };
};

const getAffectedFeatures = async ({
  pg,
  event,
  orgId,
  env,
}: {
  pg: Client;
  event: Event;
  orgId: string;
  env: AppEnv;
}) => {
  const { rows }: { rows: Feature[] } = await pg.query(`
    with features_with_event as (
      select * from features
      where org_id = '${orgId}'
      and env = '${env}'
      and config -> 'filters' @> '[{"value": ["${event.event_name}"]}]'::jsonb
    )

    select * from features WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
      schema_element->>'metered_feature_id' IN (SELECT id FROM features_with_event)
    )
    UNION all
    select * from features_with_event
  `);

  return rows;
};

eventsRouter.post("", async (req: any, res: any) => {
  const body = req.body;
  const orgId = req.orgId;
  const env = req.env;

  try {
    const { customer, event } = await getEventAndCustomer(req);

    const affectedFeatures = await getAffectedFeatures({
      pg: req.pg,
      event,
      orgId,
      env,
    });

    if (affectedFeatures.length > 0) {
      let queue: Queue = req.queue;
      queue.add("update-balance", {
        customerId: customer.internal_id,
        customer,
        features: affectedFeatures,
        event,
      });
      // await inngest.send({
      //   name: "autumn/update-balance",
      //   data: {
      //     customer,
      //     features: affectedFeatures,
      //   },
      // });
      // await updateBalanceTask.trigger(
      //   {
      //     customer,
      //     features: affectedFeatures,
      //   },
      //   {
      //     queue: {
      //       name: "customer",
      //       concurrencyLimit: 1,
      //     },
      //     concurrencyKey: customer.internal_id,
      //   }
      // );
    } else {
      console.log("No affected features found");
    }

    res.status(200).json({ success: true, event_id: event.id });
    return;
  } catch (error) {
    handleRequestError({ res, error, action: "POST event failed" });
    return;
  }

  return;
});
