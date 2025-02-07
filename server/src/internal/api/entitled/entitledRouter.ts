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
  CusProduct,
  CusProductStatus,
  Customer,
  CustomerEntitlement,
  Feature,
  FeatureType,
} from "@autumn/shared";

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { Client } from "pg";
import { z } from "zod";
import { createNewCustomer } from "../customers/cusUtils.js";
import { handleEventSent } from "../events/eventRouter.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { SupabaseClient } from "@supabase/supabase-js";

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

const checkFeatureAccessAllowed = ({
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

// 1. Get entitlements for customer

// 1. From features, get relevant features & credit systems
const getFeaturesAndCreditSystems2 = async ({
  sb,
  orgId,
  env,
  featureId,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: string;
  featureId: string;
}) => {
  const features = await FeatureService.getFeatures({
    sb,
    orgId,
    env,
  });

  const feature: Feature | undefined = features.find(
    (feature) => feature.id === featureId
  );

  const creditSystems: Feature[] = features.filter((feature) => {
    return (
      feature.type == FeatureType.CreditSystem &&
      feature.config.schema.some(
        (schema: any) => schema.metered_feature_id === featureId
      )
    );
  });

  return { feature, creditSystems };
};

type CusWithEnts = Customer & {
  customer_products: CusProduct[];
  customer_entitlements: CusEntWithEntitlement[];
};

const getCusEntsActiveInFeatureIds = ({
  cusWithEnts,
  features,
}: {
  cusWithEnts: CusWithEnts;
  features: Feature[];
}) => {
  const internalFeatureIds = features.map((feature) => feature.internal_id);
  const cusEnts = cusWithEnts.customer_entitlements;

  const activeCusEnts = cusEnts.filter((cusEnt) => {
    return (
      internalFeatureIds.includes(cusEnt.internal_feature_id) &&
      cusWithEnts.customer_products.some(
        (product) => product.id === cusEnt.customer_product_id
      )
    );
  });

  return activeCusEnts;
};

const EntitledSchema = z.object({
  customer_id: z.string(),
  feature_id: z.string(),
  quantity: z.number().optional(),
});

entitledRouter.post("", async (req: any, res: any) => {
  let { customer_id, feature_id, quantity, customer_data, event_data } =
    req.body;

  quantity = quantity ? parseInt(quantity) : 1;

  const { orgId, env, sb } = req;

  try {
    const timings: Record<string, number> = {};

    const startParallel = Date.now();
    const batchQuery = [
      CustomerEntitlementService.getCustomerAndEnts({
        sb,
        customerId: customer_id,
        orgId,
        env,
      }).then((result) => {
        timings.cusEnts = Date.now() - startParallel;
        return result;
      }),
      getFeaturesAndCreditSystems2({
        sb,
        orgId,
        env,
        featureId: feature_id,
      }).then((result) => {
        timings.features = Date.now() - startParallel;
        return result;
      }),
    ];

    const [res1, res2] = await Promise.all(batchQuery);
    const totalTime = Date.now() - startParallel;

    console.log("Query timings:", {
      customerEntitlements: timings.cusEnts,
      features: timings.features,
      total: totalTime,
    });

    const { feature, creditSystems }: any = res2;

    if (!feature) {
      throw new RecaseError({
        message: "Feature not found",
        code: ErrCode.FeatureNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    let cusEnts: CusEntWithEntitlement[] | null = null;
    if (!res1) {
      let customer = await createNewCustomer({
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

      cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
        sb: req.sb,
        internalCustomerId: customer.internal_id,
        internalFeatureIds: [
          ...creditSystems.map((cs: any) => cs.internal_id),
          feature.internal_id,
        ],
      });
    } else {
      cusEnts = getCusEntsActiveInFeatureIds({
        cusWithEnts: res1 as CusWithEnts,
        features: [feature, ...creditSystems],
      });
    }

    console.log(
      "Relevant customer entitlements:",
      cusEnts.map((ent) => {
        return `${ent.feature_id} - ${ent.balance}`;
      })
    );

    const { allowed, balances } = checkFeatureAccessAllowed({
      originalFeature: feature,
      creditSystems,
      cusEnts: cusEnts!,
      quantity,
    });

    if (allowed && event_data) {
      handleEventSent({
        req,
        customer_id: customer_id,
        customer_data: customer_data,
        event_data: {
          customer_id: customer_id,
          ...event_data,
        },
      });
    }

    res.status(200).send({
      allowed,
      balances,
    });
    return;

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
    // Time this?
    // Time this

    const startTime = Date.now();

    let customer = await CusService.getCustomer({
      sb: req.sb,
      orgId: req.orgId,
      customerId: customer_id,
      env: req.env,
    });
    const duration = Date.now() - startTime;
    console.log(`Time taken to get customer: ${duration}ms`);

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

    // const startTime2 = Date.now();
    // const { feature, creditSystems } = await getFeaturesAndCreditSystems({
    //   pg: req.pg,
    //   orgId,
    //   feature_id,
    //   env: req.env,
    // });
    // const duration2 = Date.now() - startTime2;
    // console.log(`Time taken to get features & credit systems: ${duration2}ms`);

    // if (!feature) {
    //   throw new RecaseError({
    //     message: "Feature not found",
    //     code: ErrCode.FeatureNotFound,
    //     statusCode: StatusCodes.NOT_FOUND,
    //   });
    // }

    // const internalFeatureIds = [
    //   feature.internal_id,
    //   ...creditSystems.map((cs: any) => cs.internal_id),
    // ];

    // const startTime3 = Date.now();

    // const cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
    //   sb: req.sb,
    //   internalCustomerId: customer.internal_id,
    //   internalFeatureIds,
    // });
    // const duration3 = Date.now() - startTime3;
    // console.log(`Time taken to get customer entitlements: ${duration3}ms`);

    // console.log(
    //   "Feature:",
    //   feature.id,
    //   "| Credit Systems:",
    //   creditSystems.map((cs) => cs.id)
    // );
    // console.log(
    //   "Customer Entitlements:",
    //   cusEnts?.map((ent) => {
    //     return `${ent.feature_id} - ${ent.balance}`;
    //   })
    // );

    // const { allowed, balances } = await checkFeatureAccessAllowed({
    //   originalFeature: feature,
    //   creditSystems,
    //   cusEnts: cusEnts!,
    //   quantity,
    // });

    // // Send event if event_data is provided
    // if (allowed && event_data) {
    //   handleEventSent({
    //     req,
    //     customer_id: customer_id,
    //     customer_data: customer_data,
    //     event_data: {
    //       customer_id: customer_id,
    //       ...event_data,
    //     },
    //   });
    // }

    // res.status(200).send({ allowed, balances });
  } catch (error) {
    handleRequestError({ error, res, action: "Failed to GET entitled" });
  }
});
