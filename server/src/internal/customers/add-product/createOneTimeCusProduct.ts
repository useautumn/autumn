import { InsertCusProductParams } from "../cusProducts/AttachParams.js";
import {
  AllowanceType,
  AppEnv,
  CusProductStatus,
  EntitlementWithFeature,
  FeatureOptions,
  FullCustomerEntitlement,
  Organization,
  Price,
} from "@autumn/shared";
import { CusEntService } from "../cusProducts/cusEnts/CusEntitlementService.js";
import { initCusEntitlement } from "./initCusEnt.js";
import { getEntRelatedPrice } from "@/internal/products/entitlements/entitlementUtils.js";
import { CusProductService } from "../cusProducts/CusProductService.js";
import { getEntOptions } from "@/internal/products/prices/priceUtils.js";
import { getResetBalance } from "../cusProducts/cusEnts/cusEntUtils.js";
import { nullish } from "@/utils/genUtils.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

const updateOneOffExistingEntitlement = async ({
  db,
  cusEnt,
  entitlement,
  org,
  env,
  options,
  relatedPrice,
  logger,
}: {
  db: DrizzleCli;
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
  const updatedCusEnt = await CusEntService.getStrict({
    db,
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
      "Tried updating one off entitlement, no reset balance, entitlement: ",
    );
    logger.warn(entitlement);
    return;
  }

  await CusEntService.update({
    db,
    id: updatedCusEnt.id,
    updates: {
      balance: updatedCusEnt.balance! + resetBalance!,
    },
  });

  return;
};

export const updateOneTimeCusProduct = async ({
  db,
  attachParams,
  logger,
}: {
  db: DrizzleCli;
  attachParams: InsertCusProductParams;
  logger: any;
}) => {
  // 1. Sort cus products by created_at
  attachParams.cusProducts?.sort((a, b) => b.created_at - a.created_at);

  // 2. Get existing same cus product and customer entitlements
  let existingCusProduct = attachParams.cusProducts?.find(
    (cp) =>
      cp.product.internal_id === attachParams.product.internal_id &&
      cp.status === CusProductStatus.Active,
  )!;

  let existingCusEnts = existingCusProduct.customer_entitlements;

  // 3. Update existing entitlements
  for (const entitlement of attachParams.entitlements) {
    const existingCusEnt = existingCusEnts.find(
      (ce) => ce.internal_feature_id === entitlement.internal_feature_id,
    );

    let relatedPrice = getEntRelatedPrice(entitlement, attachParams.prices);
    const options = getEntOptions(attachParams.optionsList, entitlement);

    if (existingCusEnt) {
      await updateOneOffExistingEntitlement({
        db,
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
        replaceables: [],
        entities: attachParams.entities || [],
      });

      console.log("Inserting new cus ent");
      await CusEntService.insert({
        db,
        data: [newCusEnt as any],
      });
    }
  }

  // Update options on full cus product
  let newOptionsList = [...attachParams.optionsList];

  for (const curOptions of existingCusProduct.options) {
    // Find the option in the new options list
    const newOptionIndex = newOptionsList.findIndex(
      (o) => o.internal_feature_id === curOptions.internal_feature_id,
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

  await CusProductService.update({
    db,
    cusProductId: existingCusProduct.id,
    updates: {
      options: newOptionsList,
      quantity: existingCusProduct.quantity + 1,
    },
  });
};
