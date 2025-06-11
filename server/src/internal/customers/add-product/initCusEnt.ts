import {
  AllowanceType,
  AttachReplaceable,
  BillingType,
  Customer,
  EntInterval,
  Entity,
  EntityBalance,
  FeatureType,
  FreeTrial,
  FullCusProduct,
  FullCustomerEntitlement,
  InsertReplaceable,
  Price,
} from "@autumn/shared";

import { FeatureOptions } from "@autumn/shared";

import { EntitlementWithFeature } from "@autumn/shared";
import { getResetBalance } from "../cusProducts/cusEnts/cusEntUtils.js";
import { formatUnixToDate, generateId, notNullish } from "@/utils/genUtils.js";
import { getBillingType } from "@/internal/products/prices/priceUtils.js";
import { applyTrialToEntitlement } from "@/internal/products/entitlements/entitlementUtils.js";
import { freeTrialToStripeTimestamp } from "@/internal/products/free-trials/freeTrialUtils.js";
import { getNextEntitlementReset } from "@/utils/timeUtils.js";
import { subtractFromUnixTillAligned } from "@/internal/products/prices/billingIntervalUtils.js";
import { UTCDate } from "@date-fns/utc";
import { entitlementLinkedToEntity } from "@/internal/api/entities/entityUtils.js";
import { initNextResetAt } from "../cusProducts/insertCusProduct/initCusEnt/initNextResetAt.js";

export const initCusEntEntities = ({
  entitlement,
  entities,
  existingCusEnt,
  resetBalance,
}: {
  entitlement: EntitlementWithFeature;
  entities: Entity[];
  existingCusEnt?: FullCustomerEntitlement;
  resetBalance?: number | null;
}) => {
  let newEntities: Record<string, EntityBalance> | null = notNullish(
    entitlement.entity_feature_id,
  )
    ? {}
    : null;

  for (const entity of entities) {
    if (!entitlementLinkedToEntity({ entitlement, entity })) {
      continue;
    }

    if (
      existingCusEnt &&
      existingCusEnt.entities &&
      existingCusEnt.entities[entity.id]
    ) {
      continue;
    }

    if (!newEntities) {
      newEntities = {};
    }

    newEntities[entity.id] = {
      id: entity.id,
      balance: resetBalance || 0,
      adjustment: 0,
    };
  }

  return newEntities;
};

const initCusEntBalance = ({
  entitlement,
  curCusProduct,

  options,
  relatedPrice,
  // existingCusEnt,
  entities,
  carryExistingUsages = false,
}: {
  entitlement: EntitlementWithFeature;
  curCusProduct?: FullCusProduct;

  options?: FeatureOptions;
  relatedPrice?: Price;
  // existingCusEnt?: FullCustomerEntitlement;
  entities: Entity[];
  carryExistingUsages?: boolean;
}) => {
  if (entitlement.feature.type === FeatureType.Boolean) {
    return { newBalance: null, newEntities: null };
  }

  const resetBalance = getResetBalance({
    entitlement,
    options,
    relatedPrice,
  });

  let newEntities: Record<string, EntityBalance> | null = initCusEntEntities({
    entitlement,
    entities,
    resetBalance,
  });

  return { newBalance: resetBalance, newEntities };

  // // 1. Get existing usage
  // let { cusEnt, usage } = getExistingCusEntAndUsage({
  //   entitlement,
  //   curCusProduct,
  //   relatedPrice,
  // });

  // Carry over entities3

  // if (
  //   !existingCusEnt ||
  //   (!entitlement.carry_from_previous && !carryExistingUsages)
  // ) {
  //   return { newBalance: resetBalance, newEntities };
  // }

  // let existingAllowanceType = existingCusEnt.entitlement.allowance_type;
  // if (
  //   nullish(existingCusEnt.balance) ||
  //   existingAllowanceType === AllowanceType.Unlimited
  // ) {
  //   return { newBalance: resetBalance, newEntities };
  // }

  // // Calculate existing usage

  // let curOptions = getEntOptions(
  //   curCusProduct?.options || [],
  //   existingCusEnt.entitlement
  // );
  // let curPrice = getRelatedCusPrice(
  //   existingCusEnt,
  //   curCusProduct?.customer_prices || []
  // );

  // let existingAllowance = getResetBalance({
  //   entitlement: existingCusEnt.entitlement,
  //   options: curOptions,
  //   relatedPrice: curPrice?.price,
  // });

  // let existingUsage = existingAllowance! - existingCusEnt.balance!;
  // let newBalance = resetBalance! - existingUsage;

  // if (
  //   entitlement.entity_feature_id ==
  //   existingCusEnt.entitlement.entity_feature_id
  // ) {
  //   if (!newEntities) {
  //     newEntities = {};
  //   }

  //   for (const entityId in existingCusEnt.entities) {
  //     let existingBalance = existingCusEnt.entities[entityId].balance;
  //     let existingUsage = existingAllowance! - existingBalance;

  //     let newBalance = resetBalance! - existingUsage;

  //     newEntities[entityId] = {
  //       id: entityId,
  //       balance: newBalance,
  //       adjustment: 0,
  //     };
  //   }
  // }

  // return { newBalance, newEntities };
};

// MAIN FUNCTION
export const initCusEntitlement = ({
  entitlement,
  customer,
  cusProductId,
  freeTrial,
  options,
  nextResetAt,
  relatedPrice,
  // existingCusEnt,
  // keepResetIntervals = false,
  trialEndsAt,
  anchorToUnix,
  entities,
  carryExistingUsages = false,
  curCusProduct,
  replaceables,
  now,
}: {
  entitlement: EntitlementWithFeature;
  customer: Customer;
  cusProductId: string;
  freeTrial: FreeTrial | null;
  options?: FeatureOptions;
  nextResetAt?: number;
  relatedPrice?: Price;
  // existingCusEnt?: FullCustomerEntitlement;
  // keepResetIntervals?: boolean;
  trialEndsAt?: number;
  anchorToUnix?: number;
  entities: Entity[];
  carryExistingUsages?: boolean;
  curCusProduct?: FullCusProduct;
  replaceables: AttachReplaceable[];
  now?: number;
}) => {
  now = now || Date.now();
  let { newBalance, newEntities } = initCusEntBalance({
    entitlement,
    options,
    relatedPrice,
    entities,
    carryExistingUsages,
    curCusProduct,
  });

  newBalance =
    (newBalance || 0) -
    replaceables.filter((r) => r.ent.id === entitlement.id).length;

  let nextResetAtValue = initNextResetAt({
    entitlement,
    nextResetAt,
    // keepResetIntervals,
    // existingCusEnt,
    trialEndsAt,
    freeTrial,
    anchorToUnix,
    now,
  });

  // 3. Define expires at (TODO next time...)
  let isBooleanFeature = entitlement.feature.type === FeatureType.Boolean;
  let usageAllowed = false;

  if (
    relatedPrice &&
    (getBillingType(relatedPrice.config!) === BillingType.UsageInArrear ||
      getBillingType(relatedPrice.config!) === BillingType.InArrearProrated)
  ) {
    usageAllowed = true;
  }

  return {
    id: generateId("cus_ent"),
    internal_customer_id: customer.internal_id,
    internal_feature_id: entitlement.internal_feature_id,
    feature_id: entitlement.feature_id,
    customer_id: customer.id,

    // Foreign keys
    entitlement_id: entitlement.id,
    customer_product_id: cusProductId,
    created_at: Date.now(),

    // Entitlement fields
    unlimited: isBooleanFeature
      ? null
      : entitlement.allowance_type === AllowanceType.Unlimited,
    balance: newBalance || 0,
    entities: newEntities,
    usage_allowed: usageAllowed,
    next_reset_at: nextResetAtValue,
  };
};
