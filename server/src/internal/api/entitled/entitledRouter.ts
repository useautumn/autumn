import { ErrCode } from "@/errors/errCodes.js";
import { CusService } from "@/internal/customers/CusService.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import {
  AllowanceType,
  CusEntWithEntitlement,
  CusProduct,
  Customer,
  Feature,
  FeatureType,
} from "@autumn/shared";

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { createNewCustomer } from "../customers/cusUtils.js";
import { handleEventSent } from "../events/eventRouter.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  cusEntsContainFeature,
  getFeatureBalance,
  getUnlimitedAndUsageAllowed,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { notNullOrUndefined } from "@/utils/genUtils.js";
import {
  getGroupBalanceFromEvent,
  initGroupBalances,
} from "@/internal/customers/entitlements/groupByUtils.js";

type CusWithEnts = Customer & {
  customer_products: CusProduct[];
  customer_entitlements: CusEntWithEntitlement[];
};

const EntitledSchema = z.object({
  customer_id: z.string(),
  feature_id: z.string(),
  required_quantity: z.number(),
});

export const entitledRouter = Router();

const getRequiredAndActualBalance = ({
  cusEnts,
  feature,
  originalFeatureId,
  required,
  group,
}: {
  cusEnts: CusEntWithEntitlement[];
  feature: Feature;
  originalFeatureId: string;
  required: number;
  group: any;
}) => {
  let requiredBalance = required;
  if (
    feature.type === FeatureType.CreditSystem &&
    feature.id !== originalFeatureId
  ) {
    requiredBalance = featureToCreditSystem({
      featureId: originalFeatureId,
      creditSystem: feature,
      amount: required,
    });
  }

  const actualBalance = getFeatureBalance({
    cusEnts,
    internalFeatureId: feature.internal_id!,
    group,
  });

  return {
    required: requiredBalance,
    actual: actualBalance,
    group,
  };
};

const getMeteredEntitledResult = ({
  originalFeature,
  creditSystems,
  cusEnts,
  quantity,
  group,
}: {
  originalFeature: Feature;
  creditSystems: Feature[];
  cusEnts: CusEntWithEntitlement[];
  quantity: number;
  group: any;
}) => {
  // If no entitlements -> return false
  if (!cusEnts || cusEnts.length === 0) {
    return {
      allowed: false,
      balances: [],
    };
  }

  let allowed = true;
  const balances = [];

  for (const feature of [originalFeature, ...creditSystems]) {
    // 1. Skip if feature not among cusEnt
    if (!cusEntsContainFeature({ cusEnts, feature })) {
      continue;
    }

    // 2. Handle unlimited / usage allowed features
    let { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
      cusEnts,
      internalFeatureId: feature.internal_id!,
    });

    if (unlimited || usageAllowed) {
      balances.push({
        feature_id: feature.id,
        unlimited,
        usage_allowed: usageAllowed,
        required: null,
        balance: unlimited
          ? null
          : getFeatureBalance({
              cusEnts,
              internalFeatureId: feature.internal_id!,
              group,
            }),
      });
      continue;
    }

    // 3. Get required and actual balance
    const { required, actual } = getRequiredAndActualBalance({
      cusEnts,
      feature,
      originalFeatureId: originalFeature.id,
      required: quantity,
      group,
    });

    let newBalance: any = {
      feature_id: feature.id,
      required,
      balance: actual,
    };

    // feature.config.group_by will always be defined
    // TODO: Rework this...
    if (group) {
      let groupField = feature.config?.group_by?.property;
      newBalance[groupField] = group;
    }

    balances.push(newBalance);

    allowed = allowed && actual! >= required;
  }

  return {
    allowed,
    balances,
  };
};

// Helper functions
const getBooleanEntitledResult = ({
  cusEnts,
  res,
  feature,
}: {
  cusEnts: CusEntWithEntitlement[];
  res: any;
  feature: Feature;
}) => {
  const allowed = cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id
  );
  return res.status(200).send({
    allowed,
    balances: allowed
      ? [
          {
            feature_id: feature.id,
            balance: null,
          },
        ]
      : [],
  });
};

// Main functions
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

  // no need to sort?
  return activeCusEnts;
};

const logEntitled = ({
  req,
  customer_id,
  cusEnts,
}: {
  req: any;
  customer_id: string;
  cusEnts: CusEntWithEntitlement[];
}) => {
  try {
    console.log(
      `${req.isPublic ? "(Public) " : ""}CusEnts (${customer_id}):`,
      cusEnts.map((cusEnt: any) => {
        let balanceStr = cusEnt.balance;
        let group = req.body.group;

        try {
          if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
            balanceStr = "Unlimited";
          } else if (group) {
            let groupBalance = cusEnt.balances?.[group].balance;
            balanceStr = `${groupBalance || "null"} (${group})`;
          }
        } catch (error) {
          balanceStr = "failed_to_get_balance";
        }

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
  } catch (error) {
    console.log("Failed to log entitled", error);
  }
};

// FETCH FUNCTION
const getCusEntsAndFeatures = async ({
  req,
}: {
  req: any;
  sb: SupabaseClient;
}) => {
  const timings: Record<string, number> = {};

  let { customer_id, feature_id, customer_data } = req.body;
  let { sb, orgId, env } = req;

  // 1. Get customer entitlements & features / credit systems
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

  // 2. Get active customer entitlements for features
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
    // Check if customer exists
    let customer = await CusService.getById({
      sb: req.sb,
      id: customer_id,
      orgId: req.orgId,
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

    cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
      sb,
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

  return { cusEnts, feature, creditSystems };
};

entitledRouter.post("", async (req: any, res: any) => {
  let {
    customer_id,
    feature_id,
    required_quantity,
    customer_data,
    event_data,
    group,
  } = req.body;

  const quantity = required_quantity ? parseInt(required_quantity) : 1;

  const { orgId, env, sb } = req;

  try {
    // 1. Get cusEnts & features
    const { cusEnts, feature, creditSystems } = await getCusEntsAndFeatures({
      sb,
      req,
    });
    logEntitled({ req, customer_id, cusEnts: cusEnts! });

    // 2. If boolean, return true
    if (feature.type === FeatureType.Boolean) {
      return getBooleanEntitledResult({
        res,
        cusEnts,
        feature,
      });
    }

    // 3. If group is provided, but feature does not have group_by, throw error
    if (notNullOrUndefined(group) && !feature.config?.group_by) {
      throw new RecaseError({
        message: `Feature ${feature.id} does not support group_by`,
        code: ErrCode.FeatureNotFound,
        statusCode: StatusCodes.NOT_FOUND,
      });
    }

    if (notNullOrUndefined(group)) {
      await initGroupBalances({
        sb,
        cusEnts: cusEnts!,
        groupValue: group,
        feature,
      });
    }

    const { allowed, balances } = getMeteredEntitledResult({
      originalFeature: feature,
      creditSystems,
      cusEnts: cusEnts!,
      quantity,
      group,
    });

    if (allowed && event_data && !req.isPublic) {
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
