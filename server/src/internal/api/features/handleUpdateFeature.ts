import { ErrCode } from "@/errors/errCodes.js";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { FeatureService } from "@/internal/features/FeatureService.js";
import { getObjectsUsingFeature, validateCreditSystem } from "@/internal/features/featureUtils.js";
import { validateMeteredConfig } from "@/internal/features/featureUtils.js";
import { PriceService } from "@/internal/prices/PriceService.js";
import { EntitlementService } from "@/internal/products/entitlements/EntitlementService.js";
import RecaseError from "@/utils/errorUtils.js";
import { routeHandler } from "@/utils/routerUtils.js";
import { Entitlement, Feature, FeatureType, Price, CreditSystem, UsagePriceConfig, CreditSystemConfig, AppEnv } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";

const handleFeatureIdChanged  = async ({
  sb,
  orgId,
  env,
  feature,
  linkedEntitlements,
  entitlements,
  prices,
  creditSystems,
  newId,
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
    batchUpdate.push(EntitlementService.update({
      sb,
      entitlementId: entitlement.id!,
      updates: {
        entity_feature_id: newId,
      },
    }));
  }

  await Promise.all(batchUpdate);

  // 3. Update all linked prices
  let priceUpdate = [];
  for (let price of prices) {
    priceUpdate.push(PriceService.update({
      sb,
      priceId: price.id!,
      update: {
        config: {
          ...price.config,
          feature_id: newId,
        } as UsagePriceConfig,
      },
    }));
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
    creditSystemUpdate.push(FeatureService.updateStrict({
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
    }));
  }

  await Promise.all(creditSystemUpdate);

  // 5. Update all linked entitlements
  let entitlementUpdate = [];
  for (let entitlement of entitlements) {
    entitlementUpdate.push(EntitlementService.update({
      sb,
      entitlementId: entitlement.id!,
      updates: {
        feature_id: newId,
      },
    }));
  }

  await Promise.all(entitlementUpdate);
  
}
export const handleUpdateFeature = async (req: any, res: any) =>
  routeHandler({
    req,
    res,
    action: "Update feature",
    handler: async () => {
      let featureId  = req.params.feature_id;
      let data = req.body;
      
      // 1. Get feature by ID
      let feature = await FeatureService.getById({
        sb: req.sb,
        orgId: req.orgId,
        env: req.env,
        featureId,
      });

      if (!feature) {
        throw new RecaseError({
          message: `Feature ${featureId} not found`,
          code: ErrCode.InvalidFeature,
          statusCode: 404,
        });
      }

      // If changing type or ID fetch entitlements and prices
      

      // 1. Check if changing type...
      let isChangingType = feature.type !== data.type;
      let isChangingId = feature.id !== data.id;

      if (isChangingType || isChangingId) {
        let { entitlements, prices, creditSystems, linkedEntitlements } = await getObjectsUsingFeature({
          sb: req.sb,
          orgId: req.orgId,
          env: req.env,
          feature,
        });

        // 1. Can't change type if any objects are linked to it
        if (isChangingType && (linkedEntitlements.length > 0 || prices.length > 0 || creditSystems.length > 0 || entitlements.length > 0)) {
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
          });
        }
      }

      // // 1. Update feature from boolean to metered?
      // throw new RecaseError({
      //   message: "Feature is not metered",
      //   code: ErrCode.InvalidRequest,
      //   statusCode: 400,
      // });

      await FeatureService.updateStrict({
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
      });
  
      res.status(200).json({ success: true, feature_id: featureId });
    },
  });
