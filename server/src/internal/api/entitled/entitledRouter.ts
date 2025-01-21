import { ErrCode } from "@/errors/errCodes.js";
import { CusService } from "@/internal/customers/CusService.js";
import RecaseError, {
  formatZodError,
  handleRequestError,
} from "@/utils/errorUtils.js";
import { CusEntWithEntitlement, Feature, FeatureType } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";
import { z } from "zod";

export const entitledRouter = Router();

// 1. Get all features / credit systems for a particular feature_id
const getFeaturesAndCreditSystems = async (
  pg: Client,
  orgId: string,
  feature_id: string
) => {
  const query = `
  select * from features WHERE EXISTS (
      SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
      type = 'credit_system'
      AND org_id = '${orgId}' 
      AND schema_element->>'metered_feature_id' = '${feature_id}'
  ) 

  UNION all

  SELECT * FROM features 
  WHERE org_id = '${orgId}' 
  AND id = '${feature_id}'`;

  const { rows } = await pg.query(query);

  const feature = rows.find((row: any) => row.id === feature_id);
  const creditSystems = rows.filter(
    (row: any) => row.type === "credit_system" && row.id !== feature_id
  );

  return { feature, creditSystems };
};

const getCustomerEntitlements = async ({
  sb,
  orgId,
  internalCustomerId,
  internalFeatureIds,
}: {
  sb: SupabaseClient;
  orgId: string;
  internalCustomerId: string;
  internalFeatureIds: string[];
}) => {
  const { data: cusEnts, error } = await sb
    .from("customer_entitlements")
    .select("*, customer_product:customer_products(*)")
    .eq("internal_customer_id", internalCustomerId)
    .in("internal_feature_id", internalFeatureIds)
    .eq("customer_product.status", "active");

  return cusEnts;
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
      balance += cusEnt.balance!;
    }
  }

  return balance;
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
    id: feature.id,
    balance: balance,
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

    if (allowance.balance < allowance.required) {
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

entitledRouter.get("", async (req: any, res: any) => {
  let { customer_id, feature_id, quantity } = req.query;

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
    const customer = await CusService.getCustomer({
      sb: req.sb,
      orgId: req.orgId,
      customerId: customer_id,
      env: req.env,
    });

    if (!customer) {
      throw new RecaseError({
        message: `Customer ${customer_id} not found`,
        code: ErrCode.CustomerNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    console.log("Reached here");

    // 2. Get features & credit systems
    const orgId = req.orgId;
    const { feature, creditSystems } = await getFeaturesAndCreditSystems(
      req.pg,
      orgId,
      feature_id
    );

    if (!feature) {
      throw new RecaseError({
        message: "Feature not found",
        code: ErrCode.FeatureNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    // 3. Get customer entitlements, where cp is active
    const cusEnts = await getCustomerEntitlements({
      sb: req.sb,
      orgId,
      internalCustomerId: customer.internal_id,
      internalFeatureIds: [
        feature.internal_id,
        ...creditSystems.map((cs) => cs.internal_id),
      ],
    });

    const { allowed, balances } = await checkFeatureAccessAllowed({
      originalFeature: feature,
      creditSystems,
      cusEnts: cusEnts!,
      quantity,
    });

    res.status(200).send({ allowed, balances });
  } catch (error) {
    handleRequestError(error, res, "Failed to GET entitled");
  }
});
