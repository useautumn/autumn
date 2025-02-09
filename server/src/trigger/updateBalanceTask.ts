import { createSupabaseClient } from "@/external/supabaseUtils.js";
import { handleBelowThresholdInvoicing } from "./invoiceThresholdUtils.js";
import { getBelowThresholdPrice } from "./invoiceThresholdUtils.js";

import {
  AggregateType,
  AllowanceType,
  AppEnv,
  CusEntWithEntitlement,
  Event,
  Feature,
  FullCustomerEntitlement,
  Organization,
} from "@autumn/shared";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { Customer, FeatureType } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { sortCusEntsForDeduction } from "@/internal/customers/entitlements/cusEntUtils.js";
import { getCusEntsAndPrices } from "@/internal/api/customers/cusUtils.js";

// 3. Get customer entitlements and sort
const getCustomerEntitlements = async ({
  sb,
  internalCustomerId,
  features,
}: {
  sb: SupabaseClient;
  internalCustomerId: string;
  features: Feature[];
}) => {
  const internalFeatureIds = features.map((feature) => feature.internal_id);
  const cusEnts = await CustomerEntitlementService.getActiveInFeatureIds({
    sb,
    internalCustomerId,
    internalFeatureIds: internalFeatureIds as string[],
  });

  sortCusEntsForDeduction(cusEnts);

  return cusEnts;
};

// 2. Functions to get deduction per feature
export const getMeteredDeduction = (meteredFeature: Feature, event: Event) => {
  let config = meteredFeature.config;
  let aggregate = config.aggregate;

  if (aggregate.type == AggregateType.Count) {
    return 1;
  }

  if (aggregate.type == AggregateType.Sum) {
    let property = aggregate.property;
    let value = event.properties[property] || 0;

    let floatVal = parseFloat(value);
    if (isNaN(floatVal)) {
      return 0;
    }

    return floatVal;
  }

  return 0;
};

const getCreditSystemDeduction = ({
  meteredFeatures,
  creditSystem,
  event,
}: {
  meteredFeatures: Feature[];
  creditSystem: Feature;
  event: Event;
}) => {
  let creditsUpdate = 0;
  let meteredFeatureIds = meteredFeatures.map((feature) => feature.id);

  for (const schema of creditSystem.config.schema) {
    if (meteredFeatureIds.includes(schema.metered_feature_id)) {
      let meteredFeature = meteredFeatures.find(
        (feature) => feature.id === schema.metered_feature_id
      );

      if (!meteredFeature) {
        continue;
      }

      let meteredDeduction = getMeteredDeduction(meteredFeature, event);

      creditsUpdate +=
        (meteredDeduction / schema.feature_amount) * schema.credit_amount;
    }
  }

  return creditsUpdate;
};

// // 1. Get customer entitlements and prices
// const getCustomerEntitlementsAndPrices = async ({
//   sb,
//   internalCustomerId,
//   features,
// }: {
//   sb: SupabaseClient;
//   internalCustomerId: string;
//   features: Feature[];
// }) => {
//   const internalFeatureIds = features.map((feature) => feature.internal_id);
//   const cusWithProducts = await CusService.getActiveProductsByInternalId({
//     sb,
//     internalCustomerId,
//   });

//   if (!cusWithProducts) {
//     return { cusEnts: [], cusPrices: [] };
//   }

//   const cusProducts = cusWithProducts?.customer_products;

//   const cusEnts: FullCustomerEntitlement[] = [];
//   const cusPrices: FullCustomerPrice[] = [];
//   for (const cusProduct of cusProducts) {
//     cusEnts.push(
//       ...cusProduct.customer_entitlements.filter(
//         (cusEnt: FullCustomerEntitlement) =>
//           internalFeatureIds.includes(cusEnt.entitlement.internal_feature_id)
//       )
//     );
//     cusPrices.push(
//       ...cusProduct.customer_prices.filter((cusPrice: FullCustomerPrice) => {
//         const priceConfig = cusPrice.price.config as UsagePriceConfig;

//         return internalFeatureIds.includes(priceConfig.internal_feature_id);
//       })
//     );
//   }

//   sortCusEntsForDeduction(cusEnts);

//   return { cusEnts, cusPrices };
// };

// 2. Get deductions for each feature
const getFeatureDeductions = ({
  cusEnts,
  event,
  features,
}: {
  cusEnts: FullCustomerEntitlement[];
  event: Event;
  features: Feature[];
}) => {
  const meteredFeatures = features.filter(
    (feature) => feature.type === FeatureType.Metered
  );
  const featureDeductions = [];
  for (const feature of features) {
    let deduction;
    if (feature.type === FeatureType.Metered) {
      deduction = getMeteredDeduction(feature, event);
    } else if (feature.type === FeatureType.CreditSystem) {
      deduction = getCreditSystemDeduction({
        meteredFeatures: meteredFeatures,
        creditSystem: feature,
        event,
      });
    }

    // Check if unlimited exists
    let unlimitedExists = cusEnts.some(
      (cusEnt) => cusEnt.entitlement.allowance_type === AllowanceType.Unlimited
    );

    if (unlimitedExists || !deduction) {
      continue;
    }

    featureDeductions.push({
      feature,
      deduction,
    });
  }

  return featureDeductions;
};

// Main function to update customer balance
export const updateCustomerBalance = async ({
  sb,
  customer,
  event,
  features,
  org,
  env,
}: {
  sb: SupabaseClient;
  customer: Customer;
  event: Event;
  features: Feature[];
  org: Organization;
  env: AppEnv;
}) => {
  const startTime = performance.now();
  const { cusEnts } = await getCusEntsAndPrices({
    sb,
    internalCustomerId: customer.internal_id,
    internalFeatureIds: features.map((f) => f.internal_id!),
  });

  const endTime = performance.now();
  console.log(`   - Cus ents func ${(endTime - startTime).toFixed(2)}ms`);

  if (cusEnts.length === 0 || features.length === 0) {
    return;
  }

  console.log(`   - Customer: ${customer.name} (${customer.internal_id})`);
  console.log(`   - Features: ${features.map((f) => f.id).join(", ")}`);

  // Feature ID to Deduction
  const featureDeductions = getFeatureDeductions({
    cusEnts,
    event,
    features,
  });

  console.log(
    "   - Deductions:",
    featureDeductions.map((f) => `${f.feature.id}: ${f.deduction}`)
  );

  // 3. Perform deductions and update customer balance
  for (const obj of featureDeductions) {
    if (!obj.deduction) {
      continue;
    }

    let toDeduct = obj.deduction;

    // 1. Deduct from entitlement (till 0)
    for (const cusEnt of cusEnts) {
      if (cusEnt.internal_feature_id === obj.feature.internal_id) {
        // If deduction finished or cusent has no more balance, break
        if (toDeduct == 0) {
          break;
        }

        if (cusEnt.balance! <= 0) {
          continue;
        }

        let newBalance, deducted;

        // If cusEnt has less balance to deduct than 0, deduct the balance and set balance to 0
        if (cusEnt.balance! - toDeduct < 0) {
          toDeduct -= cusEnt.balance!;
          deducted = cusEnt.balance!;
          newBalance = 0;
        }

        // Else, deduct the balance and set toDeduct to 0
        else {
          newBalance = cusEnt.balance! - toDeduct;
          deducted = toDeduct;
          toDeduct = 0;
        }

        cusEnt.balance = newBalance;

        await CustomerEntitlementService.update({
          sb,
          id: cusEnt.id,
          updates: {
            balance: newBalance,
          },
        });
      }
    }

    // If toDeduct is still not 0, deduct from usage-based price?
    if (toDeduct <= 0) {
      continue;
    }

    // Deduct from usage-based price
    const usageBasedEnt = cusEnts.find(
      (cusEnt: CusEntWithEntitlement) => cusEnt.usage_allowed
    );

    if (usageBasedEnt) {
      let newBalance = usageBasedEnt.balance! - toDeduct;

      await CustomerEntitlementService.update({
        sb,
        id: usageBasedEnt.id,
        updates: {
          balance: newBalance,
        },
      });
    } else {
      console.log("No usage-based entitlement found");
    }
  }

  return cusEnts;
};

// MAIN FUNCTION
export const runUpdateBalanceTask = async (payload: any) => {
  try {
    const sb = createSupabaseClient();

    // 1. Update customer balance
    const { customer, features, event, org, env } = payload;

    console.log("--------------------------------");
    console.log("Inside updateBalanceTask...");

    console.log("1. Updating customer balance...");
    const cusEnts: any = await updateCustomerBalance({
      sb,
      customer,
      features,
      event,
      org,
      env,
    });

    if (!cusEnts || cusEnts.length === 0) {
      console.log("✅ No customer entitlements found, skipping");
      return;
    }
    console.log("   ✅ Customer balance updated");

    // 2. Check if there's below threshold price
    const belowThresholdPrice = await getBelowThresholdPrice({
      sb,
      internalCustomerId: customer.internal_id,
      cusEnts,
    });

    if (belowThresholdPrice) {
      console.log("2. Below threshold price found");

      // await new Promise((resolve) => setTimeout(resolve, 1000));

      await handleBelowThresholdInvoicing({
        sb,
        internalCustomerId: payload.internalCustomerId,
        belowThresholdPrice,
      });
    } else {
      console.log("   ✅ No below threshold price found");
    }
  } catch (error) {
    console.log(`Error updating customer balance`);
    console.log(error);
  }
};
