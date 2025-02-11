import { Client } from "pg";
import { CustomerEntitlementService } from "./CusEntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  AllowanceType,
  AppEnv,
  CusProduct,
  Customer,
  EntInterval,
  EntitlementWithFeature,
  FeatureType,
  FullCustomerEntitlement,
  FullCustomerPrice,
  Organization,
  UsagePriceConfig,
} from "@autumn/shared";
import { getEntOptions } from "@/internal/prices/priceUtils.js";
import { createStripeCli } from "@/external/stripe/utils.js";
import { notNullOrUndefined } from "@/utils/genUtils.js";

export const getFeatureBalance = async ({
  pg,
  customerId,
  featureId,
  orgId,
}: {
  pg: Client;
  customerId: string;
  featureId: string;
  orgId: string;
}) => {
  const { rows } = await pg.query(
    `
    select sum(balance) from customer_entitlements ce  JOIN 
    customer_products cp on ce.customer_product_id = cp.id

    where org_id = $1
    and customer_id = $2
    and feature_id = $3
    and cp.status = 'active'
  `,
    [orgId, customerId, featureId]
  );

  if (rows.length === 0) {
    return null;
  }

  return parseFloat(rows[0].sum);
};

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

export const getCusBalancesByEntitlement = async ({
  cusEntsWithCusProduct,
}: {
  cusEntsWithCusProduct: CusEntsWithCusProduct[];
}) => {
  const data: Record<string, any> = {};

  for (const cusEnt of cusEntsWithCusProduct) {
    const cusProduct = cusEnt.customer_product;
    const feature = cusEnt.entitlement.feature;
    const ent: EntitlementWithFeature = cusEnt.entitlement;

    const key = `${ent.interval || "no-interval"}-${feature.id}`;

    const isBoolean = feature.type == FeatureType.Boolean;
    const isUnlimited = ent.allowance_type == AllowanceType.Unlimited;

    if (!data[key]) {
      data[key] = {
        feature_id: feature.id,
        interval: ent.interval,
        balance: isBoolean ? undefined : isUnlimited ? null : 0,
        total: isBoolean ? undefined : isUnlimited ? null : 0,
        unlimited: isBoolean ? undefined : isUnlimited,
        adjustment: isBoolean ? undefined : isUnlimited ? null : 0,
      };
    }

    if (isBoolean) {
      continue;
    }

    if (ent.allowance_type == AllowanceType.Unlimited) {
      data[key].balance = null;
      data[key].total = null;
      data[key].unlimited = true;
      data[key].adjustment = null;
    } else if (data[key].unlimited) {
      continue;
    } else {
      if (ent.allowance_type == AllowanceType.None) {
        data[key].balance += 0;
      } else {
        data[key].balance += cusEnt.balance;
        data[key].adjustment += cusEnt.adjustment;
      }
    }

    const entOption = getEntOptions(cusProduct.options, ent);

    if (ent.allowance_type == AllowanceType.Fixed) {
      let quantity = entOption?.quantity || 1;
      data[key].total += quantity * ent.allowance!;
    }
  }

  const balances = Object.values(data);

  for (const balance of balances) {
    if (
      notNullOrUndefined(balance.total) &&
      notNullOrUndefined(balance.balance)
    ) {
      balance.used = balance.total + balance.adjustment - balance.balance;
      delete balance.total;
      delete balance.adjustment;
    }
  }

  balances.sort((a, b) => {
    return a.feature_id.localeCompare(b.feature_id);
  });

  return balances;
};

export const sortCusEntsForDeduction = (cusEnts: FullCustomerEntitlement[]) => {
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

    // If one has a next_reset_at, it should go first
    if (a.next_reset_at && !b.next_reset_at) {
      return -1;
    }

    // If b has a next_reset_at, it should go first
    if (!a.next_reset_at && b.next_reset_at) {
      return 1;
    }

    // 3. Sort by interval
    if (aEnt.interval && bEnt.interval) {
      return intervalOrder[aEnt.interval] - intervalOrder[bEnt.interval];
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
