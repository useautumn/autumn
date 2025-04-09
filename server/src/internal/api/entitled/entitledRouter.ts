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
  FullCustomerEntitlement,
  Organization,
} from "@autumn/shared";

import { Router } from "express";
import { StatusCodes } from "http-status-codes";
import { z } from "zod";
import { createNewCustomer } from "../customers/handlers/handleCreateCustomer.js";
import { handleEventSent } from "../events/eventRouter.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  cusEntsContainFeature,
  getFeatureBalance,
  getUnlimitedAndUsageAllowed,
} from "@/internal/customers/entitlements/cusEntUtils.js";
import { featureToCreditSystem } from "@/internal/features/creditSystemUtils.js";
import { notNullish } from "@/utils/genUtils.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";
import { OrgService } from "@/internal/orgs/OrgService.js";
import { getMinNextResetAtCusEnt } from "@/internal/customers/entitlements/cusEntHelpers.js";
import { getOrCreateCustomer, updateCustomerDetails } from "../customers/cusUtils.js";

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
  entityId,
}: {
  cusEnts: FullCustomerEntitlement[];
  feature: Feature;
  originalFeatureId: string;
  required: number;
  entityId: string;
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
    entityId,
  });

  return {
    required: requiredBalance,
    actual: actualBalance,
    entityId,
  };
};

const getMeteredEntitledResult = ({
  originalFeature,
  creditSystems,
  cusEnts,
  quantity,
  entityId,
  org,
}: {
  originalFeature: Feature;
  creditSystems: Feature[];
  cusEnts: FullCustomerEntitlement[];
  quantity: number;
  entityId: string;
  org: Organization;
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
              entityId,
            }),
      });

      // if (org.config.api_version >= BREAK_API_VERSION) {
      //   balances[balances.length - 1].next_reset_at = getMinNextResetAtCusEnt({
      //     cusEnts,
      //     feature,
      //   });
      //   balances[balances.length - 1].allowance = getTotalAllowanceFromCusEnts({
      //     cusEnts,
      //     feature,
      //   });
      // }
      continue;
    }

    // 3. Get required and actual balance
    const { required, actual } = getRequiredAndActualBalance({
      cusEnts,
      feature,
      originalFeatureId: originalFeature.id,
      required: quantity,
      entityId,
    });

    let newBalance: any = {
      feature_id: feature.id,
      required,
      balance: actual,
    };

    if (org.config.api_version >= BREAK_API_VERSION) {
      // newBalance.next_reset_at = getMinNextResetAtCusEnt({
      //   cusEnts,
      //   feature,
      // });
      // newBalance.allowance = getTotalAllowanceFromCusEnts({
      //   cusEnts,
      //   feature,
      // });
      // newBalance.used = getTotalUsedFromCusEnts({
      //   cusEnts,
      //   feature,
      //   entityId,
      // });
      // newBalance.required = required;
      // newBalance.usage_allowed = false;
      // newBalance.unlimited = false;
    }

    // feature.config.group_by will always be defined
    // TODO: Rework this...
    if (entityId) {
      newBalance.entity_id = entityId;
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
    OrgService.getFullOrg({
      sb,
      orgId,
    })
  ];

  const [res1, res2, org] = await Promise.all(batchQuery);
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
    const customer = await getOrCreateCustomer({
      sb,
      orgId,
      env,
      customerId: customer_id,
      customerData: customer_data,
      logger: req.logtail,
    });

    cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
      sb,
      internalCustomerId: customer.internal_id,
      internalFeatureIds: [
        ...creditSystems.map((cs: any) => cs.internal_id),
        feature.internal_id,
      ],
    });
  } else {
    await updateCustomerDetails({
      sb,
      customer: res1,
      customerData: customer_data,
      logger: req.logtail,
    });

    cusEnts = getCusEntsActiveInFeatureIds({
      cusWithEnts: res1 as CusWithEnts,
      features: [feature, ...creditSystems],
    });
  }

  return { cusEnts, feature, creditSystems, org };
};

entitledRouter.post("", async (req: any, res: any) => {

  try {
    let {
      customer_id,
      feature_id,
      required_quantity,
      customer_data,
      event_data,
      entity_id,
    } = req.body;
  
    const quantity = required_quantity ? parseInt(required_quantity) : 1;
  
    const { orgId, env, sb } = req;

    // 1. Get cusEnts & features
    const { cusEnts, feature, creditSystems, org } = await getCusEntsAndFeatures({
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

    const { allowed, balances } = getMeteredEntitledResult({
      originalFeature: feature,
      creditSystems,
      cusEnts: cusEnts! as FullCustomerEntitlement[],
      quantity,
      entityId: entity_id,
      org,
    });


    if (allowed && notNullish(event_data) && req.isPublic !== true) {
      await handleEventSent({
        req,
        customer_id: customer_id,
        customer_data: customer_data,
        event_data: {
          customer_id: customer_id,
          feature_id: feature_id,
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
