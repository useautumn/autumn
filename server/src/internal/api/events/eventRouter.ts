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
import { CustomerEntitlementService } from "../../customers/entitlements/CusEntitlementService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getBelowThresholdPrice } from "../../../trigger/invoiceThresholdUtils.js";
import { updateBalanceTask } from "@/trigger/updateBalanceTask.js";
import { Client } from "pg";
import { inngest } from "@/trigger/inngest.js";

export const eventsRouter = Router();

const getCreditSystemDeduction = (
  meteredFeatures: Feature[],
  creditSystem: Feature
) => {
  let creditsUpdate = 0;
  let meteredFeatureIds = meteredFeatures.map((feature) => feature.id);

  for (const schema of creditSystem.config.schema) {
    if (meteredFeatureIds.includes(schema.metered_feature_id)) {
      creditsUpdate += (1 / schema.feature_amount) * schema.credit_amount;
    }
  }

  return creditsUpdate;
};

const getEventAndCustomer = async (req: any) => {
  const body = req.body;
  const orgId = req.orgId;
  const env = req.env;

  let newEvent: Event;
  let customer: Customer;
  try {
    // 1. Validate request body
    EventSchema.omit({ id: true, org_id: true, env: true }).parse(req.body);
    newEvent = {
      id: generateId("evt"),
      org_id: orgId,
      env: env,
      timestamp: Date.now(),
      ...body,
    };

    // 2. Check if customer ID is valid
    customer = await CusService.getCustomer({
      sb: req.sb,
      orgId: orgId,
      customerId: body.customer_id,
      env: env,
    });

    if (!customer) {
      throw new RecaseError({
        message: "Customer not found",
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    // 3. Insert event
    await EventService.insertEvent(req.sb, newEvent);
  } catch (error: any) {
    throw new RecaseError({
      message: "Invalid request body -> " + formatZodError(error),
      code: ErrCode.InvalidEvent,
      statusCode: StatusCodes.BAD_REQUEST,
    });
  }

  return { customer, event: newEvent };
};

const getFeaturesAndCustomerEnts = async ({
  req,
  customer,
  event,
}: {
  req: any;
  customer: Customer;
  event: Event;
}) => {
  const { rows }: { rows: Feature[] } = await req.pg.query(`
    with features_with_event as (
      select * from features
      where config -> 'filters' @> '[{"value": ["${event.event_name}"]}]'::jsonb
    )
    
    select * from features WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
      schema_element->>'metered_feature_id' IN (SELECT id FROM features_with_event)
    )
    UNION all
    select * from features_with_event
    `);

  if (rows.length === 0) {
    return { customerEntitlements: [], features: [] };
  }

  let internalFeatureIds = rows.map((feature) => feature.internal_id);
  const cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
    sb: req.sb,
    internalCustomerId: customer.internal_id,
    internalFeatureIds: internalFeatureIds as string[],
  });

  cusEnts.sort((a, b) => {
    if (a.balance <= 0) return 1;
    if (b.balance <= 0) return -1;

    return a.created_at - b.created_at;
  });

  return { customerEntitlements: cusEnts, features: rows };
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
      // await inngest.send({
      //   name: "autumn/update-balance",
      //   data: {
      //     customer,
      //     features: affectedFeatures,
      //   },
      // });
      await updateBalanceTask.trigger(
        {
          customer,
          features: affectedFeatures,
        },
        {
          queue: {
            name: "customer",
            concurrencyLimit: 1,
          },
          concurrencyKey: customer.internal_id,
        }
      );

      console.log("Queued update balance task...");
    }

    res.status(200).json({ success: true, event_id: event.id });
    return;
  } catch (error) {
    handleRequestError({ res, error, action: "POST event failed" });
    return;
  }

  return;
});
