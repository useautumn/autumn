import { SupabaseClient } from "@supabase/supabase-js";
import { InsertCusProductParams } from "../products/AttachParams.js";
import {
  AllowanceType,
  AppEnv,
  CusProductStatus,
  EntitlementWithFeature,
  FeatureOptions,
  FeatureType,
  FullCustomerEntitlement,
  Organization,
  Price,
} from "@autumn/shared";
import { CustomerEntitlementService } from "../entitlements/CusEntitlementService.js";
import { initCusEntitlement } from "./initCusEnt.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";
import { CusProductService } from "../products/CusProductService.js";
import { getEntOptions } from "@/internal/prices/priceUtils.js";
import { getResetBalance } from "../entitlements/cusEntUtils.js";
import { nullish } from "@/utils/genUtils.js";
const updateOneOffExistingEntitlement = async ({
  sb,
  cusEnt,
  entitlement,
  org,
  env,
  options,
  relatedPrice,
  logger,
}: {
  sb: SupabaseClient;
  cusEnt: FullCustomerEntitlement;
  entitlement: EntitlementWithFeature;
  org: Organization;
  env: AppEnv;
  options?: FeatureOptions;
  relatedPrice?: Price;
  logger: any;
}) => {
  if (entitlement.allowance_type === AllowanceType.Unlimited) {
    return;
  }

  //  Fetch to get latest entitlement
  const updatedCusEnt = await CustomerEntitlementService.getByIdStrict({
    sb,
    id: cusEnt.id,
    orgId: org.id,
    env: env,
  });

  const resetBalance = getResetBalance({
    entitlement,
    options,
    relatedPrice,
  });

  if (nullish(resetBalance)) {
    logger.warn(
      "Tried updating one off entitlement, no reset balance, entitlement: "
    );
    logger.warn(entitlement);
    return;
  }

  await CustomerEntitlementService.update({
    sb,
    id: updatedCusEnt.id,
    updates: {
      balance: updatedCusEnt.balance! + resetBalance!,
    },
  });

  return;
};

export const updateOneTimeCusProduct = async ({
  sb,
  attachParams,
  logger,
}: {
  sb: SupabaseClient;
  attachParams: InsertCusProductParams;
  logger: any;
}) => {
  // 1. Sort cus products by created_at
  attachParams.cusProducts?.sort((a, b) => b.created_at - a.created_at);

  let existingCusProduct = attachParams.cusProducts?.find(
    (cp) =>
      cp.product.internal_id === attachParams.product.internal_id &&
      cp.status === CusProductStatus.Active
  )!;

  let existingCusEnts = existingCusProduct.customer_entitlements;

  for (const entitlement of attachParams.entitlements) {
    const existingCusEnt = existingCusEnts.find(
      (ce) => ce.internal_feature_id === entitlement.internal_feature_id
    );

    let relatedPrice = getEntRelatedPrice(entitlement, attachParams.prices);
    const options = getEntOptions(attachParams.optionsList, entitlement);

    if (existingCusEnt) {
      await updateOneOffExistingEntitlement({
        sb,
        cusEnt: existingCusEnt,
        entitlement,
        org: attachParams.org,
        env: attachParams.customer.env,
        options: options || undefined,
        relatedPrice,
        logger,
      });
    } else {
      let newCusEnt = initCusEntitlement({
        entitlement,
        customer: attachParams.customer,
        cusProductId: existingCusProduct.id,
        options: undefined,
        nextResetAt: undefined,
        freeTrial: null,
        relatedPrice,
        existingCusEnt: undefined,
        keepResetIntervals: false,
        entities: attachParams.entities || [],
      });

      await CustomerEntitlementService.createMany({
        sb,
        customerEntitlements: [newCusEnt as any],
      });
    }
  }

  // Update options on full cus product
  let newOptionsList = [...attachParams.optionsList];

  for (const curOptions of existingCusProduct.options) {
    // Find the option in the new options list
    const newOptionIndex = newOptionsList.findIndex(
      (o) => o.internal_feature_id === curOptions.internal_feature_id
    );

    if (newOptionIndex !== -1) {
      newOptionsList[newOptionIndex] = {
        ...newOptionsList[newOptionIndex],
        quantity:
          (newOptionsList[newOptionIndex].quantity || 0) +
          (curOptions.quantity || 0),
      };
    } 
  }


  // Handle adding quantity to base entitlements if cus product purchased multiple times.
  for (const entitlement of attachParams.entitlements) {
    const relatedPrice = getEntRelatedPrice(entitlement, attachParams.prices);
    const feature = entitlement.feature;

    if (relatedPrice || feature.type == FeatureType.Boolean || entitlement.allowance_type === AllowanceType.Unlimited) {
      continue;
    }

    const newOptionIndex = newOptionsList.findIndex(
      (o) => o.internal_feature_id === entitlement.internal_feature_id
    );

    if (newOptionIndex === -1) {
      // Get existing option
      const existingOption = existingCusProduct.options.find(
        (o) => o.internal_feature_id === entitlement.internal_feature_id
      );

      if (existingOption) {
        newOptionsList.push({
          feature_id: entitlement.feature.id,
          quantity: (existingOption?.quantity || 0) + 1,
          internal_feature_id: entitlement.internal_feature_id,
        });
      } else {
        newOptionsList.push({
          feature_id: entitlement.feature.id,
          quantity: 2,
          internal_feature_id: entitlement.internal_feature_id,
        });
      }
    }
  }



  await CusProductService.update({
    sb,
    cusProductId: existingCusProduct.id,
    updates: {
      options: newOptionsList,
    },
  });
};
