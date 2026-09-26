import type {
	ProcessorItemChange,
	StripeSubscriptionAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import { stripeSubscriptionItemToStripePriceId } from "@/external/stripe/subscriptions/subscriptionItems/utils/convertStripeSubscriptionItemUtils";
import { toProcessorItemChange } from "./toProcessorItemChange";
import type { AutumnStripePriceIndex } from "./types/autumnStripePriceIndex";

type SubscriptionItemParams =
	| Stripe.SubscriptionCreateParams.Item
	| Stripe.SubscriptionUpdateParams.Item;

const liveItemToDeletedChange = ({
	liveItem,
	priceIndex,
}: {
	liveItem: Stripe.SubscriptionItem;
	priceIndex: AutumnStripePriceIndex;
}): ProcessorItemChange =>
	toProcessorItemChange({
		action: "deleted",
		itemId: liveItem.id,
		stripePriceId: stripeSubscriptionItemToStripePriceId(liveItem),
		metadata: liveItem.metadata,
		quantity: liveItem.quantity,
		fallbackName: liveItem.price.nickname,
		priceIndex,
	});

const itemParamsToProcessorItemChange = ({
	item,
	liveItemsById,
	priceIndex,
}: {
	item: SubscriptionItemParams;
	liveItemsById: Map<string, Stripe.SubscriptionItem>;
	priceIndex: AutumnStripePriceIndex;
}): ProcessorItemChange | undefined => {
	const liveItem =
		"id" in item && item.id ? liveItemsById.get(item.id) : undefined;

	if (!liveItem) {
		return toProcessorItemChange({
			action: "created",
			stripePriceId: item.price,
			inlinePrice: item.price_data !== undefined,
			metadata: item.metadata,
			quantity: item.quantity,
			priceIndex,
		});
	}

	if ("deleted" in item && item.deleted) {
		return liveItemToDeletedChange({ liveItem, priceIndex });
	}

	const quantityChanged =
		item.quantity !== undefined && item.quantity !== liveItem.quantity;
	if (!quantityChanged) return undefined;

	return toProcessorItemChange({
		action: "updated",
		itemId: liveItem.id,
		stripePriceId: stripeSubscriptionItemToStripePriceId(liveItem),
		metadata: liveItem.metadata,
		quantity: item.quantity,
		previousQuantity: liveItem.quantity ?? null,
		fallbackName: liveItem.price.nickname,
		priceIndex,
	});
};

export const subscriptionActionToProcessorItemChanges = ({
	subscriptionAction,
	stripeSubscription,
	priceIndex,
}: {
	subscriptionAction?: StripeSubscriptionAction;
	stripeSubscription?: Stripe.Subscription;
	priceIndex: AutumnStripePriceIndex;
}): ProcessorItemChange[] => {
	const liveItems = stripeSubscription?.items.data ?? [];

	switch (subscriptionAction?.type) {
		case "create":
		case "update": {
			const liveItemsById = new Map(liveItems.map((item) => [item.id, item]));
			return (subscriptionAction.params.items ?? []).flatMap((item) => {
				const change = itemParamsToProcessorItemChange({
					item,
					liveItemsById,
					priceIndex,
				});
				return change ? [change] : [];
			});
		}
		case "cancel":
		case "cancel_immediately":
			return liveItems.map((liveItem) =>
				liveItemToDeletedChange({ liveItem, priceIndex }),
			);
		default:
			return [];
	}
};
