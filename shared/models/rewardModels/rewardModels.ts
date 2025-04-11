import { z } from "zod";

export enum RewardCategory {
  FreeProduct = "free_product",
  Discount = "discount",
}

export enum CouponDurationType {
  Months = "months",
  OneOff = "one_off",
  Forever = "forever",
}

export enum DiscountType {
  Percentage = "percentage",
  Fixed = "fixed",
}

export enum RewardType {
  // Coupon = "coupon",
  // Reward = "reward",
  PercentageDiscount = "percentage_discount",
  FixedDiscount = "fixed_discount",
  FreeProduct = "free_product",
}

const PromoCodeSchema = z.object({
  code: z.string(),
});

export const DiscountConfigSchema = z.object({
  discount_value: z.number(),
  duration_type: z.nativeEnum(CouponDurationType),
  duration_value: z.number(),
  should_rollover: z.boolean().optional(),
  apply_to_all: z.boolean().optional(),
  price_ids: z.array(z.string()),
});

const RewardSchema = z.object({
  name: z.string().nullish(),

  promo_codes: z.array(PromoCodeSchema),
  id: z.string(),

  // discount_type: z.nativeEnum(DiscountType),
  type: z.nativeEnum(RewardType),

  // For free product coupons
  free_product_id: z.string().nullish(),

  // For discount type coupons
  discount_config: DiscountConfigSchema.nullish(),

  // EXTRA
  internal_id: z.string(),
  org_id: z.string(),
  env: z.string(),
  created_at: z.number(),
});

export const CreateRewardSchema = z.object({
  name: z.string(),
  promo_codes: z.array(PromoCodeSchema),
  id: z.string().nullish(),

  type: z.nativeEnum(RewardType).nullish(),

  // For discount type coupons
  discount_config: DiscountConfigSchema.nullish(),

  // For free product coupons
  free_product_id: z.string().nullish(),
});

export type CreateReward = z.infer<typeof CreateRewardSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type DiscountConfig = z.infer<typeof DiscountConfigSchema>;
