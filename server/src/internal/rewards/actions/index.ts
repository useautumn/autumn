import { runTriggerCheckoutReward } from "./triggerCheckoutReward.js";
import { triggerDiscount } from "./triggerDiscount.js";
import { triggerFreePaidProduct } from "./triggerFreePaidProduct.js";
import { triggerFreeProduct } from "./triggerFreeProduct.js";

export const rewardActions = {
	/** Grant a free product to referrer/redeemer */
	triggerFreeProduct,
	/** Grant a paid product with 100% coupon to referrer/redeemer */
	triggerFreePaidProduct,
	/** Apply a Stripe coupon discount to customer */
	triggerDiscount,
	/** Process checkout-triggered reward redemptions (called from job queue) */
	triggerCheckoutReward: runTriggerCheckoutReward,
};
