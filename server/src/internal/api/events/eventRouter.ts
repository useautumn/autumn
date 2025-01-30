import { Router } from "express";
import {
  AppEnv,
  CreateEventSchema,
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
import { CusService } from "@/internal/customers/CusService.js";
import { Client } from "pg";
import { Queue } from "bullmq";
import { createNewCustomer } from "../customers/cusUtils.js";

export const eventsRouter = Router();

const getEventAndCustomer = async (req: any) => {
  const body = req.body;
  const orgId = req.orgId;
  const env = req.env;

  let customer: Customer;

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

  const parsedEvent = CreateEventSchema.parse(req.body);

  const newEvent: Event = {
    ...parsedEvent,

    properties: parsedEvent.properties || {},

    timestamp: Date.now(),
    id: generateId("evt"),
    org_id: orgId,
    env: env,
    internal_customer_id: customer.internal_id,
  };

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
