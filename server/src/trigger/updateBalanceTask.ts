import {
  AllowanceType,
  AppEnv,
  CusProductStatus,
  Event,
  Feature,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
} from "@autumn/shared";
import { CusEntService } from "@/internal/customers/cusProducts/cusEnts/CusEntitlementService.js";
import { Customer, FeatureType } from "@autumn/shared";
import { getCusEntsInFeatures } from "@/internal/customers/cusUtils/cusUtils.js";
import { Decimal } from "decimal.js";
import { adjustAllowance } from "./adjustAllowance.js";
import {
  getMeteredDeduction,
  getCreditSystemDeduction,
  performDeduction,
} from "./deductUtils.js";

import { notNullish, nullish } from "@/utils/genUtils.js";
import {
  creditSystemContainsFeature,
  featureToCreditSystem,
} from "@/internal/features/creditSystemUtils.js";
import {
  getCusEntMasterBalance,
  getTotalNegativeBalance,
} from "@/internal/customers/cusProducts/cusEnts/cusEntUtils.js";
import { entityFeatureIdExists } from "@/internal/api/entities/entityUtils.js";
import { CusService } from "@/internal/customers/CusService.js";
import { DrizzleCli } from "@/db/initDrizzle.js";

// Decimal.set({ precision: 12 }); // 12 DP precision

type DeductParams = {
  db: DrizzleCli;
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
  const meteredFeatures = features.filter(
    (feature) => feature.type === FeatureType.Metered,
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
      (cusEnt) =>
        cusEnt.entitlement.allowance_type === AllowanceType.Unlimited &&
        cusEnt.entitlement.internal_feature_id == feature.internal_id,
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
  entityId,
  org,
}: {
  timeTaken: string;
  customer: Customer;
  features: Feature[];
  cusEnts: FullCustomerEntitlement[];
  featureDeductions: any;
  properties: any;
  entityId?: string | null;
  org: Organization;
}) => {
  console.log(
    `   - Customer: ${customer.id} (${customer.env}) | Org: ${
      org.slug
    } | Features: ${features.map((f) => f.id).join(", ")}`,
  );
  console.log("   - Properties:", properties);
  console.log(
    "   - CusEnts:",
    cusEnts.map((cusEnt: any) => {
      let balanceStr = cusEnt.balance;

      if (notNullish(cusEnt.entitlement.entity_feature_id)) {
        console.log(
          `   - Entity feature ID found for feature: ${cusEnt.feature_id}`,
        );

        if (notNullish(entityId)) {
          balanceStr = `${cusEnt.entities?.[entityId!]?.balance} [${entityId}]`;
        } else {
          balanceStr = `${
            getCusEntMasterBalance({
              cusEnt,
              entities: cusEnt.customer_product?.entities,
            }).balance
          } [Master]`;
        }
      }
      try {
        if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
          balanceStr = "Unlimited";
        }
      } catch (error) {
        balanceStr = "failed_to_get_balance";
      }

      return `${cusEnt.feature_id} - ${balanceStr} (${
        cusEnt.customer_product ? cusEnt.customer_product.product_id : ""
      })`;
    }),
    "| Deductions:",
    featureDeductions.map((f: any) => `${f.feature.id}: ${f.deduction}`),
  );
};

export const performDeductionOnCusEnt = ({
  cusEnt,
  toDeduct,
  entityId,
  allowNegativeBalance = false,
  addAdjustment = false,
  setZeroAdjustment = false,
}: {
  cusEnt: FullCustomerEntitlement;
  toDeduct: number;
  entityId?: string | null;
  allowNegativeBalance?: boolean;
  addAdjustment?: boolean;
  setZeroAdjustment?: boolean;
}) => {
  let newEntities = structuredClone(cusEnt.entities);
  let newBalance = structuredClone(cusEnt.balance);
  let newAdjustment = structuredClone(cusEnt.adjustment);
  let deducted = 0;

  if (entityFeatureIdExists({ cusEnt })) {
    if (nullish(entityId)) {
      // 1. If no entity ID, deduct from all
      newEntities = structuredClone(cusEnt.entities);
      if (!newEntities) {
        newEntities = {};
      }
      let toDeductCursor = toDeduct;
      for (const entityId in cusEnt.entities) {
        if (toDeductCursor == 0) {
          break;
        }

        let entityBalance = cusEnt.entities[entityId].balance;
        let {
          newBalance: newEntityBalance,
          deducted: newDeducted,
          toDeduct: newToDeduct,
        } = performDeduction({
          cusEntBalance: new Decimal(entityBalance),
          toDeduct: toDeductCursor,
          allowNegativeBalance,
        });

        newEntities[entityId].balance = newEntityBalance!;

        if (addAdjustment) {
          let adjustment = newEntities![entityId!]!.adjustment || 0;
          newEntities![entityId!]!.adjustment = adjustment - newDeducted!;
        }

        if (setZeroAdjustment) {
          newEntities![entityId!]!.adjustment = 0;
        }

        toDeductCursor = newToDeduct!;
        deducted += newDeducted!;
      }

      toDeduct = toDeductCursor;
    } else {
      // 2. If entity ID, deduct from that entity
      let currentEntityBalance = cusEnt.entities?.[entityId!]?.balance;

      let {
        newBalance: newEntityBalance,
        deducted: newDeducted,
        toDeduct: newToDeduct,
      } = performDeduction({
        cusEntBalance: new Decimal(currentEntityBalance!),
        toDeduct,
        allowNegativeBalance,
      });

      newEntities![entityId!]!.balance = newEntityBalance!;

      if (addAdjustment) {
        let adjustment = newEntities![entityId!]!.adjustment || 0;
        newEntities![entityId!]!.adjustment = adjustment - newDeducted!;
      }

      if (setZeroAdjustment) {
        newEntities![entityId!]!.adjustment = 0;
      }

      toDeduct = newToDeduct!;
      deducted += newDeducted!;
    }
  } else {
    let {
      newBalance: newBalance_,
      deducted: deducted_,
      toDeduct: newToDeduct_,
    } = performDeduction({
      cusEntBalance: new Decimal(cusEnt.balance!),
      toDeduct,
      allowNegativeBalance,
    });

    newBalance = newBalance_;
    deducted = deducted_;
    toDeduct = newToDeduct_;

    if (addAdjustment) {
      let adjustment = cusEnt.adjustment || 0;
      newAdjustment = adjustment - deducted!;
    }
  }
  return { newBalance, newEntities, deducted, toDeduct, newAdjustment };
};

export const deductAllowanceFromCusEnt = async ({
  toDeduct,
  deductParams,
  cusEnt,
  features,
  featureDeductions,
  willDeductCredits = false,
  entityId,
  setZeroAdjustment = false,
}: {
  toDeduct: number;
  deductParams: DeductParams;
  cusEnt: FullCustomerEntitlement;
  features: Feature[];
  featureDeductions: any;
  willDeductCredits?: boolean;
  entityId?: string | null;
  setZeroAdjustment?: boolean;
}) => {
  const { db, feature, env, org, cusPrices, customer } = deductParams;

  if (toDeduct == 0) {
    return 0;
  }

  let {
    newBalance,
    newEntities,
    deducted,
    toDeduct: newToDeduct,
  } = performDeductionOnCusEnt({
    cusEnt,
    toDeduct,
    entityId,
    allowNegativeBalance: false,
    setZeroAdjustment,
  });

  let originalGrpBalance = getTotalNegativeBalance({
    cusEnt,
    balance: cusEnt.balance!,
    entities: cusEnt.entities!,
  });

  let newGrpBalance = getTotalNegativeBalance({
    cusEnt,
    balance: newBalance!,
    entities: newEntities!,
  });

  let updates: any = {
    balance: newBalance,
    entities: newEntities,
  };
  if (setZeroAdjustment) {
    updates.adjustment = 0;
  }

  const { newReplaceables, deletedReplaceables } = await adjustAllowance({
    db,
    env,
    org,
    cusPrices: cusPrices as any,
    customer,
    affectedFeature: feature,
    cusEnt: cusEnt as any,
    originalBalance: originalGrpBalance,
    newBalance: newGrpBalance,
    logger: console,
  });

  console.log("New balance:", newBalance);
  console.log("New replaceables:", newReplaceables);

  if (newReplaceables && newReplaceables.length > 0) {
    updates.balance = newBalance! - newReplaceables.length;
  } else if (deletedReplaceables && deletedReplaceables.length > 0) {
    updates.balance = newBalance! + deletedReplaceables.length;
  }

  await CusEntService.update({
    db,
    id: cusEnt.id,
    updates,
  });

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

  cusEnt.balance = newBalance;
  cusEnt.entities = newEntities;
  return newToDeduct;
};

export const deductFromUsageBasedCusEnt = async ({
  toDeduct,
  deductParams,
  cusEnts,
  entityId,
  setZeroAdjustment = false,
}: {
  toDeduct: number;
  deductParams: DeductParams;
  cusEnts: FullCustomerEntitlement[];
  entityId?: string | null;
  setZeroAdjustment?: boolean;
}) => {
  const { db, feature, env, org, cusPrices, customer } = deductParams;

  // Deduct from usage-based price
  const usageBasedEnt = cusEnts.find(
    (cusEnt: FullCustomerEntitlement) =>
      cusEnt.usage_allowed &&
      cusEnt.entitlement.internal_feature_id == feature.internal_id,
  );

  if (!usageBasedEnt) {
    console.log(
      `   - Feature ${feature.id}, To deduct: ${toDeduct} -> no usage-based entitlement found`,
    );
    return;
  }

  let { newBalance, newEntities, deducted } = performDeductionOnCusEnt({
    cusEnt: usageBasedEnt,
    toDeduct,
    entityId,
    allowNegativeBalance: true,
    setZeroAdjustment,
  });

  let oldGrpBalance = getTotalNegativeBalance({
    cusEnt: usageBasedEnt,
    balance: usageBasedEnt.balance!,
    entities: usageBasedEnt.entities!,
  });

  let newGrpBalance = getTotalNegativeBalance({
    cusEnt: usageBasedEnt,
    balance: newBalance!,
    entities: newEntities!,
  });

  let updates: any = {
    balance: newBalance,
    entities: newEntities,
  };
  if (setZeroAdjustment) {
    updates.adjustment = 0;
  }

  const { newReplaceables, deletedReplaceables } = await adjustAllowance({
    db,
    env,
    affectedFeature: feature,
    org,
    cusEnt: usageBasedEnt as any,
    cusPrices: cusPrices as any,
    customer,
    originalBalance: oldGrpBalance,
    newBalance: newGrpBalance,
    logger: console,
  });

  if (newReplaceables && newReplaceables.length > 0) {
    updates.balance = newBalance! - newReplaceables.length;
  } else if (deletedReplaceables && deletedReplaceables.length > 0) {
    updates.balance = newBalance! + deletedReplaceables.length;
  }

  await CusEntService.update({
    db,
    id: usageBasedEnt!.id,
    updates,
  });
};

// Main function to update customer balance
export const updateCustomerBalance = async ({
  db,
  customerId,
  entityId,
  event,
  features,
  org,
  env,
  logger,
}: {
  db: DrizzleCli;
  customerId: string;
  entityId: string;
  event: Event;
  features: Feature[];
  org: Organization;
  env: AppEnv;
  logger: any;
}) => {
  const startTime = performance.now();
  console.log("REVERSE DEDUCTION ORDER", org.config.reverse_deduction_order);
  const customer = await CusService.getFull({
    db,
    idOrInternalId: customerId,
    orgId: org.id,
    env,
    inStatuses: [CusProductStatus.Active, CusProductStatus.PastDue],
    entityId,
  });

  const { cusEnts, cusPrices } = await getCusEntsInFeatures({
    customer,
    internalFeatureIds: features.map((f) => f.internal_id!),
    logger,
    reverseOrder: org.config.reverse_deduction_order,
  });

  const endTime = performance.now();

  // 1. Get deductions for each feature
  const featureDeductions = getFeatureDeductions({
    cusEnts,
    event,
    features,
  });

  logBalanceUpdate({
    timeTaken: (endTime - startTime).toFixed(2),
    customer,
    features,
    cusEnts,
    featureDeductions,
    properties: event.properties,
    org,
    entityId: event.entity_id,
  });

  // 3. Return if no customer entitlements or features found
  if (cusEnts.length === 0 || features.length === 0) {
    console.log("   - No customer entitlements or features found");
    return;
  }

  // 4. Perform deductions and update customer balance
  for (const obj of featureDeductions) {
    let { feature, deduction: toDeduct } = obj;

    for (const cusEnt of cusEnts) {
      if (cusEnt.entitlement.internal_feature_id != feature.internal_id) {
        continue;
      }

      toDeduct = await deductAllowanceFromCusEnt({
        toDeduct,
        cusEnt,
        features,
        deductParams: {
          db,
          feature,
          env,
          org,
          cusPrices: cusPrices as any[],
          customer,
          properties: event.properties,
        },
        featureDeductions,
        willDeductCredits: true,
        entityId: event.entity_id,
      });
    }

    if (toDeduct == 0) {
      continue;
    }

    await deductFromUsageBasedCusEnt({
      toDeduct,
      cusEnts,
      deductParams: {
        db,
        feature,
        env,
        org,
        cusPrices: cusPrices as any[],
        customer,
        properties: event.properties,
      },
      entityId: event.entity_id,
    });
  }

  return cusEnts;
};

// MAIN FUNCTION
export const runUpdateBalanceTask = async ({
  payload,
  logger,
  db,
}: {
  payload: any;
  logger: any;
  db: DrizzleCli;
}) => {
  try {
    // 1. Update customer balance
    const { customerId, features, event, org, env, entityId } = payload;

    console.log("--------------------------------");
    console.log(
      `UPDATING BALANCE FOR CUSTOMER (${customerId}), ORG: ${org.slug}`,
    );

    const cusEnts: any = await updateCustomerBalance({
      db,
      customerId,
      features,
      event,
      org,
      env,
      logger,
      entityId,
    });

    if (!cusEnts || cusEnts.length === 0) {
      return;
    }
    console.log("   ✅ Customer balance updated");
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
