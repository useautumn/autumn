import {
	msToSeconds,
	type ProcessorItemChange,
	type StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import type Stripe from "stripe";
import type { SchedulePhasePlan } from "@/internal/billing/v2/actions/createSchedule/compute/computeCreateSchedulePlan";
import { toProcessorItemChange } from "./toProcessorItemChange";
import type { AutumnStripePriceIndex } from "./types/autumnStripePriceIndex";

type SchedulePhaseItem = Stripe.SubscriptionScheduleUpdateParams.Phase.Item;

type SchedulePhase = Stripe.SubscriptionScheduleUpdateParams.Phase;

const schedulePhaseItemKey = (item: SchedulePhaseItem) => {
	if (item.price) return item.price;
	const metadata = item.metadata || undefined;
	const inlineOwner =
		metadata?.autumn_customer_price_id ?? metadata?.autumn_price_id;
	return `inline:${inlineOwner ?? item.price_data?.product}`;
};

const startsBy = ({
	stripePhase,
	startsAt,
}: {
	stripePhase: SchedulePhase;
	startsAt: number;
}) =>
	typeof stripePhase.start_date === "number" &&
	stripePhase.start_date <= msToSeconds(startsAt);

const toScheduleItemChange = ({
	action,
	item,
	previousItem,
	priceIndex,
}: {
	action: ProcessorItemChange["action"];
	item: SchedulePhaseItem;
	previousItem?: SchedulePhaseItem;
	priceIndex: AutumnStripePriceIndex;
}) =>
	toProcessorItemChange({
		action,
		stripePriceId: item.price,
		inlinePrice: item.price_data !== undefined,
		metadata: item.metadata,
		quantity: item.quantity,
		previousQuantity: previousItem
			? (previousItem.quantity ?? null)
			: undefined,
		priceIndex,
	});

const diffSchedulePhaseItems = ({
	previousItems,
	items,
	priceIndex,
}: {
	previousItems: SchedulePhaseItem[];
	items: SchedulePhaseItem[];
	priceIndex: AutumnStripePriceIndex;
}): ProcessorItemChange[] => {
	const previousByKey = new Map(
		previousItems.map((item) => [schedulePhaseItemKey(item), item]),
	);
	const currentKeys = new Set(items.map(schedulePhaseItemKey));

	const createdOrUpdated = items.flatMap((item) => {
		const previousItem = previousByKey.get(schedulePhaseItemKey(item));
		if (!previousItem) {
			return [toScheduleItemChange({ action: "created", item, priceIndex })];
		}
		if (previousItem.quantity === item.quantity) return [];
		return [
			toScheduleItemChange({
				action: "updated",
				item,
				previousItem,
				priceIndex,
			}),
		];
	});

	const deleted = previousItems
		.filter((item) => !currentKeys.has(schedulePhaseItemKey(item)))
		.map((item) =>
			toScheduleItemChange({ action: "deleted", item, priceIndex }),
		);

	return [...createdOrUpdated, ...deleted];
};

const scheduleActionToStripePhases = (
	subscriptionScheduleAction?: StripeSubscriptionScheduleAction,
) => {
	switch (subscriptionScheduleAction?.type) {
		case "create":
		case "update":
			return subscriptionScheduleAction.params.phases ?? [];
		default:
			return [];
	}
};

export const scheduleActionToProcessorItemChanges = ({
	subscriptionScheduleAction,
	phases,
	priceIndex,
}: {
	subscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	phases: SchedulePhasePlan[];
	priceIndex: AutumnStripePriceIndex;
}): ProcessorItemChange[][] => {
	const stripePhases = scheduleActionToStripePhases(subscriptionScheduleAction);
	const stripePhaseIndexAt = (startsAt: number) =>
		stripePhases.filter((stripePhase) => startsBy({ stripePhase, startsAt }))
			.length - 1;

	return phases.slice(1).map((phase, index) => {
		const stripePhaseIndex = stripePhaseIndexAt(phase.startsAt);
		const previousStripePhaseIndex = stripePhaseIndexAt(phases[index].startsAt);
		if (stripePhaseIndex < 0) return [];

		return diffSchedulePhaseItems({
			previousItems: stripePhases[previousStripePhaseIndex]?.items ?? [],
			items: stripePhases[stripePhaseIndex].items,
			priceIndex,
		});
	});
};
