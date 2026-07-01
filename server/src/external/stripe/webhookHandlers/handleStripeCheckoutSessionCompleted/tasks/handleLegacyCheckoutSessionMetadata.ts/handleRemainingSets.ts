import {
	ApiVersion,
	isUsagePrice,
	type Organization,
	type UsagePriceConfig,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { AttachParams } from "@/internal/customers/cusProducts/AttachParams.js";

const getEmptyPriceReplacement = ({
	price,
}: {
	price: AttachParams["prices"][number];
}) => {
	const config = price.config as UsagePriceConfig;
	if (!config.stripe_empty_price_id) return null;

	return {
		price: config.stripe_empty_price_id,
		quantity: 0,
	};
};

export const handleRemainingSets = async ({
	stripeCli,
	checkoutSession,
	attachParams,
	checkoutSub,
}: {
	stripeCli: Stripe;
	org: Organization;
	checkoutSession: Stripe.Checkout.Session;
	attachParams: AttachParams;
	checkoutSub: Stripe.Subscription | null;
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

		if (
			attachParams.internalEntityId ||
			attachParams.apiVersion === ApiVersion.V1_Beta
		) {
			const replaceIndex = remainingItems.findIndex(
				(item) => item.price === config.stripe_price_id,
			);

			if (replaceIndex !== -1) {
				const replacementItem = getEmptyPriceReplacement({ price });
				if (!replacementItem) {
					attachParams.req?.logger.warn(
						"checkout.completed: skipping remaining empty price replacement because usage price has no empty Stripe price",
						{ priceId: price.id },
					);
					continue;
				}

				remainingItems[replaceIndex] = replacementItem;
			}
		}
	}

	if (remainingItems.length > 0) {
		const sanitizedItems = remainingItems.map((item) => {
			if (!("adjustable_quantity" in item)) return item;

			const { adjustable_quantity: _adjustableQuantity, ...rest } = item;
			return rest;
		});

		await stripeCli.subscriptions.update(checkoutSub!.id, {
			items: sanitizedItems,
		});
	}

	return { invoiceIds };
};
