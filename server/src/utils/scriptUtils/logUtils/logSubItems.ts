import type Stripe from "stripe";
import { subItemToAutumnInterval } from "@/external/stripe/utils.js";

export const logSubItems = ({
	sub,
	subItems,
}: {
	sub?: Stripe.Subscription;
	subItems?: Stripe.SubscriptionItem[];
}) => {
	const finalSubItems = subItems || sub?.items.data;
	for (const item of finalSubItems) {
		const isMetered = item.price.recurring?.usage_type === "metered";
		const _isTiered = item.price.billing_scheme === "tiered";

		if (isMetered) {
			console.log(`Usage price`);
		} else {
			const price = item.price.unit_amount! / 100;
			const subInterval = subItemToAutumnInterval(item);
			console.log(
				`${price} ${item.price.currency}${item.quantity !== 1 ? ` x ${item.quantity}` : ""} / ${subInterval?.intervalCount} ${subInterval?.interval}`,
			);
		}
	}
};
