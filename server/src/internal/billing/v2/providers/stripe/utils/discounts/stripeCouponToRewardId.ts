import type Stripe from "stripe";
import { getOriginalCouponId } from "@/internal/rewards/rewardUtils";

export const ORIGINAL_COUPON_ID_METADATA_KEY = "autumn_original_coupon_id";

export const stripeCouponToRewardId = (coupon: Stripe.Coupon) =>
	coupon.metadata?.[ORIGINAL_COUPON_ID_METADATA_KEY] ??
	getOriginalCouponId(coupon.id) ??
	coupon.id;
