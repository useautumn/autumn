import { ErrCode } from "@/errors/errCodes.js";
import RecaseError, { handleRequestError } from "@/utils/errorUtils.js";
import {
  AllowanceType,
  APIVersion,
  CusProductStatus,
  Feature,
  FeatureType,
  FullCustomerEntitlement,
  Organization,
} from "@autumn/shared";

import { Router } from "express";
import { StatusCodes } from "http-status-codes";

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
import { OrgService } from "@/internal/orgs/OrgService.js";
import { SuccessCode } from "@autumn/shared";
import { handleProductCheck } from "./handlers/handleProductCheck.js";
import { getBooleanEntitledResult } from "./checkUtils.js";
import { getOrCreateCustomer } from "@/internal/customers/cusUtils/getOrCreateCustomer.js";
import { CusService } from "@/internal/customers/CusService.js";
import { getCheckPreview } from "./getCheckPreview.js";

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
      console.log("Feature not found", feature.id);
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

// Main functions
const getFeatureAndCreditSystems = async ({
  req,
  featureId,
}: {
  req: any;
  featureId: string;
}) => {
  const features = await FeatureService.getFromReq(req);

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

const logEntitled = ({
  req,
  customer_id,
  cusEnts,
}: {
  req: any;
  customer_id: string;
  cusEnts: FullCustomerEntitlement[];
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
  logger,
}: {
  req: any;
  sb: SupabaseClient;
  logger: any;
}) => {
  let { customer_id, feature_id, customer_data } = req.body;
  let { sb, orgId, env } = req;

  // 1. Get org and features
  const startTime = Date.now();

  // Fetch org, feature, and customer in parallel
  const [org, featureRes, customer] = await Promise.all([
    OrgService.getFromReq(req),
    getFeatureAndCreditSystems({
      req,
      featureId: feature_id,
    }),
    getOrCreateCustomer({
      sb,
      org: req.org,
      env,
      customerId: customer_id,
      customerData: customer_data,
      inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
      logger,
    }),
  ]);

  const { feature, creditSystems } = featureRes;

  const duration = Date.now() - startTime;
  console.log(`/check: fetched org, features & customer in ${duration}ms`);

  if (!feature) {
    throw new RecaseError({
      message: "Feature not found",
      code: ErrCode.FeatureNotFound,
      statusCode: StatusCodes.NOT_FOUND,
    });
  }

  let cusProducts = customer.customer_products;
  if (!org.config.include_past_due) {
    cusProducts = cusProducts.filter(
      (cusProduct) => cusProduct.status !== CusProductStatus.PastDue
    );
  }

  // For logging purposes...
  let cusEnts = cusProducts.flatMap((cusProduct) => {
    return cusProduct.customer_entitlements.map((cusEnt) => {
      return {
        ...cusEnt,
        customer_product: cusProduct,
      };
    });
  });

  return { cusEnts, feature, creditSystems, org, cusProducts };
};

entitledRouter.post("", async (req: any, res: any) => {
  try {
    let {
      customer_id,
      feature_id,
      product_id,
      required_quantity,
      customer_data,
      send_event,
      event_data,
      entity_id,
    } = req.body;

    if (!customer_id) {
      throw new RecaseError({
        message: "Customer ID is required",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (!feature_id && !product_id) {
      throw new RecaseError({
        message: "Feature ID or product ID is required",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (feature_id && product_id) {
      throw new RecaseError({
        message:
          "Provide either feature_id or product_id. Not allowed to provide both.",
        code: ErrCode.InvalidRequest,
        statusCode: StatusCodes.BAD_REQUEST,
      });
    }

    if (product_id) {
      await handleProductCheck({ req, res });
      return;
    }

    const quantity = required_quantity ? parseInt(required_quantity) : 1;

    const { sb } = req;

    const { cusEnts, feature, creditSystems, org, cusProducts } =
      await getCusEntsAndFeatures({
        sb,
        req,
        logger: req.logtail,
      });

    logEntitled({ req, customer_id, cusEnts: cusEnts! });

    // 2. If boolean, return true
    if (feature.type === FeatureType.Boolean) {
      return getBooleanEntitledResult({
        customer_id,
        res,
        cusEnts,
        feature,
        org,
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

    if (allowed && req.isPublic !== true) {
      if (send_event) {
        await handleEventSent({
          req: {
            ...req,
            body: {
              ...req.body,
              value: quantity,
            },
          },
          customer_id: customer_id,
          customer_data: customer_data,
          event_data: {
            customer_id: customer_id,
            feature_id: feature_id,
            value: quantity,
            entity_id: entity_id,
          },
        });
      } else if (notNullish(event_data)) {
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
    }

    // 3. If with preview, get preview
    let preview = undefined;
    if (req.body.with_preview) {
      let featureToUse = creditSystems.length > 0 ? creditSystems[0] : feature;
      preview = await getCheckPreview({
        allowed,
        balance: balances.find(
          (balance: any) => balance.feature_id === featureToUse.id
        )?.balance,
        feature: featureToUse,
        sb,
        cusProducts,
      });
    }

    if (org.api_version == APIVersion.v1_1) {
      let balance;
      if (creditSystems.length > 0) {
        let creditSystem = creditSystems[0];
        balance = balances.find(
          (balance: any) => balance.feature_id === creditSystem.id
        );
      } else {
        balance = balances.find(
          (balance: any) => balance.feature_id === feature.id
        );
      }

      res.status(200).json({
        customer_id,
        feature_id: balance?.feature_id || feature_id,
        required_quantity: quantity,
        code: SuccessCode.FeatureFound,

        allowed,
        unlimited: balance?.unlimited || false,
        balance: balance?.unlimited ? null : balance?.balance,
        preview,
      });
    } else {
      res.status(200).json({
        allowed,
        balances,
        preview,
      });
    }

    return;
  } catch (error) {
    handleRequestError({ req, error, res, action: "Failed to GET entitled" });
  }
});

// const batchQuery = [
//   CustomerEntitlementService.getCustomerAndEnts({
//     sb,
//     customerId: customer_id,
//     orgId,
//     env,
//     inStatuses: org.config?.include_past_due
//       ? [CusProductStatus.Active, CusProductStatus.PastDue]
//       : [CusProductStatus.Active],
//   }).then((result) => {
//     timings.cusEnts = Date.now() - startParallel;
//     return result;
//   }),
//   getFeaturesAndCreditSystems2({
//     sb,
//     orgId,
//     env,
//     featureId: feature_id,
//   }).then((result) => {
//     timings.features = Date.now() - startParallel;
//     return result;
//   }),
// ];

// const getCusEntsActiveInFeatureIds = ({
//   cusWithEnts,
//   features,
// }: {
//   cusWithEnts: CusWithEnts;
//   features: Feature[];
// }) => {
//   const internalFeatureIds = features.map((feature) => feature.internal_id);
//   const cusEnts = cusWithEnts.customer_entitlements;

//   if (
//     cusWithEnts.customer_products.length === 0 ||
//     cusWithEnts.customer_entitlements.length == 0
//   ) {
//     return [];
//   }

//   const activeCusEnts = cusEnts
//     .filter((cusEnt) => {
//       return (
//         internalFeatureIds.includes(cusEnt.internal_feature_id) &&
//         cusWithEnts.customer_products.some(
//           (product) => product.id === cusEnt.customer_product_id
//         )
//       );
//     })
//     .map((ent) => {
//       return {
//         ...ent,
//         customer_product: cusWithEnts.customer_products.find(
//           (cusProduct) => cusProduct.id === ent.customer_product_id
//         ),
//       };
//     });

//   // no need to sort?
//   return activeCusEnts;
// };
