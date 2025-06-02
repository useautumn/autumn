import {
  AllowanceType,
  AppEnv,
  BillingType,
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
import {
  getBillingType,
  getEntOptions,
} from "@/internal/products/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { notNullish, nullish } from "@/utils/genUtils.js";

import {
  getEntityBalance,
  getSummedEntityBalances,
} from "./entBalanceUtils.js";
import { Decimal } from "decimal.js";

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
      0,
    );

    let totalAdjustment = Object.values(cusEnt.entities || {}).reduce(
      (acc, curr) => {
        return acc + curr.adjustment;
      },
      0,
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
        entity.internal_feature_id == feature.internal_id && entity.deleted,
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
  entities,
  entityId,
}: {
  cusEnt: FullCustomerEntitlement;
  entities?: Entity[];
  entityId?: string | null;
}) => {
  let entitlement = cusEnt.entitlement;
  let ent = cusEnt.entitlement;
  let feature = ent.feature;

  if (notNullish(entitlement.entity_feature_id)) {
    if (nullish(entityId)) {
      return getSummedEntityBalances({
        cusEnt,
      });
    }

    return {
      ...getEntityBalance({
        cusEnt,
        entityId: entityId!,
      }),
      unused: 0,
      count: 1,
    };
  }

  let unusedCount =
    (entities &&
      entities.filter(
        (entity) =>
          entity.internal_feature_id == feature.internal_id && entity.deleted,
      ).length) ||
    0;

  return {
    balance: cusEnt.balance,
    adjustment: cusEnt.adjustment,
    unused: unusedCount,
    count: 1,
  };
};

export const sortCusEntsForDeduction = (
  cusEnts: (FullCustomerEntitlement & {
    customer_product?: FullCusProduct;
  })[],
  reverseOrder: boolean = false,
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

  // console.log(
  //   `Cus ents before (${reverseOrder ? "reversed" : "normal"})`,
  //   cusEnts.map(
  //     (ce) => `${ce.entitlement.feature_id} - ${ce.entitlement.interval}`
  //   )
  // );
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

    // If one has usage_allowed, it should go last
    if (!a.usage_allowed && b.usage_allowed) {
      return -1;
    }

    if (!b.usage_allowed && a.usage_allowed) {
      return 1;
    }

    // If one has a next_reset_at, it should go first
    let nextResetFirst = reverseOrder ? 1 : -1;

    if (a.next_reset_at && !b.next_reset_at) {
      return nextResetFirst;
    }

    // If b has a next_reset_at, it should go first
    if (!a.next_reset_at && b.next_reset_at) {
      return -nextResetFirst;
    }

    // 3. Sort by interval
    if (aEnt.interval && bEnt.interval && aEnt.interval != bEnt.interval) {
      if (reverseOrder) {
        return intervalOrder[bEnt.interval] - intervalOrder[aEnt.interval];
      } else {
        return intervalOrder[aEnt.interval] - intervalOrder[bEnt.interval];
      }
    }

    // Check if a is main product
    let aIsAddOn = a.customer_product?.product?.is_add_on;
    let bIsAddOn = b.customer_product?.product?.is_add_on;

    if (aIsAddOn && !bIsAddOn) {
      return 1;
    }

    if (!aIsAddOn && bIsAddOn) {
      return -1;
    }

    // 4. Sort by created_at
    return a.created_at - b.created_at;
  });

  // console.log(
  //   `Cus ents after (${reverseOrder ? "reversed" : "normal"})`,
  //   cusEnts.map(
  //     (ce) => `${ce.entitlement.feature_id} - ${ce.entitlement.interval}`
  //   )
  // );
};

// Get related cusPrice
export const getRelatedCusPrice = (
  cusEnt: FullCustomerEntitlement,
  cusPrices: FullCustomerPrice[],
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
      "WARNING: Failed to return quantity * billing units, returning allowance...",
    );
    return entitlement.allowance;
  }
};

export const getUnlimitedAndUsageAllowed = ({
  cusEnts,
  internalFeatureId,
}: {
  cusEnts: FullCustomerEntitlement[];
  internalFeatureId: string;
}) => {
  // Unlimited

  const unlimited = cusEnts.some(
    (cusEnt) =>
      cusEnt.internal_feature_id === internalFeatureId &&
      (cusEnt.entitlement.allowance_type === AllowanceType.Unlimited ||
        cusEnt.unlimited),
  );

  const usageAllowed = cusEnts.some(
    (ent) => ent.internal_feature_id === internalFeatureId && ent.usage_allowed,
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
  cusEnts: FullCustomerEntitlement[];
  feature: Feature;
}) => {
  return cusEnts.some(
    (cusEnt) => cusEnt.internal_feature_id === feature.internal_id!,
  );
};

export const getTotalNegativeBalance = ({
  cusEnt,
  balance,
  entities,
  billingUnits,
}: {
  cusEnt: FullCustomerEntitlement;
  balance: number;
  entities: Record<string, { balance: number; adjustment: number }>;
  billingUnits?: number;
}) => {
  let entityFeatureId = cusEnt.entitlement.entity_feature_id;

  if (nullish(entityFeatureId)) {
    return balance;
  }

  let totalNegative = 0;
  for (const group in entities) {
    if (entities[group].balance < 0) {
      let balance = entities[group].balance;
      if (billingUnits) {
        balance = new Decimal(balance)
          .div(billingUnits)
          .round()
          .mul(billingUnits)
          .toNumber();
      }
      totalNegative += balance;
    }
  }

  if (totalNegative == 0) {
    return Math.min(...Object.values(entities).map((e) => e.balance || 0));
  }

  return totalNegative;
};

// GET EXISTING USAGE
export const getExistingUsageFromCusProducts = ({
  entitlement,
  cusProducts,
  entities,
  carryExistingUsages = false,
  internalEntityId,
}: {
  entitlement: EntitlementWithFeature;
  cusProducts?: FullCusProduct[];
  entities: Entity[];
  carryExistingUsages?: boolean;
  internalEntityId?: string;
}) => {
  if (!entitlement || entitlement.feature.type === FeatureType.Boolean) {
    return 0;
  }

  // Existing usage should also include entities
  let entityUsage = entities.reduce((acc, entity) => {
    if (entity.internal_feature_id !== entitlement.internal_feature_id) {
      return acc;
    }

    return acc + 1;
  }, 0);

  if (entityUsage > 0) {
    return entityUsage;
  }

  let existingUsage = 0;

  // NOTE: Assuming that feature entitlements are unique to each main product...
  let existingCusEnt = cusProducts
    ?.filter(
      (cp) =>
        (cp.status === CusProductStatus.Active ||
          cp.status === CusProductStatus.PastDue) &&
        !cp.product.is_add_on &&
        (internalEntityId
          ? cp.internal_entity_id === internalEntityId
          : nullish(cp.internal_entity_id)),
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
    (cp) => cp.id === existingCusEnt.customer_product_id,
  );
  let options = getEntOptions(
    cusProduct?.options || [],
    existingCusEnt.entitlement,
  );
  let price = getRelatedCusPrice(
    existingCusEnt,
    cusProduct?.customer_prices || [],
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

  return existingUsage;
};
