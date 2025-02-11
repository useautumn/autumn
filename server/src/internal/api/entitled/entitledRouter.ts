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
    const allowed = cusEnts.some(
      (ent) => ent.feature_id === originalFeature.id
    );
    return {
      allowed,
      balances: allowed
        ? [
            {
              feature_id: originalFeature.id,
              balance: null,
            },
          ]
        : [],
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

    // Unlimited
    const hasUnlimited = cusEnts.some(
      (ent) =>
        ent.internal_feature_id === feature.internal_id &&
        ent.entitlement.allowance_type === AllowanceType.Unlimited
    );

    const hasUsageAllowed = cusEnts.some(
      (ent) =>
        ent.internal_feature_id === feature.internal_id && ent.usage_allowed
    );

    if (hasUnlimited) {
      allowed = true;
    } else if (hasUsageAllowed) {
      allowed = true;
    } else if (allowance.balance! < allowance.required) {
      allowed = false;
    }

    // if (!allowance.unlimited && allowance.balance! < allowance.required) {
    //   allowed = false;
    // }

    balances.push({
      feature_id: feature.id,
      required: allowance.required,
      balance: hasUnlimited ? null : allowance.balance,
      unlimited: hasUnlimited ? true : undefined,
      usage_allowed: hasUsageAllowed ? true : undefined,
    });
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

  if (
    cusWithEnts.customer_products.length === 0 ||
    cusWithEnts.customer_entitlements.length == 0
  ) {
    return [];
  }

  const activeCusEnts = cusEnts
    .filter((cusEnt) => {
      return (
        internalFeatureIds.includes(cusEnt.internal_feature_id) &&
        cusWithEnts.customer_products.some(
          (product) => product.id === cusEnt.customer_product_id
        )
      );
    })
    .map((ent) => {
      return {
        ...ent,
        customer_product: cusWithEnts.customer_products.find(
          (cusProduct) => cusProduct.id === ent.customer_product_id
        ),
      };
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
      `CusEnts (${customer_id}):`,
      cusEnts.map((cusEnt: any) => {
        let balanceStr = cusEnt.balance;

        try {
          if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
            balanceStr = "Unlimited";
          } else if (cusEnt.entitlement.allowance_type === AllowanceType.None) {
            balanceStr = "None";
          }
        } catch (error) {}

        return `${cusEnt.feature_id} - ${balanceStr} (${
          cusEnt.customer_product ? cusEnt.customer_product.product_id : ""
        })`;
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
  } catch (error) {
    handleRequestError({ req, error, res, action: "Failed to GET entitled" });
  }
});

// // 1. Get all features / credit systems for a particular feature_id
// const getFeaturesAndCreditSystems = async ({
//   pg,
//   orgId,
//   feature_id,
//   env,
// }: {
//   pg: Client;
//   orgId: string;
//   feature_id: string;
//   env: string;
// }) => {
//   const query = `
//   select * from features WHERE EXISTS (
//       SELECT 1 FROM jsonb_array_elements(config->'schema') as schema_element WHERE
//       type = 'credit_system'
//       AND org_id = '${orgId}'
//       AND schema_element->>'metered_feature_id' = '${feature_id}'
//       AND env = '${env}'
//   )

//   UNION all

//   SELECT * FROM features
//   WHERE org_id = '${orgId}'
//   AND id = '${feature_id}'
//   AND env = '${env}'`;

//   const { rows } = await pg.query(query);

//   const feature = rows.find((row: any) => row.id === feature_id);
//   const creditSystems = rows.filter(
//     (row: any) => row.type === "credit_system" && row.id !== feature_id
//   );

//   return { feature, creditSystems };
// };
