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
	triggerFeatureGrant,
	grantRewardEntitlements,
	triggerFreeProduct,
	triggerFreePaidProduct,
	triggerDiscount,
	triggerCheckoutReward: runTriggerCheckoutReward,
	redeemPromoCode,
};
