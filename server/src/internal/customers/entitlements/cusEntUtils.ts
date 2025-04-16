import { CustomerEntitlementService } from "./CusEntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  AllowanceType,
  AppEnv,
  BillingType,
  CusEntWithEntitlement,
  CusProduct,
  CusProductStatus,
  Customer,
  EntInterval,
  Entitlement,
  EntitlementWithFeature,
  Entity,
  Feature,
  FeatureOptions,
  FeatureType,
  FullCusProduct,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
  Price,
  UsagePriceConfig,
} from "@autumn/shared";
import { getBillingType, getEntOptions } from "@/internal/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  notNullish,
  notNullOrUndefined,
  nullish,
  nullOrUndefined,
} from "@/utils/genUtils.js";

import {
  getEntityBalance,
  getSummedEntityBalances,
} from "./entBalanceUtils.js";

export const getBalanceForFeature = async ({
  sb,
  customerId,
  orgId,
  env,
  featureId,
}: {
  sb: SupabaseClient;
  customerId: string;
  orgId: string;
  env: string;
  featureId: string;
}) => {
  const cusEnts = await CustomerEntitlementService.getActiveByFeatureAndCusId({
    sb,
    cusId: customerId,
    featureId,
    orgId,
    env,
  });

  let data = {
    feature_id: featureId,
    balance: 0,
    unlimited: false,
  };

  if (cusEnts.length == 0) {
    return data;
  }

  if (cusEnts[0].entitlement.feature.type == FeatureType.Boolean) {
    return {
      feature_id: featureId,
      balance: null,
      unlimited: false,
    };
  }

  for (const ent of cusEnts) {
    if (ent.allowance_type == AllowanceType.Unlimited) {
      return {
        feature_id: featureId,
        balance: null,
        unlimited: true,
      };
    }

    if (ent.allowance_type == AllowanceType.None) {
      continue;
    }

    data.balance += ent.balance;
  }

  return data;
};

export const getCusEntMasterBalance = ({
  cusEnt,
  entities,
}: {
  cusEnt: FullCustomerEntitlement;
  entities: Entity[];
}) => {
  let ent = cusEnt.entitlement;
  let feature = ent.feature;

  if (notNullish(ent.entity_feature_id)) {
    let totalBalance = Object.values(cusEnt.entities || {}).reduce(
      (acc, curr) => {
        return acc + curr.balance;
      },
      0
    );

    let totalAdjustment = Object.values(cusEnt.entities || {}).reduce(
      (acc, curr) => {
        return acc + curr.adjustment;
      },
      0
    );

    return {
      balance: totalBalance,
      adjustment: totalAdjustment,
      count: Object.values(cusEnt.entities || {}).length,
    };
  }

  // Get unused count

  let unusedCount =
    entities &&
    entities.filter(
      (entity) =>
        entity.internal_feature_id == feature.internal_id && entity.deleted
    ).length;

  return {
    balance: cusEnt.balance,
    adjustment: cusEnt.adjustment,
    count: 1,
    unused: unusedCount,
  };
};

export const getCusEntBalance = ({
  cusEnt,
  entityId,
  entities,
}: {
  cusEnt: FullCustomerEntitlement;
  entityId?: string | null;
  entities?: Entity[];
}) => {
  let entitlement = cusEnt.entitlement;
  let balance, adjustment;

  if (notNullish(entitlement.entity_feature_id)) {
    if (nullish(entityId)) {
      return getSummedEntityBalances({
        cusEnt,
      });
    }

    return getEntityBalance({
      cusEnt,
      entityId: entityId!,
    });
  }

  return {
    balance: cusEnt.balance,
    adjustment: cusEnt.adjustment,
  };
};

export const sortCusEntsForDeduction = (
  cusEnts: FullCustomerEntitlement[],
  reverseOrder: boolean = false
) => {
  let intervalOrder: Record<EntInterval, number> = {
    [EntInterval.Minute]: 0, // 1 minute
    [EntInterval.Hour]: 1, // 1 hour
    [EntInterval.Day]: 2, // 1 day
    [EntInterval.Week]: 3, // 1 week
    [EntInterval.Month]: 4, // 1 month
    [EntInterval.Quarter]: 5, // 3 months
    [EntInterval.Year]: 6, // 1 year
    [EntInterval.SemiAnnual]: 7, // 6 months
    [EntInterval.Lifetime]: 8, // 1 time
  };

  cusEnts.sort((a, b) => {
    const aEnt = a.entitlement;
    const bEnt = b.entitlement;

    // 1. If boolean, go first
    if (aEnt.feature.type == FeatureType.Boolean) {
      return -1;
    }

    if (bEnt.feature.type == FeatureType.Boolean) {
      return 1;
    }

    // 1. If a is credit system and b is not, a should go last
    if (
      aEnt.feature.type == FeatureType.CreditSystem &&
      bEnt.feature.type != FeatureType.CreditSystem
    ) {
      return 1;
    }

    // 2. If a is not credit system and b is, a should go first
    if (
      aEnt.feature.type != FeatureType.CreditSystem &&
      bEnt.feature.type == FeatureType.CreditSystem
    ) {
      return -1;
    }

    // 2. Sort by unlimited (unlimited goes first)
    if (
      aEnt.allowance_type == AllowanceType.Unlimited &&
      bEnt.allowance_type != AllowanceType.Unlimited
    ) {
      return -1;
    }

    if (
      aEnt.allowance_type != AllowanceType.Unlimited &&
      bEnt.allowance_type == AllowanceType.Unlimited
    ) {
      return 1;
    }

    let nextResetFirst = reverseOrder ? 1 : -1;
    // If one has a next_reset_at, it should go first
    if (a.next_reset_at && !b.next_reset_at) {
      return nextResetFirst;
    }

    // If b has a next_reset_at, it should go first
    if (!a.next_reset_at && b.next_reset_at) {
      return nextResetFirst;
    }

    // If one has usage_allowed, it should go last
    if (!a.usage_allowed && b.usage_allowed) {
      return -1;
    }

    if (!b.usage_allowed && a.usage_allowed) {
      return 1;
    }

    // 3. Sort by interval

    if (aEnt.interval && bEnt.interval) {
      if (reverseOrder) {
        return intervalOrder[bEnt.interval] - intervalOrder[aEnt.interval];
      } else {
        return intervalOrder[aEnt.interval] - intervalOrder[bEnt.interval];
      }
    }

    // 4. Sort by created_at
    return a.created_at - b.created_at;
  });
};

// Get related cusPrice
export const getRelatedCusPrice = (
  cusEnt: FullCustomerEntitlement,
  cusPrices: FullCustomerPrice[]
) => {
  return cusPrices.find((cusPrice) => {
    let productMatch =
      cusPrice.customer_product_id == cusEnt.customer_product_id;

    let entMatch = cusPrice.price.entitlement_id == cusEnt.entitlement.id;

    return productMatch && entMatch;
  });
};

// 3. Perform deductions and update customer balance
export const updateCusEntInStripe = async ({
  cusEnt,
  cusPrices,
  org,
  env,
  customer,
  amountUsed,
  eventId,
}: {
  cusEnt: FullCustomerEntitlement;
  cusPrices: FullCustomerPrice[];
  org: Organization;
  env: AppEnv;
  customer: Customer;
  amountUsed: number;
  eventId: string;
}) => {
  const relatedCusPrice = getRelatedCusPrice(cusEnt, cusPrices);

  if (!relatedCusPrice) {
    return;
  }

  // Send event to Stripe
  const stripeCli = createStripeCli({
    org,
    env,
  });

  await stripeCli.billing.meterEvents.create({
    event_name: relatedCusPrice.price.id!,
    payload: {
      stripe_customer_id: customer.processor.id,
      value: amountUsed.toString(),
    },
    identifier: eventId,
  });
  console.log(`   ✅ Stripe event sent, amount: (${amountUsed})`);
};

// Get balance
export const getResetBalance = ({
  entitlement,
  options,
  relatedPrice,
  productQuantity,
}: {
  entitlement: Entitlement;
  options: FeatureOptions | undefined | null;
  relatedPrice: Price | undefined | null;
  productQuantity?: number;
}) => {
  // 1. No related price
  if (!relatedPrice) {
    return (entitlement.allowance || 0) * (productQuantity || 1);
  }

  let config = relatedPrice.config as UsagePriceConfig;

  let billingType = getBillingType(config);
  if (billingType != BillingType.UsageInAdvance) {
    return entitlement.allowance;
  }

  let quantity = options?.quantity;
  let billingUnits = (relatedPrice.config as UsagePriceConfig).billing_units;
  if (nullish(quantity) || nullish(billingUnits)) {
    // console.log("WARNING: Quantity or billing units not found");
    // console.log("Entitlement:", entitlement.id, entitlement.feature_id);
    // console.log("Options:", options);
    return entitlement.allowance;
  }

  try {
    return (entitlement.allowance || 0) + quantity! * billingUnits!;
  } catch (error) {
    console.log(
      "WARNING: Failed to return quantity * billing units, returning allowance..."
    );
    return entitlement.allowance;
  }
};

export const getUnlimitedAndUsageAllowed = ({
  cusEnts,
  internalFeatureId,
}: {
  cusEnts: FullCustomerEntitlement[] | CusEntWithEntitlement[];
  internalFeatureId: string;
}) => {
  // Unlimited

  const unlimited = cusEnts.some(
    (cusEnt) =>
      cusEnt.internal_feature_id === internalFeatureId &&
      (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
        cusEnt.unlimited)
  );

  const usageAllowed = cusEnts.some(
    (ent) => ent.internal_feature_id === internalFeatureId && ent.usage_allowed
  );

  return { unlimited, usageAllowed };
};

export const getFeatureBalance = ({
  cusEnts,
  internalFeatureId,
  entityId,
}: {
  cusEnts: FullCustomerEntitlement[];
  internalFeatureId: string;
  entityId?: string;
}) => {
  let balance = 0;
  for (const cusEnt of cusEnts) {
    if (cusEnt.internal_feature_id !== internalFeatureId) {
      continue;
    }

    if (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited) {
      return null;
    }

    // 1. If feature entity exists...
    let cusEntBalance = cusEnt.balance!;

    // If entity feature id exists, then it is grouped...
    let entityFeatureId = cusEnt.entitlement.entity_feature_id;

    if (notNullish(entityFeatureId)) {
      if (notNullish(entityId)) {
        let { balance: entityBalance } = getEntityBalance({
          cusEnt,
          entityId: entityId!,
        });
        cusEntBalance = entityBalance!;
      } else {
        let summed = getSummedEntityBalances({
          cusEnt,
        });
        cusEntBalance = summed.balance;
      }
    }

    balance += cusEntBalance;

    // 2. If no entityId provided, use main balance
  }

  return balance;
};

export const cusEntsContainFeature = ({
  cusEnts,
  feature,
}: {
  cusEnts: FullCustomerEntitlement[] | CusEntWithEntitlement[];
  feature: Feature;
}) => {
  return cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id!
  );
};

export const getTotalNegativeBalance = ({
  cusEnt,
  balance,
  entities,
}: {
  cusEnt: FullCustomerEntitlement;
  balance: number;
  entities: Record<string, { balance: number; adjustment: number }>;
}) => {
  let entityFeatureId = cusEnt.entitlement.entity_feature_id;

  if (nullish(entityFeatureId)) {
    return balance;
  }

  let totalNegative = 0;
  for (const group in entities) {
    if (entities[group].balance < 0) {
      totalNegative += entities[group].balance;
    }
  }

  return totalNegative;
};

// GET EXISTING USAGE
export const getExistingUsageFromCusProducts = ({
  entitlement,
  cusProducts,
  entities,
  carryExistingUsages = false,
}: {
  entitlement: EntitlementWithFeature;
  cusProducts?: FullCusProduct[];
  entities: Entity[];
  carryExistingUsages?: boolean;
}) => {
  if (!entitlement || entitlement.feature.type === FeatureType.Boolean) {
    return 0;
  }

  let existingUsage = 0;

  // NOTE: Assuming that feature entitlements are unique to each main product...
  let existingCusEnt = cusProducts
    ?.filter(
      (cp) => cp.status === CusProductStatus.Active && !cp.product.is_add_on
    )
    .flatMap((cp) => cp.customer_entitlements)
    .find((ce) => ce.internal_feature_id === entitlement.internal_feature_id);

  if (
    !existingCusEnt ||
    (!entitlement.carry_from_previous && !carryExistingUsages)
  ) {
    return existingUsage;
  }

  if (
    nullish(existingCusEnt.balance) ||
    existingCusEnt.entitlement.allowance_type === AllowanceType.Unlimited
  ) {
    return existingUsage;
  }

  // Get options
  let cusProduct = cusProducts?.find(
    (cp) => cp.id === existingCusEnt.customer_product_id
  );
  let options = getEntOptions(
    cusProduct?.options || [],
    existingCusEnt.entitlement
  );
  let price = getRelatedCusPrice(
    existingCusEnt,
    cusProduct?.customer_prices || []
  );
  let existingAllowance = getResetBalance({
    entitlement: existingCusEnt.entitlement,
    options: options,
    relatedPrice: price?.price,
  });

  let { balance, adjustment, count, unused } = getCusEntMasterBalance({
    cusEnt: existingCusEnt as any,
    entities: entities,
  });

  existingUsage = existingAllowance! - balance!;
  if (unused && unused > 0) {
    existingUsage -= unused;
  }

  // if (!existingUsage && entitlement.allowance_type == AllowanceType.Fixed) {
  //   let filteredEntities = entities.filter((e) => entityMatchesFeature({feature: entitlement.feature, entity: e}));
  //   let newExistingUsage = -(entitlement.allowance! - filteredEntities.length);
  //   existingUsage = Math.max(newExistingUsage, 0);
  // }

  return existingUsage;
};
