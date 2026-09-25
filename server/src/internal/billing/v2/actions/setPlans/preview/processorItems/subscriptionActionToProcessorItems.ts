import type { ProcessorItem, StripeSubscriptionAction } from "@autumn/shared";
import type Stripe from "stripe";
import {
	liveItemToProcessorItem,
	stripeSubscriptionToProcessorItems,
} from "./stripeSubscriptionToProcessorItems";
import { toProcessorItem } from "./toProcessorItem";
import type { ProcessorItemContext } from "./types/processorItemContext";

type SubscriptionItemParams =
	| Stripe.SubscriptionCreateParams.Item
	| Stripe.SubscriptionUpdateParams.Item;

const newItemToProcessorItem = ({
	item,
	context,
}: {
	item: SubscriptionItemParams;
	context: ProcessorItemContext;
}): ProcessorItem =>
	toProcessorItem({
		stripePriceId: item.price,
		inlinePriceData: item.price_data,
		metadata: item.metadata,
		quantity: item.quantity,
		context,
	});

const itemParamsId = (item: SubscriptionItemParams) =>
	"id" in item ? item.id : undefined;

const isDeletedItem = (item: SubscriptionItemParams) =>
	"deleted" in item && item.deleted === true;

/** Stripe keeps items an update doesn't mention, so the end state is live items with the update applied. */
const applyUpdateToLiveItems = ({
	liveItems,
	updateItems,
	context,
}: {
	liveItems: Stripe.SubscriptionItem[];
	updateItems: Stripe.SubscriptionUpdateParams.Item[];
	context: ProcessorItemContext;
}): ProcessorItem[] => {
	const updatesById = new Map(
		updateItems.flatMap((item) => {
			const id = itemParamsId(item);
			return id ? [[id, item] as const] : [];
		}),
	);

	const keptLiveItems = liveItems.flatMap((liveItem) => {
		const update = updatesById.get(liveItem.id);
		if (update && isDeletedItem(update)) return [];
		return [
			liveItemToProcessorItem({
				liveItem,
				quantity: update?.quantity ?? liveItem.quantity,
				context,
			}),
		];
	});

	const addedItems = updateItems
		.filter((item) => !itemParamsId(item))
		.map((item) => newItemToProcessorItem({ item, context }));

	return [...keptLiveItems, ...addedItems];
};

/** What the Stripe subscription holds right after the immediate phase applies. */
export const subscriptionActionToProcessorItems = ({
	subscriptionAction,
	stripeSubscription,
	context,
}: {
	subscriptionAction?: StripeSubscriptionAction;
	stripeSubscription?: Stripe.Subscription;
	context: ProcessorItemContext;
}): ProcessorItem[] => {
	switch (subscriptionAction?.type) {
		case "create":
			return (subscriptionAction.params.items ?? []).map((item) =>
				newItemToProcessorItem({ item, context }),
			);
		case "update":
			return applyUpdateToLiveItems({
				liveItems: stripeSubscription?.items.data ?? [],
				updateItems: subscriptionAction.params.items ?? [],
				context,
			});
		case "cancel":
		case "cancel_immediately":
			return [];
		default:
			return stripeSubscriptionToProcessorItems({
				stripeSubscription,
				context,
			});
	}
};
