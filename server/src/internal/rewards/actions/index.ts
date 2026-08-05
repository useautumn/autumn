import { createApiReward } from "./createApiReward/createApiReward.js";
import { grantRewardEntitlements } from "./grantRewardEntitlements.js";
import { redeemPromoCode } from "./redeemPromoCode.js";
import { runTriggerCheckoutReward } from "./triggerCheckoutReward.js";
import { triggerDiscount } from "./triggerDiscount.js";
import { triggerFeatureGrant } from "./triggerFeatureGrant.js";
import { triggerFreePaidProduct } from "./triggerFreePaidProduct.js";
import { triggerFreeProduct } from "./triggerFreeProduct.js";

export const rewardActions = {
	create: createApiReward,
	/** Grant a feature grant reward's entitlements to referrer/redeemer */
	triggerFeatureGrant,
	/** Grant loose entitlements from a feature grant reward to one customer */
	grantRewardEntitlements,
	/** Grant a free product to referrer/redeemer */
	triggerFreeProduct,
	/** Grant a paid product with 100% coupon to referrer/redeemer */
	triggerFreePaidProduct,
	/** Apply a Stripe coupon discount to customer */
	triggerDiscount,
	/** Process checkout-triggered reward redemptions (called from job queue) */
	triggerCheckoutReward: runTriggerCheckoutReward,
	/** Redeem a promo code and grant loose entitlements */
	redeemPromoCode,
};
