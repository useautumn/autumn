import {
  AggregateType,
  AllowanceType,
  AppEnv,
  BillingInterval,
  BillWhen,
  CouponDurationType,
  CreateFreeTrial,
  DiscountType,
  EntInterval,
  Entitlement,
  Feature,
  FeatureType,
  FreeTrial,
  Organization,
  PriceType,
  RewardTriggerEvent,
} from "@autumn/shared";
import { getAxiosInstance } from "./setup.js";
import { SupabaseClient } from "@supabase/supabase-js";
import { attachPmToCus } from "@/external/stripe/stripeCusUtils.js";

export const keyToTitle = (key: string) => {
  return key
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const initFeature = ({
  id,
  type,
  creditSchema = [],
  aggregateType = AggregateType.Sum,
  groupBy = "",
  eventName,
}: {
  id: string;
  type: FeatureType;
  creditSchema?: {
    metered_feature_id: string;
    feature_amount: number;
    credit_amount: number;
  }[];
  aggregateType?: AggregateType;
  groupBy?: string;
  eventName?: string;
}): (Feature & { eventName: string }) | any => {
  const name = keyToTitle(id);

  if (type == FeatureType.Boolean) {
    return {
      id,
      name,
      type,
    } as Feature;
  }

  if (type == FeatureType.Metered) {
    return {
      id,
      name,
      type,
      config: {
        filters: [
          {
            value: eventName ? [eventName] : [id],
            property: "",
            operator: "",
          },
        ],
        aggregate: {
          type: aggregateType,
          property: "value",
        },
        group_by: groupBy
          ? {
              property: groupBy,
            }
          : undefined,
      },
    } as Feature;
  }

  if (type == FeatureType.CreditSystem) {
    return {
      id,
      name,
      type,
      config: {
        schema: creditSchema,
      },
    } as Feature;
  }

  throw new Error(`Invalid feature type: ${type}`);
};

export const initEntitlement = ({
  feature,
  allowance,
  interval = EntInterval.Month,
  allowanceType = AllowanceType.Fixed,
  entityFeatureId,
  carryFromPrevious = false,
}: {
  feature: Feature;
  allowance?: number;
  interval?: EntInterval;
  allowanceType?: AllowanceType;
  entityFeatureId?: string;
  carryFromPrevious?: boolean;
}) => {
  if (feature.type == FeatureType.Boolean) {
    return {
      feature_id: feature.id,
      internal_feature_id: feature.internal_id,
    };
  }

  const isUnlimitedOrNone =
    allowanceType == AllowanceType.Unlimited || allowance == null;

  return {
    feature_id: feature.id,
    internal_feature_id: feature.internal_id,
    allowance_type: allowanceType,
    allowance: isUnlimitedOrNone ? null : allowance,
    interval: isUnlimitedOrNone ? null : interval,
    entity_feature_id: entityFeatureId,
    carry_from_previous: carryFromPrevious,
  };
};

export const initPrice = ({
  type,
  feature,
  billingInterval = BillingInterval.Month,
  amount = 10.0,
  oneTier = false,
  billingUnits = 10,
}: {
  type:
    | "monthly"
    | "in_advance"
    | "in_arrears"
    | "fixed_cycle"
    | "in_arrear_prorated";
  feature?: Feature;
  billingInterval?: BillingInterval;
  amount?: number;
  oneTier?: boolean;
  billingUnits?: number;
}) => {
  if (type == "monthly" || type == "fixed_cycle") {
    return {
      name: type == "monthly" ? "Monthly" : "Fixed Cycle",
      config: {
        type: PriceType.Fixed,
        amount: amount,
        interval: billingInterval,
      },
    };
  }

  if (!feature) {
    throw new Error("Feature is required for in_advance and in_arrears");
  }

  if (type == "in_advance") {
    return {
      name: "In Advance",
      config: {
        type: PriceType.Usage,
        bill_when: BillWhen.StartOfPeriod,
        feature_id: feature!.id,
        interval: billingInterval,
        billing_units: billingUnits,
        usage_tiers: [
          {
            from: 0,
            to: -1,
            amount: amount || 10.0,
          },
        ],
      },
    };
  }

  if (type == "in_arrears" || type == "in_arrear_prorated") {
    return {
      name: "In Arrears",
      config: {
        type: PriceType.Usage,
        bill_when: BillWhen.EndOfPeriod,
        feature_id: feature!.id,
        interval: billingInterval,
        billing_units: billingUnits,
        should_prorate: type == "in_arrear_prorated",
        usage_tiers: oneTier
          ? [
              {
                from: 0,
                to: -1,
                amount: amount || 0.01,
              },
            ]
          : [
              {
                from: 0,
                to: 10,
                amount: 0.5,
              },
              {
                from: 11,
                to: -1,
                amount: 0.25,
              },
            ],
      },
    };
  }
};

export const initFreeTrial = ({
  length,
  uniqueFingerprint = false,
}: {
  length: number;
  uniqueFingerprint?: boolean;
}): CreateFreeTrial => {
  return {
    length,
    unique_fingerprint: uniqueFingerprint,
  };
};

export const initProduct = ({
  id,
  isDefault = false,
  isAddOn = false,
  entitlements,
  prices,
  freeTrial,
  group = "",
}: {
  id: string;
  isDefault?: boolean;
  isAddOn?: boolean;
  entitlements: Record<string, Entitlement>;
  prices: any[];
  freeTrial: CreateFreeTrial | null;
  group?: string;
}) => {
  return {
    id,
    name: keyToTitle(id),
    is_default: isDefault,
    is_add_on: isAddOn,
    entitlements: entitlements,
    prices,
    free_trial: freeTrial,
    group: group,
  };
};

export const initCustomer = async ({
  customer_data,
  customerId,
  attachPm = false,
  sb,
  org,
  env,
  testClockId,
}: {
  customer_data?: {
    id: string;
    name: string;
    email: string;
    fingerprint?: string;
  };
  customerId?: string;
  attachPm?: boolean;
  sb: SupabaseClient;
  org: Organization;
  env: AppEnv;
  testClockId?: string;
}) => {
  const axiosInstance = getAxiosInstance();

  if (!customerId && !customer_data) {
    throw new Error("customerId or customer_data is required");
  }

  let customerData = customerId
    ? {
        id: customerId,
        name: customerId,
        email: `${customerId}@example.com`,
      }
    : customer_data;

  // Delete customer if exists
  try {
    await axiosInstance.delete(`/v1/customers/${customerData!.id}`);
    // console.log("   - Successfully deleted customer");
  } catch (error) {
    // console.log("Failed to delete customer");
  }

  try {
    const { data } = await axiosInstance.post(`/v1/customers`, customerData);
    // Attach stripe card

    if (attachPm) {
      await attachPmToCus({
        customer: data.customer,
        org: org,
        env: env,
        sb: sb,
        testClockId: testClockId,
      });
    }

    return data.customer;
  } catch (error) {
    console.log("Failed to create customer", error);
  }
};

// Init Reward
export const initReward = ({
  id,
  discountType = DiscountType.Fixed,
  discountValue,
  durationType = CouponDurationType.OneOff,
  durationValue = 0,
  rollover = false,
  onlyUsagePrices = false,
  productIds,
  applyToAll = false,
}: {
  id: string;
  discountValue: number;
  discountType?: DiscountType;
  durationType?: CouponDurationType;
  durationValue?: number;
  rollover?: boolean;
  onlyUsagePrices?: boolean;
  productIds?: string[];
  applyToAll?: boolean;
}): any => {
  return {
    id,
    name: keyToTitle(id),
    discount_type: discountType,
    discount_value: discountValue,
    duration_type: durationType,
    duration_value: durationValue,
    should_rollover: rollover,
    apply_to_all: applyToAll,
    only_usage_prices: onlyUsagePrices,
    product_ids: productIds,
  };
};

export const initRewardTrigger = ({
  id,
  when = RewardTriggerEvent.Immediately,
  productIds = [],
  internalRewardId,
  maxRedemptions = 2,
}: {
  id: string;
  productIds?: string[];
  internalRewardId: string;
  when?: RewardTriggerEvent;
  maxRedemptions?: number;
}): any => {
  return {
    id,
    when,
    product_ids: productIds,
    internal_reward_id: internalRewardId,
    max_redemptions: maxRedemptions,
  };
};
