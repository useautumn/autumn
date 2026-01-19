import {
	type FullCustomer,
	getTargetSubscriptionCusProduct,
	InternalError,
	type Product,
} from "@autumn/shared";
import { createStripeCli } from "@server/external/connect/createStripeCli";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";

export const fetchStripeSubscriptionForBilling = async ({
	ctx,
	fullCus,
	products,
	targetCusProductId,
}: {
	ctx: AutumnContext;
	fullCus: FullCustomer;
	products: Product[];
	targetCusProductId?: string;
}) => {
	const { org, env } = ctx;
	const stripeCli = createStripeCli({ org, env });

	const product: Product | undefined = products[0];

	const cusProductWithSub = getTargetSubscriptionCusProduct({
		fullCus,
		productId: product?.id,
		productGroup: product?.group,
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

	return sub;
};
