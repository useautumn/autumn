import { Router } from "express";
import {
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
import { ErrorMessages } from "@/errors/errMessages.js";
import { EventService } from "./EventService.js";
import { StatusCodes } from "http-status-codes";
import { CustomerEntitlementService } from "../../customers/entitlements/CusEntitlementService.js";
import { CusService } from "@/internal/customers/CusService.js";
import { z } from "zod";

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
  const { data: cusEnts, error: cusEntsError } = await req.sb
    .from("customer_entitlements")
    .select("*")
    .eq("internal_customer_id", customer.internal_id)
    .in("internal_feature_id", internalFeatureIds);

  if (cusEntsError) {
    throw new RecaseError({
      message: "Error getting customer entitlements",
      code: ErrCode.InternalError,
      statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
    });
  }

  return { customerEntitlements: cusEnts, features: rows };
};

eventsRouter.post("", async (req: any, res: any) => {
  const body = req.body;
  const orgId = req.orgId;
  const env = req.env;

  try {
    const { customer, event } = await getEventAndCustomer(req);

    const { customerEntitlements, features } = await getFeaturesAndCustomerEnts(
      { req, customer, event }
    );

    if (features.length === 0 || customerEntitlements.length === 0) {
      res.status(200).json({ success: true, event_id: event.id });
      return;
    }

    const featureIdToDeduction: any = {};
    const meteredFeatures = features.filter(
      (feature) => feature.type === FeatureType.Metered
    );
    const creditSystems = features.filter(
      (feature) => feature.type === FeatureType.CreditSystem
    );

    for (const cusEnt of customerEntitlements) {
      const internalFeatureId = cusEnt.internal_feature_id;
      if (featureIdToDeduction[internalFeatureId]) {
        continue;
      }

      const feature = features.find(
        (feature) => feature.internal_id === internalFeatureId
      );

      if (feature?.type === FeatureType.Metered) {
        featureIdToDeduction[internalFeatureId] = {
          cusEntId: cusEnt.id,
          deduction: 1,
        };
      }

      if (feature?.type === FeatureType.CreditSystem) {
        const deduction = getCreditSystemDeduction(meteredFeatures, feature);
        if (deduction) {
          featureIdToDeduction[internalFeatureId] = {
            cusEntId: cusEnt.id,
            deduction: deduction,
          };
        }
      }
    }

    const updateQuery = `UPDATE customer_entitlements SET balance = balance - CASE
  ${Object.entries(featureIdToDeduction)
    .map(
      ([featureId, deduction]: [string, any]) =>
        `WHEN id = '${deduction.cusEntId}' THEN ${deduction.deduction}`
    )
    .join("\n")}
  END
  WHERE id IN (${Object.values(featureIdToDeduction)
    .map((deduction: any) => `'${deduction.cusEntId}'`)
    .join(",")});`;

    await req.pg.query(updateQuery);

    res.status(200).json({ success: true, event_id: event.id });
  } catch (error) {
    handleRequestError(res, error, "POST event failed");
    return;
  }

  return;
});
