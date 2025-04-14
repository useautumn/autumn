import {
  CreateReward,
  RewardType,
  CouponDurationType,
  DiscountConfig,
} from "@autumn/shared";

export const defaultReward: CreateReward = {
  name: "",
  id: "",
  promo_codes: [{ code: "" }],

  type: null,

  // For free product coupons
  free_product_id: null,

  // For discount type coupons
  discount_config: null,
};

export const defaultDiscountConfig: DiscountConfig = {
  discount_value: 0,
  duration_type: CouponDurationType.Months,
  duration_value: 0,
  should_rollover: true,
  apply_to_all: true,
  price_ids: [],
};
