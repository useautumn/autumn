import { handleBelowThresholdInvoicing } from "./invoiceThresholdUtils.js";
import { getBelowThresholdPrice } from "./invoiceThresholdUtils.js";

import {
  AllowanceType,
  AppEnv,
  CusEntWithEntitlement,
  CusProductStatus,
  Event,
  Feature,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
} from "@autumn/shared";
import { CustomerEntitlementService } from "@/internal/customers/entitlements/CusEntitlementService.js";
import { Customer, FeatureType } from "@autumn/shared";
import { SupabaseClient } from "@supabase/supabase-js";
import { getCusEntsInFeatures } from "@/internal/api/customers/cusUtils.js";
import { Decimal } from "decimal.js";
import { adjustAllowance } from "./adjustAllowance.js";
import {
  getMeteredDeduction,
  getCreditSystemDeduction,
} from "./deductUtils.js";
import {
  getGroupBalanceFromProperties,
  getGroupBalanceUpdate,
  getGroupValFromProperties,
  groupByExists,
  initGroupBalancesForEvent,
} from "@/internal/customers/entitlements/groupByUtils.js";
import { notNullish, nullish, nullOrUndefined } from "@/utils/genUtils.js";
import {
  creditSystemContainsFeature,
  featureToCreditSystem,
} from "@/internal/features/creditSystemUtils.js";
import { getTotalNegativeBalance } from "@/internal/customers/entitlements/cusEntUtils.js";
import {
  featureContainsEvent,
  isRelevantFeature,
} from "@/internal/features/featureUtils.js";
import {
  getLinkedCusEnt,
  getOriginalFeature,
} from "@/internal/customers/entitlements/linkedGroupUtils.js";
import RecaseError from "@/utils/errorUtils.js";

// Decimal.set({ precision: 12 }); // 12 DP precision

type DeductParams = {
  sb: SupabaseClient;
  env: AppEnv;
  org: Organization;
  cusPrices: FullCustomerPrice[];
  customer: Customer;
  properties: any;
  feature: Feature;
};

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
  const relevantFeatures = features.filter(
    (feature) =>
      featureContainsEvent({ feature, eventName: event.event_name }) ||
      feature.type === FeatureType.CreditSystem
  );

  const meteredFeatures = relevantFeatures.filter(
    (feature) => feature.type === FeatureType.Metered
  );

  const featureDeductions = [];
  for (const feature of relevantFeatures) {
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
      (cusEnt) =>
        cusEnt.entitlement.allowance_type === AllowanceType.Unlimited &&
        cusEnt.entitlement.internal_feature_id == feature.internal_id
    );

    if (unlimitedExists || !deduction) {
      continue;
    }

    featureDeductions.push({
      feature,
      deduction,
    });
  }

  featureDeductions.sort((a, b) => {
    if (
      a.feature.type === FeatureType.CreditSystem &&
      b.feature.type !== FeatureType.CreditSystem
    ) {
      return 1;
    }

    if (
      a.feature.type !== FeatureType.CreditSystem &&
      b.feature.type === FeatureType.CreditSystem
    ) {
      return -1;
    }

    return a.feature.id.localeCompare(b.feature.id);
  });

  return featureDeductions;
};

export const logBalanceUpdate = ({
  timeTaken,
  customer,
  features,
  cusEnts,
  featureDeductions,
  properties,
  org,
}: {
  timeTaken: string;
  customer: Customer;
  features: Feature[];
  cusEnts: FullCustomerEntitlement[];
  featureDeductions: any;
  properties: any;
  org: Organization;
}) => {
  console.log(`   - getCusEntsInFeatures: ${timeTaken}ms`);
  console.log(
    `   - Customer: ${customer.id} (${customer.env}) | Org: ${
      org.slug
    } | Features: ${features.map((f) => f.id).join(", ")}`
  );
  console.log("   - Properties:", properties);
  console.log(
    "   - CusEnts:",
    cusEnts.map((cusEnt: any) => {
      let balanceStr = cusEnt.balance;
      let { groupVal, balance } = getGroupBalanceFromProperties({
        properties,
        cusEnt,
        features,
      });

      try {
        if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
          balanceStr = "Unlimited";
        } else if (groupVal) {
          balanceStr = `${balance} [${groupVal}]`;
        }
      } catch (error) {
        balanceStr = "failed_to_get_balance";
      }

      return `${cusEnt.feature_id} - ${balanceStr} (${
        cusEnt.customer_product ? cusEnt.customer_product.product_id : ""
      })`;
    }),
    "| Deductions:",
    featureDeductions.map((f: any) => `${f.feature.id}: ${f.deduction}`)
  );
};

const performDeduction = ({
  cusEntBalance,
  toDeduct,
}: {
  cusEntBalance: Decimal;
  toDeduct: number;
}) => {
  let newBalance, deducted;
  if (cusEntBalance.lte(0) && toDeduct > 0) {
    // Don't deduct if balance is negative and toDeduct is positive, if not, just add to balance
    return {
      newBalance: cusEntBalance.toNumber(),
      deducted: 0,
      leftover: toDeduct,
    };
  }

  // If toDeduct is negative, add to balance and set toDeduct to 0
  if (toDeduct < 0) {
    newBalance = cusEntBalance.minus(toDeduct).toNumber();
    deducted = toDeduct;
    toDeduct = 0;
  }

  // If cusEnt has less balance to deduct than 0, deduct the balance and set balance to 0
  else if (cusEntBalance.minus(toDeduct).lt(0)) {
    toDeduct = new Decimal(toDeduct).minus(cusEntBalance).toNumber(); // toDeduct = toDeduct - cusEntBalance
    deducted = cusEntBalance.toNumber(); // deducted = cusEntBalance
    newBalance = 0; // newBalance = 0
  }

  // Else, deduct the balance and set toDeduct to 0
  else {
    newBalance = cusEntBalance.minus(toDeduct).toNumber();
    deducted = toDeduct;
    toDeduct = 0;
  }

  return {
    newBalance,
    deducted,
    leftover: toDeduct,
  };
};

export const deductAllowanceFromCusEnt = async ({
  toDeduct,
  deductParams,
  cusEnt,
  features,
  featureDeductions,
  willDeductCredits = false,
  replacedCount,
}: {
  toDeduct: number;
  deductParams: DeductParams;
  cusEnt: FullCustomerEntitlement;
  features: Feature[];
  featureDeductions: any;
  willDeductCredits?: boolean;
  replacedCount: number;
}) => {
  const { sb, feature, env, org, cusPrices, customer, properties } =
    deductParams;

  if (toDeduct == 0) {
    return 0;
  }

  let cusEntBalance;
  let { groupVal, balance } = getGroupBalanceFromProperties({
    properties,
    feature,
    cusEnt,
    features,
  });

  if (notNullish(groupVal) && nullish(balance)) {
    console.log(
      `   - No balance found for group by value: ${groupVal}, for customer: ${customer.id}, skipping`
    );
    return toDeduct;
  }

  // HANDLE CASE IF GROUP BY EXISTS, BUT NO GROUP VAL
  if (!groupVal && groupByExists(feature)) {
    // TODO: POLISH THIS UP
    let deductCursor = toDeduct;
    let balances = cusEnt.balances || {};

    for (const key in balances) {
      let { newBalance, deducted, leftover } = performDeduction({
        cusEntBalance: new Decimal(balances[key].balance),
        toDeduct: deductCursor,
      });

      deductCursor = leftover;
      balances[key].balance = newBalance;

      if (deductCursor == 0) {
        break;
      }
    }

    await CustomerEntitlementService.update({
      sb,
      id: cusEnt.id,
      updates: { balances },
    });

    return deductCursor;
  }

  let newBalance, deducted;
  cusEntBalance = new Decimal(balance!);
  if (cusEntBalance.lte(0) && toDeduct > 0) {
    return toDeduct;
  }

  if (toDeduct < 0) {
    newBalance = cusEntBalance.minus(toDeduct).toNumber();
    deducted = toDeduct;
    toDeduct = 0;
  }

  // If cusEnt has less balance to deduct than 0, deduct the balance and set balance to 0
  else if (cusEntBalance.minus(toDeduct).lt(0)) {
    toDeduct = new Decimal(toDeduct).minus(cusEntBalance).toNumber(); // toDeduct = toDeduct - cusEntBalance
    deducted = cusEntBalance.toNumber(); // deducted = cusEntBalance
    newBalance = 0; // newBalance = 0
  }

  // Else, deduct the balance and set toDeduct to 0
  else {
    newBalance = cusEntBalance.minus(toDeduct).toNumber();
    deducted = toDeduct;
    toDeduct = 0;
  }

  const totalNegativeBalance = getTotalNegativeBalance(cusEnt);
  const originalGrpBalance = Math.max(totalNegativeBalance, balance!);
  const newGrpBalance = new Decimal(originalGrpBalance)
    .minus(deducted)
    .toNumber();

  await CustomerEntitlementService.update({
    sb,
    id: cusEnt.id,
    updates: getGroupBalanceUpdate({
      groupVal,
      cusEnt,
      newBalance,
    }),
  });

  await adjustAllowance({
    sb,
    env,
    org,
    cusPrices: cusPrices as any,
    customer,
    affectedFeature: feature,
    cusEnt: cusEnt as any,
    originalBalance: originalGrpBalance,
    newBalance: newGrpBalance,
    deduction: deducted,
    replacedCount,
  });

  if (groupVal) {
    cusEnt.balances![groupVal].balance = newBalance;
  } else {
    cusEnt.balance = newBalance;
  }

  // Deduct credit amounts too
  if (feature.type === FeatureType.Metered && willDeductCredits) {
    for (let i = 0; i < featureDeductions.length; i++) {
      let { feature: creditSystem, deduction } = featureDeductions[i];

      if (
        creditSystem.type === FeatureType.CreditSystem &&
        creditSystemContainsFeature({
          creditSystem: creditSystem,
          meteredFeatureId: feature.id!,
        })
      ) {
        // toDeduct -= deduction;
        let creditAmount = featureToCreditSystem({
          featureId: feature.id!,
          creditSystem: creditSystem,
          amount: deducted,
        });
        let newDeduction = new Decimal(deduction)
          .minus(creditAmount)
          .toNumber();

        featureDeductions[i].deduction = newDeduction;
      }
    }
  }

  return toDeduct;
};

export const deductFromUsageBasedCusEnt = async ({
  toDeduct,
  deductParams,
  cusEnts,
  replacedCount,
}: {
  toDeduct: number;
  deductParams: DeductParams;
  cusEnts: FullCustomerEntitlement[];
  replacedCount: number;
}) => {
  const { sb, feature, env, org, cusPrices, customer, properties } =
    deductParams;

  // Deduct from usage-based price
  const usageBasedEnt = cusEnts.find(
    (cusEnt: CusEntWithEntitlement) =>
      cusEnt.usage_allowed &&
      cusEnt.entitlement.internal_feature_id == feature.internal_id
  );

  if (!usageBasedEnt) {
    console.log(
      `   - Feature ${feature.id}, To deduct: ${toDeduct} -> no usage-based entitlement found`
    );
    return;
  }

  // Group by value
  let { groupVal, balance } = getGroupBalanceFromProperties({
    properties,
    feature,
    cusEnt: usageBasedEnt,
  });

  if (groupVal && nullOrUndefined(balance)) {
    console.log(
      `   - Feature ${feature.id}, To deduct: ${toDeduct} -> no group balance found`
    );
    return;
  }

  let usageBasedEntBalance = new Decimal(balance!);
  let newBalance = usageBasedEntBalance.minus(toDeduct).toNumber();

  await CustomerEntitlementService.update({
    sb,
    id: usageBasedEnt.id,
    updates: getGroupBalanceUpdate({
      groupVal,
      cusEnt: usageBasedEnt,
      newBalance,
    }),
  });

  const totalNegativeBalance = getTotalNegativeBalance(usageBasedEnt);
  const originalGrpBalance = Math.max(totalNegativeBalance, balance!);
  const newGrpBalance = new Decimal(originalGrpBalance)
    .minus(toDeduct)
    .toNumber();

  await adjustAllowance({
    sb,
    env,
    affectedFeature: feature,
    org,
    cusEnt: usageBasedEnt as any,
    cusPrices: cusPrices as any,
    customer,
    originalBalance: originalGrpBalance,
    newBalance: newGrpBalance,
    deduction: toDeduct,
    replacedCount,
  });
};

// Main function to update customer balance
export const updateCustomerBalance = async ({
  sb,
  customer,
  event,
  features,
  org,
  env,
  logger,
}: {
  sb: SupabaseClient;
  customer: Customer;
  event: Event;
  features: Feature[];
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  const startTime = performance.now();
  const { cusEnts, cusPrices } = await getCusEntsInFeatures({
    sb,
    internalCustomerId: customer.internal_id,
    internalFeatureIds: features.map((f) => f.internal_id!),
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    withPrices: true,
    logger,
  });

  const endTime = performance.now();

  const relevantFeatures = features.filter((feature) =>
    isRelevantFeature({ feature, eventName: event.event_name })
  );
  const linkedFeatures = features.filter((feature) => {
    return !isRelevantFeature({ feature, eventName: event.event_name });
  });

  const relevantCusEnts = cusEnts.filter((cusEnt) =>
    relevantFeatures.some(
      (feature) => cusEnt.entitlement.internal_feature_id == feature.internal_id
    )
  );

  // 2. Handle group_by initialization
  await initGroupBalancesForEvent({
    sb,
    features: relevantFeatures,
    cusEnts,
    properties: event.properties,
  });

  // 3. Return if no customer entitlements or features found
  if (cusEnts.length === 0 || features.length === 0) {
    console.log("   - No customer entitlements or features found");
    return;
  }

  // Create error for linked feature
  let replacedCount = 0;
  for (const linkedFeature of linkedFeatures) {
    const linkedCusEnt = getLinkedCusEnt({
      linkedFeature,
      cusEnts,
    });

    const groupVal = getGroupValFromProperties({
      properties: event.add_groups || event.remove_groups,
      feature: linkedFeature,
    });

    // console.log("Group val:", groupVal);
    // console.log("Linked feature:", linkedFeature);

    if (!groupVal) {
      continue;
    }

    let isAdding = notNullish(event.add_groups);
    event.value = isAdding ? groupVal.length : -groupVal.length;
    const allowance = linkedCusEnt?.entitlement.allowance;

    if (isAdding) {
      let curBalances = linkedCusEnt?.balances || {};

      for (const group of groupVal) {
        // Check if group already exists & is not deleted
        if (curBalances[group] && !curBalances[group].deleted) {
          logger.warn(
            `   - Group ${group} already exists & is not deleted, skipping`
          );
          replacedCount++;
          event.value! -= 1;
          continue;
        }

        if (curBalances[group] && curBalances[group].deleted) {
          curBalances[group].deleted = false;
          console.log(`   - Undeleting group ${group}`);
          // replacedCount++;
          event.value! -= 1;
          continue;
        }

        // Check if there's any deleted balance to activate
        let replaced = false;
        for (const id in curBalances) {
          let balance = curBalances[id];
          if (balance.deleted) {
            curBalances[group] = {
              ...balance,
              deleted: false,
            };

            delete curBalances[id];
            // replacedCount++;
            event.value = (event.value || 1) - 1;
            break;
          }
        }

        if (!replaced) {
          curBalances[group] = {
            balance: allowance!,
            adjustment: 0,
          };
        }
      }

      await CustomerEntitlementService.update({
        sb,
        id: linkedCusEnt!.id,
        updates: { balances: curBalances },
      });
    } else {
      const curBalances = linkedCusEnt?.balances || {};
      event.value = 0;
      for (const group of groupVal) {
        if (curBalances[group]) {
          curBalances[group].deleted = true;
          replacedCount++;
        } else {
          logger.warn(
            `   - Group ${group} not found for linked feature ${linkedFeature.id}, can't delete`
          );
          throw new RecaseError({
            message: `Group ${group} not found for linked feature ${linkedFeature.id}, can't delete`,
            code: "GROUP_NOT_FOUND",
            data: {
              group,
              linkedFeature,
            },
          });
        }
      }

      await CustomerEntitlementService.update({
        sb,
        id: linkedCusEnt!.id,
        updates: { balances: curBalances },
      });
    }
  }

  // 4. Perform deductions and update customer balance
  const featureDeductions = getFeatureDeductions({
    cusEnts: relevantCusEnts,
    event,
    features: relevantFeatures,
  });

  logBalanceUpdate({
    timeTaken: (endTime - startTime).toFixed(2),
    customer,
    features: relevantFeatures,
    cusEnts: relevantCusEnts,
    featureDeductions,
    properties: event.properties,
    org,
  });

  for (const obj of featureDeductions) {
    let { feature, deduction: toDeduct } = obj;

    for (const cusEnt of relevantCusEnts) {
      if (cusEnt.entitlement.internal_feature_id != feature.internal_id) {
        continue;
      }

      toDeduct = await deductAllowanceFromCusEnt({
        toDeduct,
        cusEnt,
        features,
        deductParams: {
          sb,
          feature,
          env,
          org,
          cusPrices: cusPrices as any[],
          customer,
          properties: event.properties,
        },
        replacedCount,
        featureDeductions,
        willDeductCredits: true,
      });
    }

    if (toDeduct == 0) {
      continue;
    }

    await deductFromUsageBasedCusEnt({
      toDeduct,
      cusEnts: relevantCusEnts,
      replacedCount,
      deductParams: {
        sb,
        feature,
        env,
        org,
        cusPrices: cusPrices as any[],
        customer,
        properties: event.properties,
      },
    });
  }

  return cusEnts;
};

// MAIN FUNCTION
export const runUpdateBalanceTask = async ({
  payload,
  logger,
  sb,
}: {
  payload: any;
  logger: any;
  sb: SupabaseClient;
}) => {
  try {
    // 1. Update customer balance
    const { customer, features, event, org, env } = payload;

    console.log("--------------------------------");
    console.log(
      `UPDATING BALANCE FOR CUSTOMER (${customer.id}), ORG: ${org.slug}`
    );

    const cusEnts: any = await updateCustomerBalance({
      sb,
      customer,
      features,
      event,
      org,
      env,
      logger,
    });

    if (!cusEnts || cusEnts.length === 0) {
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
        internalCustomerId: customer.internal_id,
        belowThresholdPrice,
        logger,
      });
    } else {
      console.log("   ✅ No below threshold price found");
    }
  } catch (error) {
    if (logger) {
      logger.use((log: any) => {
        return {
          ...log,
          data: payload,
        };
      });

      logger.error(`ERROR UPDATING BALANCE`);
      logger.error(error);
    } else {
      console.log(error);
    }
  }
};

// Handle linked features?

// // CREATE
// for (const linkedFeature of linkedFeatures) {
//   const originalFeature = features.find(
//     (f) => linkedFeature.config.group_by?.linked_feature_id == f.id
//   );

//   const linkedCusEnt = cusEnts.find(
//     (cusEnt) =>
//       cusEnt.entitlement.internal_feature_id == linkedFeature.internal_id
//   );

//   const entitlement = linkedCusEnt?.entitlement;
//   const groupVal = getGroupValFromProperties({
//     properties: event.properties,
//     feature: linkedFeature,
//   });

//   if (!linkedCusEnt || !groupVal || nullish(entitlement?.allowance)) {
//     continue;
//   }

//   // If value is positive
//   let value = getMeteredDeduction(originalFeature!, event);

//   if (value > 0) {
//     if (!linkedCusEnt.balances) {
//       linkedCusEnt.balances = {};
//     }

//     await CustomerEntitlementService.update({
//       sb,
//       id: linkedCusEnt.id,
//       updates: getGroupBalanceUpdate({
//         groupVal,
//         cusEnt: linkedCusEnt,
//         newBalance: entitlement?.allowance!,
//       }),
//     });
//   } else if (value < 0) {
//     // Deduct from linked feature

//     // Schedule removal of group val
//     logger.info(
//       `   - Scheduling removal of group ${groupVal} for linked feature ${linkedFeature.id}`
//     );

//     await CustomerEntitlementService.update({
//       sb,
//       id: linkedCusEnt.id,
//       updates: {
//         balances: {
//           ...linkedCusEnt.balances,
//           [groupVal]: {
//             ...linkedCusEnt.balances![groupVal]!,
//             deleted: true,
//           },
//         },
//       },
//     });
//   }
// }
