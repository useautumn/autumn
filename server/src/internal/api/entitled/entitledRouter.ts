import { ErrCode } from "@/errors/errCodes.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import {
  AllowanceType,
  CusEntWithEntitlement,
  Feature,
  FeatureType,
} from "@autumn/shared";

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";
import { z } from "zod";
import { createNewCustomer } from "../customers/cusUtils.js";
import { handleEventSent } from "../events/eventRouter.js";

export const entitledRouter = Router();

// 1. Get all features / credit systems for a particular feature_id
const getFeaturesAndCreditSystems = async ({
  pg,
  orgId,
  feature_id,
  env,
}: {
  pg: Client;
  orgId: string;
  feature_id: string;
  env: string;
}) => {
  const query = `
  select * from features WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
      type = 'credit_system'
      AND org_id = '${orgId}' 
      AND schema_element->>'metered_feature_id' = '${feature_id}'
      AND env = '${env}'
  ) 

  UNION all

  SELECT * FROM features 
  WHERE org_id = '${orgId}' 
  AND id = '${feature_id}'
  AND env = '${env}'`;

  const { rows } = await pg.query(query);

  const feature = rows.find((row: any) => row.id === feature_id);
  const creditSystems = rows.filter(
    (row: any) => row.type === "credit_system" && row.id !== feature_id
  );

  return { feature, creditSystems };
};

const calculateFeatureBalance = ({
  cusEnts,
  featureId,
}: {
  cusEnts: CusEntWithEntitlement[];
  featureId: string;
}) => {
  let balance = 0;
  for (const cusEnt of cusEnts) {
    if (cusEnt.feature_id === featureId) {
      if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
        return {
          balance: null,
          unlimited: true,
        };
      }
      balance += cusEnt.balance!;
    }
  }

  return {
    balance,
    unlimited: false,
  };
};

const checkEntitlementAllowed = ({
  cusEnts,
  feature,
  originalFeatureId,
  quantity,
}: {
  cusEnts: CusEntWithEntitlement[];
  feature: Feature;
  originalFeatureId: string;
  quantity: number;
}) => {
  // Check if at least one customer entitlement is for the original feature
  const cusEnt = cusEnts.find((ent) => ent.feature_id === feature.id);

  if (!cusEnt) {
    return null;
  }

  let required = quantity;

  if (
    feature.type === FeatureType.CreditSystem &&
    feature.id !== originalFeatureId
  ) {
    const schema = feature.config.schema.find(
      (schema: any) => schema.metered_feature_id === originalFeatureId
    );

    required = (1 / schema.feature_amount) * schema.credit_amount;
  }

  const balance = calculateFeatureBalance({ cusEnts, featureId: feature.id });
  return {
    feature_id: feature.id,
    balance: balance.balance,
    unlimited: balance.unlimited,
    required: required,
  };
};

const checkFeatureAccessAllowed = async ({
  originalFeature,
  creditSystems,
  cusEnts,
  quantity,
}: {
  originalFeature: Feature;
  creditSystems: Feature[];
  cusEnts: CusEntWithEntitlement[];
  quantity: number;
}) => {
  if (originalFeature.type === FeatureType.Boolean) {
    return {
      allowed: cusEnts.some((ent) => ent.feature_id === originalFeature.id),
      balances: [],
    };
  }

  // If no entitlements -> return false
  if (!cusEnts || cusEnts.length === 0) {
    return {
      allowed: false,
      balances: [],
    };
  }

  // 1. Calculate balance for feature
  let allowed = true;
  const balances = [];
  for (const feature of [originalFeature, ...creditSystems]) {
    const allowance = checkEntitlementAllowed({
      cusEnts,
      feature,
      originalFeatureId: originalFeature.id,
      quantity,
    });

    if (!allowance) {
      continue;
    }

    if (!allowance.unlimited && allowance.balance! < allowance.required) {
      allowed = false;
    }

    balances.push(allowance);
  }

  return {
    allowed,
    balances,
  };
};

const EntitledSchema = z.object({
  customer_id: z.string(),
  feature_id: z.string(),
  quantity: z.number().optional(),
});

entitledRouter.post("", async (req: any, res: any) => {
  let { customer_id, feature_id, quantity, customer_data, event_data } =
    req.body;

  try {
    try {
      quantity = quantity ? parseInt(quantity) : 1;

      EntitledSchema.parse({
        customer_id,
        feature_id,
        quantity,
      });
    } catch (error: any) {
      throw new RecaseError({
        message: "Invalid request body. " + formatZodError(error),
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    // 1. Check if customer exists
    let customer = await CusService.getCustomer({
      sb: req.sb,
      orgId: req.orgId,
      customerId: customer_id,
      env: req.env,
    });

    if (!customer) {
      customer = await createNewCustomer({
        sb: req.sb,
        orgId: req.orgId,
        env: req.env,
        customer: {
          id: customer_id,
          name: customer_data?.name,
          email: customer_data?.email,
          fingerprint: customer_data?.fingerprint,
        },
      });
    }

    // 2. Get features & credit systems
    const orgId = req.orgId;
    const { feature, creditSystems } = await getFeaturesAndCreditSystems({
      pg: req.pg,
      orgId,
      feature_id,
      env: req.env,
    });

    if (!feature) {
      throw new RecaseError({
        message: "Feature not found",
        code: ErrCode.FeatureNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    const internalFeatureIds = [
      feature.internal_id,
      ...creditSystems.map((cs) => cs.internal_id),
    ];

    const cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
      sb: req.sb,
      internalCustomerId: customer.internal_id,
      internalFeatureIds,
    });

    console.log(
      "Feature:",
      feature.id,
      "| Credit Systems:",
      creditSystems.map((cs) => cs.id)
    );
    console.log(
      "Customer Entitlements:",
      cusEnts?.map((ent) => {
        return `${ent.feature_id} - ${ent.balance}`;
      })
    );

    const { allowed, balances } = await checkFeatureAccessAllowed({
      originalFeature: feature,
      creditSystems,
      cusEnts: cusEnts!,
      quantity,
    });

    // Send event if event_data is provided
    if (allowed && event_data) {
      await handleEventSent({
        req,
        customer_id: customer_id,
        customer_data: customer_data,
        event_data: {
          customer_id: customer_id,
          ...event_data,
        },
      });
      // await sendFeatureEvent({
      //   minOrg: req.minOrg,
      //   env: req.env,
      //   featureId: feature.id,
      //   eventData: event_data,
      // });
    }

    res.status(200).send({ allowed, balances });
  } catch (error) {
    handleRequestError({ req, error, res, action: "Failed to GET entitled" });
  }
});
