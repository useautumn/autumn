import { ErrCode } from "@/errors/errCodes.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { CusProdReadService } from "@/internal/customers/products/CusProdReadService.js";

import { FeatureService } from "@/internal/features/FeatureService.js";
import {
  getObjectsUsingFeature,
  validateCreditSystem,
} from "@/internal/features/featureUtils.js";
import { validateMeteredConfig } from "@/internal/features/featureUtils.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import { JobName } from "@/queue/JobName.js";
import { addTaskToQueue } from "@/queue/queueUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { keyToTitle } from "@/utils/genUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import {
  Entitlement,
  Feature,
  FeatureType,
  Price,
  UsagePriceConfig,
  AppEnv,
  EntitlementWithFeature,
  EntInterval,
  FeatureUsageType,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

const handleFeatureIdChanged = async ({
  sb,
  orgId,
  env,
  feature,
  linkedEntitlements,
  entitlements,
  prices,
  creditSystems,
  newId,
  logger,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  feature: Feature;
  linkedEntitlements: Entitlement[];
  entitlements: Entitlement[];
  prices: Price[];
  creditSystems: Feature[];
  newId: string;
  logger: any;
}) => {
  // 1. Check if any customer entitlement linked to this feature
  let cusEnts = await CustomerEntitlementService.getByFeature({
    sb,
    internalFeatureId: feature.internal_id!,
  });

  if (cusEnts.length > 0) {
    throw new RecaseError({
      message: `Cannot change id of feature ${feature.id} because a customer is using it`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }

  // 2. Update all linked objects
  let batchUpdate = [];
  for (let entitlement of linkedEntitlements) {
    batchUpdate.push(
      EntitlementService.update({
        sb,
        entitlementId: entitlement.id!,
        updates: {
          entity_feature_id: newId,
        },
      })
    );
  }

  await Promise.all(batchUpdate);

  // 3. Update all linked prices
  let priceUpdate = [];
  for (let price of prices) {
    priceUpdate.push(
      PriceService.update({
        sb,
        priceId: price.id!,
        update: {
          config: {
            ...price.config,
            feature_id: newId,
          } as UsagePriceConfig,
        },
      })
    );
  }

  await Promise.all(priceUpdate);

  // 4. Update all linked credit systems
  let creditSystemUpdate = [];
  for (let creditSystem of creditSystems) {
    let newSchema = structuredClone(creditSystem.config.schema);
    for (let i = 0; i < newSchema.length; i++) {
      if (newSchema[i].metered_feature_id === feature.id) {
        newSchema[i].metered_feature_id = newId;
      }
    }
    creditSystemUpdate.push(
      FeatureService.updateStrict({
        sb,
        featureId: creditSystem.id!,
        updates: {
          config: {
            ...creditSystem.config,
            schema: newSchema,
          },
        },
        orgId,
        env,
        logger,
      })
    );
  }

  await Promise.all(creditSystemUpdate);

  // 5. Update all linked entitlements
  let entitlementUpdate = [];
  for (let entitlement of entitlements) {
    entitlementUpdate.push(
      EntitlementService.update({
        sb,
        entitlementId: entitlement.id!,
        updates: {
          feature_id: newId,
        },
      })
    );
  }

  await Promise.all(entitlementUpdate);
};

const handleFeatureUsageTypeChanged = async ({
  sb,
  orgId,
  env,
  feature,
  newUsageType,
  linkedEntitlements,
  entitlements,
  prices,
  creditSystems,
}: {
  sb: SupabaseClient;
  orgId: string;
  env: AppEnv;
  feature: Feature;
  newUsageType: FeatureUsageType;
  linkedEntitlements: EntitlementWithFeature[];
  entitlements: EntitlementWithFeature[];
  prices: Price[];
  creditSystems: Feature[];
}) => {
  let usageTypeTitle = keyToTitle(newUsageType).toLowerCase();
  if (creditSystems.length > 0) {
    throw new RecaseError({
      message: `Cannot set to ${usageTypeTitle} because it is used in credit system ${creditSystems[0].id}`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }

  if (linkedEntitlements.length > 0) {
    throw new RecaseError({
      message: `Cannot set to ${usageTypeTitle} because it is used as an entity by ${linkedEntitlements[0].feature.name}`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }

  // Get cus product using feature...
  let cusEnts = await CustomerEntitlementService.getByFeature({
    sb,
    internalFeatureId: feature.internal_id!,
  });

  if (cusEnts && cusEnts.length > 0) {
    throw new RecaseError({
      message: `Cannot set to ${usageTypeTitle} because it is / was used by customers`,
      code: ErrCode.InvalidFeature,
      statusCode: 400,
    });
  }

  if (entitlements.length > 0) {
    console.log(
      `Feature usage type changed to ${newUsageType}, updating entitlements and prices`
    );
    if (newUsageType == FeatureUsageType.Continuous) {
      let batchEntUpdate = [];
      for (let entitlement of entitlements) {
        batchEntUpdate.push(
          EntitlementService.update({
            sb,
            entitlementId: entitlement.id!,
            updates: {
              interval: EntInterval.Lifetime,
            },
          })
        );
      }

      await Promise.all(batchEntUpdate);
      console.log(`Updated ${entitlements.length} entitlements`);
    }
  }

  if (prices.length > 0) {
    let batchPriceUpdate = [];
    for (let price of prices) {
      let priceConfig = price.config as UsagePriceConfig;

      batchPriceUpdate.push(
        PriceService.update({
          sb,
          priceId: price.id!,
          update: {
            config: {
              ...priceConfig,
              should_prorate:
                newUsageType == FeatureUsageType.Continuous ? false : true, // if continuous, don't prorate -> get usage_in_arrear type...
              stripe_price_id: null,
            },
          },
        })
      );
    }

    await Promise.all(batchPriceUpdate);
    console.log(`Updated ${prices.length} prices`);
  }

  // // Allow update for entitlement / price?
  // if (entitlements.length > 0) {
  // }
};

export const handleUpdateFeature = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Update feature",
    handler: async () => {
      let featureId = req.params.feature_id;
      let data = req.body;
      let { logtail: logger } = req;

      // 1. Get feature by ID
      let features = await FeatureService.getFromReq(req);
      let feature = features.find((f) => f.id == featureId);

      if (!feature) {
        throw new RecaseError({
          message: `Feature ${featureId} not found`,
          code: ErrCode.InvalidFeature,
          statusCode: 404,
        });
      }

      // 1. Check if changing type...
      let isChangingType = feature.type !== data.type;
      let isChangingId = feature.id !== data.id;
      let isChangingUsageType =
        feature.type != FeatureType.Boolean &&
        data.type != FeatureType.Boolean &&
        feature.config?.usage_type != data.config?.usage_type;

      let isChangingName = feature.name !== data.name;

      if (isChangingType || isChangingId || isChangingUsageType) {
        let { entitlements, prices, creditSystems, linkedEntitlements } =
          await getObjectsUsingFeature({
            sb: req.sb,
            orgId: req.orgId,
            env: req.env,
            allFeatures: features,
            feature,
          });

        // 1. Can't change type if any objects are linked to it
        if (
          isChangingType &&
          (linkedEntitlements.length > 0 ||
            prices.length > 0 ||
            creditSystems.length > 0 ||
            entitlements.length > 0)
        ) {
          throw new RecaseError({
            message: `Cannot change type of feature ${featureId} because it is used in an entitlement or credit system`,
            code: ErrCode.InvalidFeature,
            statusCode: 400,
          });
        }

        if (isChangingId) {
          await handleFeatureIdChanged({
            sb: req.sb,
            orgId: req.orgId,
            env: req.env,
            feature,
            linkedEntitlements,
            entitlements,
            prices,
            creditSystems,
            newId: data.id,
            logger,
          });
        }

        if (isChangingUsageType) {
          await handleFeatureUsageTypeChanged({
            sb: req.sb,
            orgId: req.orgId,
            env: req.env,
            feature,
            linkedEntitlements,
            entitlements,
            prices,
            creditSystems,
            newUsageType: data.config?.usage_type,
          });
        }
      }

      let updatedFeature = await FeatureService.updateStrict({
        sb: req.sb,
        orgId: req.orgId,
        env: req.env,
        featureId,

        updates: {
          id: data.id !== undefined ? data.id : feature.id,
          name: data.name !== undefined ? data.name : feature.name,
          type: data.type !== undefined ? data.type : feature.type,

          config:
            feature.type == FeatureType.CreditSystem
              ? validateCreditSystem(data.config)
              : feature.type == FeatureType.Metered
              ? validateMeteredConfig(data.config)
              : data.config,
        },
        logger,
      });

      if (isChangingName) {
        await addTaskToQueue({
          jobName: JobName.GenerateFeatureDisplay,
          payload: {
            feature: updatedFeature,
            org: req.org,
          },
        });
      }

      res.status(200).json({ success: true, feature_id: featureId });
    },
  });
