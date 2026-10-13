import type Stripe from "stripe";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils";

/** Set on a coupon Autumn copies, e.g. a carried repeating coupon cut to its remaining months. */
export const ORIGINAL_COUPON_ID_METADATA_KEY = "autumn_original_coupon_id";

/** The reward a Stripe coupon stands for, so a copy is removed and deduped as its original. */
export const stripeCouponToRewardId = (coupon: Stripe.Coupon) =>
	coupon.metadata?.[ORIGINAL_COUPON_ID_METADATA_KEY] ??
	getOriginalCouponId(coupon.id) ??
	coupon.id;
