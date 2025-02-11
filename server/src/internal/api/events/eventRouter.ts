import { Router } from "express";
import {
  AppEnv,
  CreateEventSchema,
  Customer,
  Event,
  Feature,
} from "@autumn/shared";
import { handleRequestError } from "@/utils/errorUtils.js";
import { generateId } from "@/utils/genUtils.js";

import { EventService } from "./EventService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { Client } from "pg";
import { Queue } from "bullmq";
import { createNewCustomer } from "../customers/cusUtils.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { OrgService } from "@/internal/orgs/OrgService.js";

export const eventsRouter = Router();

const getEventAndCustomer = async ({
  sb,
  orgId,
  env,
  customer_id,
  customer_data,
  event_data,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  customer_id: string;
  customer_data: any;
  event_data: any;
}) => {
  let customer: Customer;

  // 2. Check if customer ID is valid
  customer = await CusService.getById({
    sb: sb,
    id: customer_id,
    orgId: orgId,
    env: env,
  });

  if (!customer) {
    customer = await createNewCustomer({
      sb: sb,
      orgId: orgId,
      env: env,
      customer: {
        id: customer_id,
        name: customer_data?.name,
        email: customer_data?.email,
        fingerprint: customer_data?.fingerprint,
      },
    });
  }

  // 3. Insert event

  const parsedEvent = CreateEventSchema.parse(event_data);

  const newEvent: Event = {
    ...parsedEvent,

    properties: parsedEvent.properties || {},

    timestamp: Date.now(),
    id: generateId("evt"),
    org_id: orgId,
    env: env,
    internal_customer_id: customer.internal_id,
  };

  await EventService.insertEvent(sb, newEvent);

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
  const { sb, pg, orgId, env } = req;

  const org = await OrgService.getFullOrg({
    sb,
    orgId,
  });

  const { customer, event } = await getEventAndCustomer({
    sb,
    orgId,
    env,
    customer_id,
    customer_data,
    event_data,
  });

  const affectedFeatures = await getAffectedFeatures({
    pg: pg,
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
      org,
      env,
    });
  }
};

eventsRouter.post("", async (req: any, res: any) => {
  const body = req.body;
  const orgId = req.orgId;
  const env = req.env;

  try {
    // const { customer, event } = await getEventAndCustomer(req);

    // const affectedFeatures = await getAffectedFeatures({
    //   pg: req.pg,
    //   event,
    //   orgId,
    //   env,
    // });

    // if (affectedFeatures.length > 0) {
    //   let queue: Queue = req.queue;
    //   queue.add("update-balance", {
    //     customerId: customer.internal_id,
    //     customer,
    //     features: affectedFeatures,
    //     event,
    //   });
    // } else {
    //   console.log("No affected features found");
    // }
    await handleEventSent({
      req,
      customer_id: body.customer_id,
      customer_data: body.customer_data,
      event_data: body,
    });

    res.status(200).json({ success: true });
    return;
  } catch (error) {
    handleRequestError({ req, res, error, action: "POST event failed" });
    return;
  }

  return;
});
