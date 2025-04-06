import { CustomerEntitlementService } from "./CusEntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  AllowanceType,
  AppEnv,
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
import { getEntOptions } from "@/internal/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import {
  notNullish,
  notNullOrUndefined,
  nullish,
  nullOrUndefined,
} from "@/utils/genUtils.js";

import { getGroupbalanceFromParams } from "./groupByUtils.js";
import RecaseError from "@/utils/errorUtils.js";
import { StatusCodes } from "http-status-codes";
import {
  getEntityBalance,
  getSummedEntityBalances,
} from "./entBalanceUtils.js";
import { entityMatchesFeature } from "@/internal/api/entities/entityUtils.js";
import { BREAK_API_VERSION } from "@/utils/constants.js";

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

export const getCusBalances = async ({
  sb,
  customerId,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  customerId: string;
  orgId: string;
  env: string;
}) => {
  const cusEnts = await CustomerEntitlementService.getActiveByCustomerId({
    sb,
    customerId,
    orgId,
    env,
  });

  const featureToData: Record<string, any> = {};
  for (const ent of cusEnts) {
    const feature = ent.entitlement.feature;
    if (!featureToData[feature.id]) {
      featureToData[feature.id] = {
        feature_id: feature.id,
        balance: feature.type == FeatureType.Boolean ? undefined : 0,
        unlimited: false,
      };
    }

    if (feature.type == FeatureType.Boolean) {
      continue;
    }

    if (ent.allowance_type == AllowanceType.Unlimited) {
      featureToData[feature.id].balance = null;
      featureToData[feature.id].unlimited = true;
    } else if (featureToData[feature.id].unlimited) {
      continue;
    } else {
      if (ent.allowance_type == AllowanceType.None) {
        featureToData[feature.id].balance += 0;
      } else {
        featureToData[feature.id].balance += ent.balance;
      }
    }
  }

  return Object.values(featureToData);
};

export const getCusBalancesByProduct = async ({
  sb,
  customerId,
  orgId,
  env,
}: {
  sb: SupabaseClient;
  customerId: string;
  orgId: string;
  env: string;
}) => {
  const cusEnts = await CustomerEntitlementService.getActiveByCustomerId({
    sb,
    customerId,
    orgId,
    env,
  });

  const data: Record<string, any> = {};

  for (const cusEnt of cusEnts) {
    const cusProduct = cusEnt.customer_product;
    const product = cusProduct.product;
    const feature = cusEnt.entitlement.feature;
    const entitlement: EntitlementWithFeature = cusEnt.entitlement;

    const key = `${product.id}-${feature.id}`;

    if (!data[key]) {
      data[key] = {
        product_id: product.id,
        feature_id: feature.id,
        balance: feature.type == FeatureType.Boolean ? undefined : 0,
        total: feature.type == FeatureType.Boolean ? undefined : 0,
        unlimited:
          feature.type == FeatureType.Boolean
            ? undefined
            : cusEnt.allowance_type == AllowanceType.Unlimited,
      };
    }

    if (feature.type == FeatureType.Boolean) {
      continue;
    }

    if (cusEnt.allowance_type == AllowanceType.Unlimited) {
      data[key].balance = null;
      data[key].total = null;
      data[key].unlimited = true;
    } else if (data[key].unlimited) {
      continue;
    } else {
      if (cusEnt.allowance_type == AllowanceType.None) {
        data[key].balance += 0;
      } else {
        data[key].balance += cusEnt.balance;
      }
    }

    const entOption = getEntOptions(cusProduct.options, entitlement);
    const ent = cusEnt.entitlement;

    if (ent.allowance_type == AllowanceType.Fixed) {
      let quantity = entOption?.quantity || 1;
      data[key].total += quantity * entitlement.allowance!;
    }
  }

  const balances = Object.values(data);

  balances.sort((a, b) => {
    return a.product_id.localeCompare(b.product_id);
  });

  return balances;
};

type CusEntsWithCusProduct = FullCustomerEntitlement & {
  customer_product: CusProduct;
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

// IMPORTANT FUNCTION
export const getCusBalancesByEntitlement = async ({
  cusEntsWithCusProduct,
  cusPrices,
  entities,
  org,
}: {
  cusEntsWithCusProduct: CusEntsWithCusProduct[];
  cusPrices: FullCustomerPrice[];
  entities: Entity[];
  org: Organization;
}) => {
  const data: Record<string, any> = {};

  for (const cusEnt of cusEntsWithCusProduct) {
    const cusProduct = cusEnt.customer_product;
    const feature = cusEnt.entitlement.feature;
    const ent: EntitlementWithFeature = cusEnt.entitlement;
    const key = `${ent.interval || "no-interval"}-${feature.id}`;

    // 1. Handle boolean
    let isBoolean = feature.type == FeatureType.Boolean;
    const { unlimited, usageAllowed } = getUnlimitedAndUsageAllowed({
      cusEnts: cusEntsWithCusProduct,
      internalFeatureId: feature.internal_id!,
    });

    // 2. Initialize data
    if (!data[key]) {
      data[key] = {
        feature_id: feature.id,
        interval: ent.interval || undefined,
        unlimited: isBoolean ? undefined : unlimited,
        balance: isBoolean ? undefined : unlimited ? null : 0,
        total: isBoolean || unlimited ? undefined : 0,
        adjustment: isBoolean || unlimited ? undefined : 0,
        used: isBoolean ? undefined : unlimited ? null : 0,
        unused: 0,
      };

      if (org.config.api_version >= BREAK_API_VERSION) {
        data[key].next_reset_at =
          isBoolean || unlimited ? undefined : cusEnt.next_reset_at;
        data[key].allowance = isBoolean || unlimited ? undefined : 0;
      }
    }

    if (isBoolean || unlimited) {
      continue;
    }

    let { balance, adjustment, count, unused } = getCusEntMasterBalance({
      cusEnt,
      entities,
    });

    data[key].balance += balance || 0;
    data[key].adjustment += adjustment || 0;
    let total =
      (getResetBalance({
        entitlement: ent,
        options: getEntOptions(cusProduct.options, ent),
        relatedPrice: getRelatedCusPrice(cusEnt, cusPrices)?.price,
      }) || 0) * count;

    data[key].total += total;
    data[key].unused += unused || 0;

    if (org.config.api_version >= BREAK_API_VERSION) {
      if (
        !data[key].next_reset_at ||
        (cusEnt.next_reset_at && cusEnt.next_reset_at < data[key].next_reset_at)
      ) {
        data[key].next_reset_at = cusEnt.next_reset_at;
      }

      data[key].allowance += getResetBalance({
        entitlement: ent,
        options: getEntOptions(cusProduct.options, ent),
        relatedPrice: getRelatedCusPrice(cusEnt, cusPrices)?.price,
      });
    }
  }

  const balances = Object.values(data);

  for (const balance of balances) {
    if (
      notNullOrUndefined(balance.total) &&
      notNullOrUndefined(balance.balance)
    ) {
      balance.used =
        balance.total +
        balance.adjustment -
        balance.balance -
        (balance.unused || 0);

      delete balance.total;
      delete balance.adjustment;
    }
    delete balance.unused;
  }

  balances.sort((a, b) => {
    return a.feature_id.localeCompare(b.feature_id);
  });

  return balances;
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
    if (cusPrice.customer_product_id == cusEnt.customer_product_id) {
      let config = cusPrice.price.config as UsagePriceConfig;
      return (
        config.internal_feature_id == cusEnt.entitlement.internal_feature_id
      );
    }

    return false;
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
}: {
  entitlement: Entitlement;
  options: FeatureOptions | undefined | null;
  relatedPrice: Price | undefined | null;
}) => {
  if (!options || !relatedPrice) {
    return entitlement.allowance;
  }

  let quantity = options?.quantity;
  let billingUnits = (relatedPrice.config as UsagePriceConfig).billing_units;

  // if (!quantity || !billingUnits) {
  if (nullOrUndefined(quantity) || nullOrUndefined(billingUnits)) {
    console.log("WARNING: Quantity or billing units not found");
    console.log("Entitlement:", entitlement.id, entitlement.feature_id);
    console.log("Options:", options);
    console.log(
      "Related price:",
      relatedPrice.name,
      relatedPrice.id,
      relatedPrice.config
    );
    return entitlement.allowance;
  }

  try {
    return quantity! * billingUnits!;
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

  // Calculate existing usage

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
