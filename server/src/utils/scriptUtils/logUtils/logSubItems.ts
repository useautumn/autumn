import { stripeToAtmnAmount } from "@autumn/shared";
import type Stripe from "stripe";
import { subItemToAutumnInterval } from "@/external/stripe/utils.js";

export const logSubItems = ({
	sub,
	subItems,
}: {
	sub?: Stripe.Subscription;
	subItems?: Stripe.SubscriptionItem[];
}) => {
	const finalSubItems = subItems || sub!.items.data;
	for (const item of finalSubItems) {
		const isMetered = item.price.recurring?.usage_type === "metered";

		const atmnPrice = stripeToAtmnAmount({
			amount: item.price.unit_amount || 0,
			currency: item.price.currency,
		});

		if (isMetered) {
			console.log(`Usage price`);
		} else {
			const price = atmnPrice;
			const subInterval = subItemToAutumnInterval(item);
			console.log(
				`${price} ${item.price.currency}${item.quantity !== 1 ? ` x ${item.quantity}` : ""} / ${subInterval?.intervalCount} ${subInterval?.interval}`,
			);
		}
	}
};
