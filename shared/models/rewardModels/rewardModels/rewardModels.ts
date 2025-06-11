import { z } from "zod";
import { CouponDurationType, RewardType } from "./rewardEnums.js";

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
  type: z.nativeEnum(RewardType),

  free_product_id: z.string().nullish(),
  discount_config: DiscountConfigSchema.nullish(),

  internal_id: z.string(),
  org_id: z.string(),
  env: z.string(),
  created_at: z.number(),
});

export const CreateRewardSchema = z.object({
  name: z.string(),
  promo_codes: z.array(PromoCodeSchema),
  id: z.string(),
  type: z.nativeEnum(RewardType).nullish(),
  discount_config: DiscountConfigSchema.nullish(),
  free_product_id: z.string().nullish(),
});

export type PromoCode = z.infer<typeof PromoCodeSchema>;
export type CreateReward = z.infer<typeof CreateRewardSchema>;
export type Reward = z.infer<typeof RewardSchema>;
export type DiscountConfig = z.infer<typeof DiscountConfigSchema>;
