import {
  CustomerEntitlement,
  CustomerEntitlementSchema,
  Entitlement,
  EntitlementWithFeature,
  FeatureType,
  FullCusProduct,
  FullCustomerEntitlement,
  Price,
} from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  getRelatedCusPrice,
  getResetBalance,
  getUnlimitedAndUsageAllowed,
  sortCusEntsForDeduction,
} from "../cusEntUtils.js";
import { getEntOptions } from "@/internal/prices/priceUtils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";
import { performDeductionOnCusEnt } from "@/trigger/updateBalanceTask.js";

export const getExistingCusEntAndUsage = async ({
  curCusProduct,
  entitlement,
  relatedPrice,
}: {
  entitlement: EntitlementWithFeature;
  curCusProduct?: FullCusProduct;
  relatedPrice?: Price;
}) => {
  if (!curCusProduct) {
    return { cusEnt: null, usage: null };
  }

  // 1. If there is only one cus ent, return it and usage
  let similarCusEnts = curCusProduct.customer_entitlements.filter(
    (ce) => ce.internal_feature_id === entitlement.internal_feature_id
    // &&
    //   ce.entitlement.interval === entitlement.interval
  );

  console.log("Entitlement:", entitlement.feature_id, entitlement.interval);
  console.log(
    "Similar entitlements:",
    similarCusEnts.map(
      (ce) =>
        `${ce.entitlement.feature_id} (${ce.entitlement.interval}) (${ce.balance})`
    )
  );

  if (similarCusEnts.length === 1) {
    return { cusEnt: similarCusEnts[0], usage: null };
  }
};

export const getExistingUsages = ({
  curCusProduct,
}: {
  curCusProduct: FullCusProduct;
}) => {
  let usages: Record<
    string,
    { usage: number; entityUsages: Record<string, number> | null }
  > = {};

  let cusPrices = curCusProduct.customer_prices;
  for (const cusEnt of curCusProduct.customer_entitlements) {
    let ent = cusEnt.entitlement;
    let key = `${ent.feature_id}-${ent.interval}`;
    let feature = ent.feature;
    if (feature.type == FeatureType.Boolean) {
      continue;
    }

    let { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
      cusEnts: curCusProduct.customer_entitlements,
      internalFeatureId: ent.internal_feature_id!,
    });

    if (unlimited) {
      continue;
    }

    if (!usages[key]) {
      usages[key] = {
        usage: 0,
        entityUsages: null,
      };
    }

    // 1. To check, does ent options work with multiple features?
    let relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);
    let options = getEntOptions(curCusProduct.options, ent);

    let resetBalance = getResetBalance({
      entitlement: ent,
      options,
      relatedPrice: relatedCusPrice?.price,
    });

    usages[key].usage += resetBalance! - cusEnt.balance!;

    if (notNullish(cusEnt.entities)) {
      if (!usages[key].entityUsages) {
        usages[key].entityUsages = {};
      }

      for (const entityId in cusEnt.entities) {
        if (nullish(usages[key].entityUsages[entityId])) {
          usages[key].entityUsages[entityId] = 0;
        }

        usages[key].entityUsages[entityId] +=
          resetBalance! - cusEnt.entities[entityId].balance!;
      }
    }
  }

  return usages;
};

export const addExistingUsagesToCusEnts = ({
  cusEnts,
  entitlements,
  curCusProduct,
  carryExistingUsages = false,
}: {
  cusEnts: CustomerEntitlement[];
  entitlements: EntitlementWithFeature[];
  curCusProduct: FullCusProduct;
  carryExistingUsages?: boolean;
}) => {
  if (!curCusProduct) {
    return cusEnts;
  }

  let existingUsages = getExistingUsages({
    curCusProduct,
  });

  let fullCusEnts = cusEnts.map((ce) => {
    let entitlement = entitlements.find((e) => e.id === ce.entitlement_id!);
    return { ...ce, entitlement };
  }) as FullCustomerEntitlement[];

  // Sort cusEnts
  sortCusEntsForDeduction(fullCusEnts);

  console.log("DEDUCTING EXISTING USAGE FROM CUS ENTS");
  console.log("Existing usages:", existingUsages);
  console.log(
    "Sorted cusEnts:",
    fullCusEnts.map(
      (ce) =>
        `${ce.entitlement.feature_id} (${ce.entitlement.interval}), balance: ${ce.balance}`
    )
  );

  // Perform deductions...
  for (const key in existingUsages) {
    let usage = existingUsages[key].usage;
    let entityUsages = existingUsages[key].entityUsages;

    for (const cusEnt of fullCusEnts) {
      let ent = cusEnt.entitlement;
      let cusEntKey = `${ent.feature_id}-${ent.interval}`;

      if (cusEntKey !== key) {
        continue;
      }

      let shouldCarry = ent.carry_from_previous || carryExistingUsages;
      if (!shouldCarry) {
        continue;
      }

      if (notNullish(entityUsages)) {
        // TODO: Check if this works...
        for (const entityId in entityUsages) {
          let { newBalance, toDeduct } = performDeductionOnCusEnt({
            cusEnt,
            toDeduct: entityUsages[entityId],
            allowNegativeBalance: cusEnt.usage_allowed ?? false,
          });

          existingUsages[key].entityUsages![entityId] = toDeduct;

          if (nullish(cusEnt.entities![entityId])) {
            cusEnt.entities![entityId] = {
              id: entityId,
              balance: 0,
              adjustment: 0,
            };
          }

          cusEnt.entities![entityId]!.balance = newBalance!;
        }
      } else {
        let { newBalance, toDeduct } = performDeductionOnCusEnt({
          cusEnt,
          toDeduct: usage,
          allowNegativeBalance: cusEnt.usage_allowed ?? false,
        });
        usage = toDeduct;
        cusEnt.balance = newBalance;
      }

      console.log("--------------------------------");
      console.log("Key:", key);
      console.log("New cus ent balance:", cusEnt.balance, cusEnt.entities);
      console.log("Existing usages:", existingUsages);
    }
  }

  // console.log("Full cusEnts:", fullCusEnts);
  return fullCusEnts.map((ce) => CustomerEntitlementSchema.parse(ce));
};
