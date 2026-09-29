import type { ProcessorItem } from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";
import { toProcessorItem } from "./toProcessorItem";
import type { ProcessorItemContext } from "./types/processorItemContext";

export const liveItemToProcessorItem = ({
	liveItem,
	quantity = liveItem.quantity,
	context,
}: {
	liveItem: Stripe.SubscriptionItem;
	quantity?: number | null;
	context: ProcessorItemContext;
}): ProcessorItem =>
	toProcessorItem({
		stripePriceId: stripeSubscriptionItemToStripePriceId(liveItem),
		metadata: liveItem.metadata,
		quantity,
		fallbackName: liveItem.price.nickname,
		context,
	});

/** The items the customer's Stripe subscription holds today. */
export const stripeSubscriptionToProcessorItems = ({
	stripeSubscription,
	context,
}: {
	stripeSubscription?: Stripe.Subscription;
	context: ProcessorItemContext;
}): ProcessorItem[] =>
	(stripeSubscription?.items.data ?? []).map((liveItem) =>
		liveItemToProcessorItem({ liveItem, context }),
	);
