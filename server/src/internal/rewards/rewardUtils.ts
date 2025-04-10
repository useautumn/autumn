import { generateId, nullish } from "@/utils/genUtils.js";
import {
  Reward,
  CreateReward,
  RewardType,
  RewardCategory,
} from "@autumn/shared";

export const constructReward = ({
  reward,
  orgId,
  env,
}: {
  reward: CreateReward;
  orgId: string;
  env: string;
}) => {
  let promoCodes = reward.promo_codes.filter((promoCode) => {
    return promoCode.code.length > 0;
  });

  let configData = {};
  if (reward.type === RewardType.FreeProduct) {
    configData = {
      free_product_id: reward.free_product_id,
      discount_config: null,
    };
  } else if (reward.type === RewardType.PercentageDiscount) {
    configData = {
      discount_config: reward.discount_config,
      free_product_id: null,
    };
  }

  let newReward = {
    ...reward,
    ...configData,
    internal_id: generateId("rew"),
    created_at: Date.now(),
    org_id: orgId,
    env,
    promo_codes: promoCodes,
  };

  return newReward as Reward;
};

export const getRewardCat = (reward: Reward) => {
  if (reward.type === RewardType.FreeProduct) {
    return RewardCategory.FreeProduct;
  }
  return RewardCategory.Discount;
};

export enum CouponType {
  AddInvoiceBalance = "add_invoice_balance",
  AddBillingCredits = "add_billing_credits",
  Standard = "standard",
}

export const getCouponType = (reward: Reward) => {
  if (!reward) return null;

  let config = reward.discount_config;
  if (nullish(config)) {
    return null;
  }

  if (config!.apply_to_all && config!.should_rollover) {
    return CouponType.AddInvoiceBalance;
  } else if (config!.should_rollover) {
    return CouponType.AddBillingCredits;
  }
  return CouponType.Standard;
};

export const getOriginalCouponId = (couponId: string) => {
  if (!couponId) return null;
  const index = couponId.indexOf("_roll_");
  if (index !== -1) {
    return couponId.substring(0, index);
  }
  return couponId;
};
