import { Client } from "pg";
import { CustomerEntitlementService } from "./CusEntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { AllowanceType, FeatureType } from "@autumn/shared";

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
