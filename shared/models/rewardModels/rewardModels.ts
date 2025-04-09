import { z } from "zod";

export enum CouponDurationType {
  Months = "months",
  OneOff = "one_off",
  Forever = "forever",
}

export enum DiscountType {
  Percentage = "percentage",
  Fixed = "fixed",
}

const CouponSchema = z.object({
  internal_id: z.string(),
  name: z.string().nullish(),
  price_ids: z.array(z.string()),
  promo_codes: z.array(z.record(z.string(), z.string())),

  discount_type: z.nativeEnum(DiscountType),
  discount_value: z.number(),
  duration_type: z.nativeEnum(CouponDurationType),
  duration_value: z.number(),

  should_rollover: z.boolean().optional(),
  apply_to_all: z.boolean().optional(),

  // EXTRA
  org_id: z.string(),
  env: z.string(),
  created_at: z.number(),
});

export const CreateCouponSchema = CouponSchema.omit({
  internal_id: true,
  org_id: true,
  env: true,
  created_at: true,
});

export type Coupon = z.infer<typeof CouponSchema>;
export type CreateCoupon = z.infer<typeof CreateCouponSchema>;
export type Reward = z.infer<typeof CouponSchema>;
