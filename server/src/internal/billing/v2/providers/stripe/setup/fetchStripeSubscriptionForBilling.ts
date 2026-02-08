import {
	type FullCustomer,
	getTargetSubscriptionCusProduct,
	InternalError,
	type Product,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { StripeSubscriptionWithDiscounts } from "@server/external/stripe/subscriptions";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";

/**
 * Fetches a Stripe subscription with expanded discounts for billing operations.
 * Returns the subscription with `discounts.source.coupon.applies_to` expanded.
 */
export const fetchStripeSubscriptionForBilling = async ({
	ctx,
	fullCus,
	product,
	targetCusProductId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	product?: Product;
	targetCusProductId?: string;
}): Promise<StripeSubscriptionWithDiscounts | undefined> => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const cusProductWithSub = getTargetSubscriptionCusProduct({
		fullCus,
		productId: product?.id ?? "",
		productGroup: product?.group ?? "",
		cusProductId: targetCusProductId,
	});

	const subId = cusProductWithSub?.subscription_ids?.[0];

	if (!subId) return undefined;

	const sub = await stripeCli.subscriptions.retrieve(subId, {
		expand: [
			"discounts.source.coupon.applies_to",
			"latest_invoice.lines.data.discount_amounts",
		],
	});

	if (!sub) {
		throw new InternalError({
			message: `[Stripe Subscription] Subscription not found: ${subId}`,
		});
	}

	return sub as StripeSubscriptionWithDiscounts;
};
