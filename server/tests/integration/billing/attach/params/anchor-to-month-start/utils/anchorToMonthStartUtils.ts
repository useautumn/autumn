import { expect } from "bun:test";
import { type ProductV2, secondsToMs } from "@autumn/shared";
import { getStripeSubscription } from "@tests/integration/billing/utils/stripeSubscriptionUtils";

/** Next 1st of the month at 00:00 UTC, computed independently of the server helper. */
export const nextMonthStartMs = ({ fromMs }: { fromMs: number }) => {
	const from = new Date(fromMs);
	return Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1);
};

export const anchoredToMonthStart = (product: ProductV2): ProductV2 => {
	product.config = { ...product.config, anchor_to_month_start: true };
	return product;
};

export const expectStripeSubscriptionAnchorCorrect = async ({
	customerId,
	anchorMs,
}: {
	customerId: string;
	anchorMs: number;
}) => {
	const { subscription } = await getStripeSubscription({ customerId });
	expect(secondsToMs(subscription.billing_cycle_anchor)).toBe(anchorMs);
	return subscription;
};
