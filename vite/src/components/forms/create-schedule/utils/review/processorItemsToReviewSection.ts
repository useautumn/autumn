import type {
	ProcessorChange,
	ProcessorItem,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import {
	isImmediatePhase,
	joinDetail,
	phaseLabel,
	phaseSummaryLabel,
	startsNow,
	withoutEmptyPhases,
} from "./phaseTiming";
import {
	processorItemsTotal,
	processorItemValue,
	unitPriceDetail,
} from "./processorItemPriceLabels";
import type {
	ReviewChangePhase,
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewStripeId,
} from "./types/reviewChange";

const PROCESSOR_TITLE: Record<ProcessorChange["type"], string> = {
	subscription: "Subscription",
	subscription_schedule: "Schedule",
};

const BASE_PRICE_LABEL = "Base price";
const CANCELED_LABEL = "Canceled";

const itemDescription = (item: ProcessorItem) =>
	joinDetail([
		item.feature_name ??
			(item.managed_by_autumn ? BASE_PRICE_LABEL : undefined),
		item.feature_id && item.price
			? unitPriceDetail({ price: item.price, quantity: item.quantity })
			: undefined,
		item.creates_price ? "New price" : undefined,
	]);

const processorItemToRow = ({
	item,
	phaseIndex,
	itemIndex,
}: {
	item: ProcessorItem;
	phaseIndex: number;
	itemIndex: number;
}): ReviewChangeRow => ({
	key: `item-${phaseIndex}-${itemIndex}-${item.price_id ?? item.display_name}`,
	title: item.display_name,
	description: itemDescription(item),
	status: item.managed_by_autumn ? undefined : "unmanaged",
	value: processorItemValue(item),
});

const pluralizeItems = (count: number) =>
	count === 1 ? "1 item" : `${count} items`;

const phaseItemSummary = ({
	phase,
	phaseIndex,
	endsSubscription,
	nowMs,
}: {
	phase: SetPlansPreviewPhase;
	phaseIndex: number;
	endsSubscription: boolean;
	nowMs: number;
}) => {
	const timing = { phaseIndex, startsAt: phase.starts_at, nowMs };
	if (endsSubscription) {
		return startsNow(timing)
			? CANCELED_LABEL
			: `${CANCELED_LABEL} ${phaseSummaryLabel(timing)}`;
	}
	const count = phase.processor_items.length;
	return startsNow(timing)
		? `${pluralizeItems(count)} now`
		: `${count} ${phaseSummaryLabel(timing)}`;
};

/** A phase that leaves Stripe billing nothing after a canceled subscription or items before it. */
const phaseEndsSubscription = ({
	preview,
	phaseIndex,
}: {
	preview: SetPlansPreviewResponse;
	phaseIndex: number;
}) => {
	if (preview.phases[phaseIndex]?.processor_items.length !== 0) return false;
	if (isImmediatePhase({ phaseIndex })) {
		return preview.processor_changes.some(
			(processorChange: ProcessorChange) =>
				processorChange.action === "canceled",
		);
	}
	return (preview.phases[phaseIndex - 1]?.processor_items.length ?? 0) > 0;
};

const subscriptionEndRow = ({
	phaseIndex,
}: {
	phaseIndex: number;
}): ReviewChangeRow => ({
	key: `subscription-ends-${phaseIndex}`,
	title: PROCESSOR_TITLE.subscription,
	description: "No items left to bill",
	status: "ends",
});

const processorStripeIds = (
	processorChanges: ProcessorChange[],
): ReviewStripeId[] =>
	processorChanges.flatMap((processorChange) =>
		processorChange.id
			? [
					{
						key: `processor-${processorChange.type}-${processorChange.id}`,
						label: PROCESSOR_TITLE[processorChange.type],
						id: processorChange.id,
					},
				]
			: [],
	);

const priceStripeIds = (items: ProcessorItem[]): ReviewStripeId[] =>
	items.flatMap((item) =>
		item.price_id
			? [
					{
						key: `price-${item.price_id}`,
						label:
							joinDetail([item.display_name, item.feature_name ?? undefined]) ??
							"",
						id: item.price_id,
					},
				]
			: [],
	);

const uniqueStripeIds = (stripeIds: ReviewStripeId[]) =>
	stripeIds.filter(
		(stripeId, index) =>
			stripeIds.findIndex((other) => other.id === stripeId.id) === index,
	);

type ProcessorPhase = {
	reviewPhase: ReviewChangePhase;
	summary: string;
};

/** What Stripe will hold in each phase: the end state, not a diff. */
export const processorItemsToReviewSection = ({
	preview,
	nowMs,
}: {
	preview: SetPlansPreviewResponse;
	nowMs: number;
}): ReviewChangeSection => {
	const phases: ProcessorPhase[] = preview.phases.map(
		(phase: SetPlansPreviewPhase, phaseIndex: number) => {
			const endsSubscription = phaseEndsSubscription({ preview, phaseIndex });
			const reviewPhase: ReviewChangePhase = {
				key: `processor-${phaseIndex}`,
				label: phaseLabel({ phaseIndex, startsAt: phase.starts_at, nowMs }),
				total: processorItemsTotal(phase.processor_items),
				rows: endsSubscription
					? [subscriptionEndRow({ phaseIndex })]
					: phase.processor_items.map(
							(item: ProcessorItem, itemIndex: number) =>
								processorItemToRow({ item, phaseIndex, itemIndex }),
						),
			};
			return {
				reviewPhase,
				summary: phaseItemSummary({
					phase,
					phaseIndex,
					endsSubscription,
					nowMs,
				}),
			};
		},
	);

	return {
		phases: withoutEmptyPhases(phases.map(({ reviewPhase }) => reviewPhase)),
		summary: phases.map(({ summary }) => summary).join(" · "),
		stripeIds: uniqueStripeIds([
			...processorStripeIds(preview.processor_changes),
			...priceStripeIds(
				preview.phases.flatMap(
					(phase: SetPlansPreviewPhase) => phase.processor_items,
				),
			),
		]),
	};
};
