import { isUsagePrice, LegacyVersion, type Organization } from "@autumn/shared";
import type Stripe from "stripe";
import type { DrizzleCli } from "@/db/initDrizzle.js";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";
import { getEmptyPriceItem } from "../../priceToStripeItem/priceToStripeItem.js";

export const handleRemainingSets = async ({
	stripeCli,
	db,
	org,
	checkoutSession,
	attachParams,
	checkoutSub,
	logger,
}: {
	stripeCli: Stripe;
	db: DrizzleCli;
	org: Organization;
	checkoutSession: Stripe.Checkout.Session;
	attachParams: AttachParams;
	checkoutSub: Stripe.Subscription | null;
	logger: any;
}) => {
	const itemSets = attachParams.itemSets;
	const remainingSets = itemSets ? itemSets.slice(1) : [];

	const remainingItems = remainingSets.flatMap((set) => set.items);
	const invoiceIds: string[] = checkoutSession.invoice
		? [checkoutSession.invoice as string]
		: [];

	// Replace items with empty price if needed...
	for (const price of attachParams.prices) {
		if (!isUsagePrice({ price })) continue;

		const config = price.config;
		const emptyPrice = config.stripe_empty_price_id;

		if (
			attachParams.internalEntityId ||
			attachParams.apiVersion === LegacyVersion.v1_4
		) {
			const replaceIndex = remainingItems.findIndex(
				(item) => item.price === config.stripe_price_id,
			);

			if (replaceIndex !== -1) {
				remainingItems[replaceIndex] = emptyPrice
					? {
							price: config.stripe_empty_price_id,
							quantity: 0,
						}
					: (getEmptyPriceItem({ price, org }) as any);
			}
		}
	}

	if (remainingItems.length > 0) {
		await stripeCli.subscriptions.update(checkoutSub!.id, {
			items: remainingItems,
		});
	}

	return { invoiceIds };
};
