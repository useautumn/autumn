import { secondsToMs, stripeRefToId } from "@autumn/shared";
import type Stripe from "stripe";

/** Whether Stripe would accept the promotion code again for this customer; restricted codes count as not, since a reuse could be rejected. */
export const isPromotionCodeRedeemable = ({
	promotionCode,
	stripeCustomerId,
	currentEpochMs,
}: {
	promotionCode: Stripe.PromotionCode;
	stripeCustomerId?: string;
	currentEpochMs: number;
}) => {
	const { max_redemptions, times_redeemed, expires_at, restrictions } =
		promotionCode;
	const usedUp = max_redemptions !== null && times_redeemed >= max_redemptions;
	const expired =
		expires_at !== null && secondsToMs(expires_at) <= currentEpochMs;
	const restrictedCustomer = stripeRefToId(promotionCode.customer);
	const forAnotherCustomer =
		restrictedCustomer !== undefined && restrictedCustomer !== stripeCustomerId;
	const restricted =
		restrictions.first_time_transaction || restrictions.minimum_amount !== null;

	return (
		promotionCode.active &&
		!usedUp &&
		!expired &&
		!forAnotherCustomer &&
		!restricted
	);
};
