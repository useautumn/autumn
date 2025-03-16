import {
  CusEntWithEntitlement,
  Feature,
  FeatureType,
  Event,
  FullCustomerEntitlement,
  CreditSchemaItem,
} from "@autumn/shared";
import { CustomerEntitlementService } from "./CusEntitlementService.js";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  creditSystemContainsFeature,
  getCreditSystemsFromFeature,
} from "@/internal/features/creditSystemUtils.js";
import {
  notNullish,
  notNullOrUndefined,
  nullOrUndefined,
} from "@/utils/genUtils.js";

export const getGroupbalanceFromParams = ({
  params,
  feature,
  cusEnt,
}: {
  params: any;
  feature: Feature;
  cusEnt: CusEntWithEntitlement;
}) => {
  if (!feature.config?.group_by) {
    return {
      groupField: null,
      groupVal: null,
      balance: cusEnt.balance,
      adjustment: cusEnt.adjustment,
    };
  }

  let groupField = feature.config?.group_by?.property;
  if (nullOrUndefined(params[groupField])) {
    return {
      groupField: null,
      groupVal: null,
      balance: cusEnt.balance,
      adjustment: cusEnt.adjustment,
    };
  }

  let groupVal = params[groupField];
  let balance = cusEnt.balances?.[groupVal]?.balance;
  let adjustment = cusEnt.balances?.[groupVal]?.adjustment;
  if (nullOrUndefined(balance)) {
    return { groupField, groupVal, balance: null, adjustment: null };
  }

  return { groupField, groupVal, balance, adjustment };
};
// 1. Event contains group_by value
export const getGroupValFromProperties = ({
  properties,
  feature,
}: {
  properties: any;
  feature: Feature;
}) => {
  if (!feature.config?.group_by) {
    return null;
  }

  return properties[feature.config.group_by.property];
};

export const getGroupBalanceFromProperties = ({
  properties,
  feature,
  features,
  cusEnt,
}: {
  properties: any;
  feature?: Feature;
  features?: Feature[];
  cusEnt: CusEntWithEntitlement;
}) => {
  if (features && !feature) {
    feature = features.find(
      (f) => f.internal_id == cusEnt.entitlement.internal_feature_id
    )!;
  }

  // TODO: Add support for credit systems?
  let groupVal = getGroupValFromProperties({ properties, feature: feature! });

  if (nullOrUndefined(groupVal)) {
    return {
      groupVal: null,
      balance: cusEnt.balance,
    };
  }

  let balance = cusEnt.balances?.[groupVal]?.balance;

  if (nullOrUndefined(balance)) {
    return {
      groupVal,
      balance: null,
    };
  }

  return {
    groupVal,
    balance,
  };
};

export const getGroupBalanceUpdate = ({
  groupVal,
  cusEnt,
  newBalance,
}: {
  groupVal: any;
  cusEnt: CusEntWithEntitlement;
  newBalance: number;
}) => {
  if (groupVal) {
    let adjustment = cusEnt.balances?.[groupVal]?.adjustment || 0;
    return {
      balances: {
        ...cusEnt.balances,
        [groupVal]: {
          balance: newBalance,
          adjustment,
        },
      },
    };
  }

  return {
    balance: newBalance,
  };
};

// INIT UTILS
const initCusEntGroupBalance = async ({
  sb,
  cusEnt,
  groupValue,
}: {
  sb: SupabaseClient;
  cusEnt: CusEntWithEntitlement;
  groupValue: any;
}) => {
  let balances = cusEnt.balances;
  let shouldUpdate = false;

  if (!balances) {
    balances = {};
    shouldUpdate = true;
  }

  const balance = balances[groupValue];

  if (!balance) {
    balances[groupValue] = {
      balance: cusEnt.entitlement.allowance || 0,
      adjustment: 0,
    };
    shouldUpdate = true;
  }

  if (shouldUpdate) {
    await CustomerEntitlementService.update({
      sb,
      id: cusEnt.id,
      updates: { balances },
    });

    console.log(
      `   - Initialized ${cusEnt.feature_id} balance for group ${groupValue}`
    );
    return balances;
  }

  return balances;
};

export const initGroupBalances = async ({
  sb,
  feature,
  cusEnts,
  groupValue,
}: {
  sb: SupabaseClient;
  feature: Feature;
  cusEnts: CusEntWithEntitlement[];
  groupValue: any;
}) => {
  let groupField = feature.config?.group_by?.property;
  if (!groupField) {
    return;
  }

  let batchInit = [];
  for (const cusEnt of cusEnts) {
    batchInit.push(initCusEntGroupBalance({ sb, cusEnt, groupValue }));
  }

  const results = await Promise.all(batchInit);
  for (let i = 0; i < results.length; i++) {
    cusEnts[i].balances = results[i];
  }
};

export const initGroupBalancesForEvent = async ({
  sb,
  features,
  cusEnts,
  properties,
}: {
  sb: SupabaseClient;
  features: Feature[];
  cusEnts: CusEntWithEntitlement[];
  properties: any;
}) => {
  let meteredFeatures = features.filter((f) => f.type == FeatureType.Metered);

  for (const feature of meteredFeatures) {
    const groupField = feature.config?.group_by?.property;
    if (!groupField) {
      continue;
    }

    const groupValue = properties[groupField];
    if (nullOrUndefined(groupValue)) {
      continue;
    }

    let creditSystems = features.filter(
      (f) =>
        f.type == FeatureType.CreditSystem &&
        creditSystemContainsFeature({
          creditSystem: f,
          meteredFeatureId: feature.id,
        })
    );

    let affectedCusEnts = cusEnts.filter((cusEnt) => {
      return [feature, ...creditSystems].some((f) => {
        return cusEnt.entitlement.internal_feature_id == f.internal_id;
      });
    });

    if (affectedCusEnts.length > 0) {
      await initGroupBalances({
        sb,
        feature,
        cusEnts: affectedCusEnts,
        groupValue,
      });
    }
  }
};

export const initGroupBalancesFromGetCus = async ({
  sb,
  cusEnts,
  params,
}: {
  sb: SupabaseClient;
  cusEnts: FullCustomerEntitlement[];
  params: any;
}) => {
  let features = cusEnts.map((cusEnt) => cusEnt.entitlement.feature);

  for (const query in params) {
    let groupField = query;
    let groupValue = params[query];

    let feature = features.find(
      (f) => f.config?.group_by?.property == groupField
    );

    if (!feature || nullOrUndefined(groupValue)) {
      continue;
    }

    let creditSystems = getCreditSystemsFromFeature({
      meteredFeatureId: feature.id,
      features,
    });

    let affectedCusEnts = cusEnts.filter((cusEnt) => {
      return [feature, ...creditSystems].some((f) => {
        return cusEnt.entitlement.internal_feature_id == f.internal_id;
      });
    });

    if (affectedCusEnts.length > 0) {
      await initGroupBalances({
        sb,
        feature,
        cusEnts: affectedCusEnts,
        groupValue,
      });
    }
  }
};

export const initGroupBalancesFromUpdateBalances = async ({
  sb,
  cusEnts,
  updates,
  features,
}: {
  sb: SupabaseClient;
  updates: any;
  cusEnts: CusEntWithEntitlement[];
  features: Feature[];
}) => {
  for (const update of updates) {
    let featureId = update.feature_id;
    let feature = features.find((f) => f.id == featureId);
    if (!feature) {
      continue;
    }

    let groupField = feature.config?.group_by?.property;
    let groupValue = update[groupField];

    if (nullOrUndefined(groupValue)) {
      continue;
    }

    let affectedCusEnts = cusEnts.filter((cusEnt) => {
      return cusEnt.entitlement.internal_feature_id == feature.internal_id;
    });

    if (affectedCusEnts.length > 0) {
      await initGroupBalances({
        sb,
        feature,
        cusEnts: affectedCusEnts,
        groupValue,
      });
    }
  }
};

export const getResetBalancesUpdate = ({
  cusEnt,
  allowance,
}: {
  cusEnt: CusEntWithEntitlement;
  allowance?: number;
}) => {
  let update = {};
  let newBalance = notNullish(allowance)
    ? allowance!
    : cusEnt.entitlement.allowance || 0;

  if (cusEnt.balances) {
    let newBalances = { ...cusEnt.balances };
    for (const groupVal in newBalances) {
      newBalances[groupVal].balance = newBalance;
      newBalances[groupVal].adjustment = 0;
    }
    update = { balances: newBalances };
  }

  return {
    ...update,
    balance: newBalance,
    adjustment: 0,
  };
};
