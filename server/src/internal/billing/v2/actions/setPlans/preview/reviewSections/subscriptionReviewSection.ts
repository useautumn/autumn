import type {
	ProcessorChange,
	ProcessorItem,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
	SetPlansReviewPhase,
	SetPlansReviewRow,
	SetPlansReviewSection,
} from "@autumn/shared";
import {
	pricingTableQuantity,
	pricingTableTotal,
	pricingTableUnitPrice,
} from "./processorItemPriceLabels";
import {
	dateText,
	joinDetail,
	phaseLabel,
	phaseSummaryLabel,
	reviewText,
	withoutEmptyPhases,
} from "./reviewText";

type StripeId = NonNullable<SetPlansReviewSection["stripe_ids"]>[number];

const PROCESSOR_TITLE: Record<ProcessorChange["type"], string> = {
	subscription: "Subscription",
	subscription_schedule: "Schedule",
};

const CANCELED_LABEL = "Canceled";
const OPEN_ENDED_LABEL = "Forever";

const itemProduct = (item: ProcessorItem) =>
	(item.managed_by_autumn ? item.feature_name : null) ?? item.display_name;

const itemPriceLine = (item: ProcessorItem) =>
	joinDetail([
		item.price ? pricingTableUnitPrice(item.price) : undefined,
		item.creates_price ? "New price" : undefined,
		item.managed_by_autumn ? undefined : "Not managed by Autumn",
	]);

const processorItemToRow = ({
	item,
	phaseIndex,
	itemIndex,
}: {
	item: ProcessorItem;
	phaseIndex: number;
	itemIndex: number;
}): SetPlansReviewRow => ({
	key: `item-${phaseIndex}-${itemIndex}-${item.price_id ?? item.display_name}`,
	title: itemProduct(item),
	description: itemPriceLine(item),
	quantity: pricingTableQuantity(item),
	value: pricingTableTotal(item),
});

const subscriptionEndRow = (phaseIndex: number): SetPlansReviewRow => ({
	key: `subscription-ends-${phaseIndex}`,
	title: "Subscription canceled",
	description: ["No items left to bill"],
});

const phaseRange = ({
	phase,
	nextPhase,
	endsAt,
}: {
	phase: SetPlansPreviewPhase;
	nextPhase?: SetPlansPreviewPhase;
	endsAt?: number;
}) => {
	const start = dateText(phase.starts_at);
	if (phase.ends_subscription) return start;
	const end = nextPhase?.starts_at ?? endsAt;
	return reviewText(
		start,
		" – ",
		end === undefined ? OPEN_ENDED_LABEL : dateText(end),
	);
};

const phaseBadge = ({
	phase,
	currentEpochMs,
}: {
	phase: SetPlansPreviewPhase;
	currentEpochMs: number;
}): SetPlansReviewPhase["badge"] => {
	if (phase.ends_subscription) return "canceled";
	return phase.starts_now || phase.starts_at <= currentEpochMs
		? "active"
		: "scheduled";
};

const phaseItemSummary = (phase: SetPlansPreviewPhase) => {
	if (phase.ends_subscription) {
		return phase.starts_now
			? [CANCELED_LABEL]
			: reviewText(`${CANCELED_LABEL} `, phaseSummaryLabel(phase));
	}
	const count = phase.processor_items.length;
	return reviewText(
		count === 1 ? "1 item " : `${count} items `,
		phaseSummaryLabel(phase),
	);
};

type ProcessorPreview = Pick<
	SetPlansPreviewResponse,
	"phases" | "processor_changes"
>;

const stripeIds = (preview: ProcessorPreview): StripeId[] => {
	const ids: StripeId[] = [
		...preview.processor_changes.flatMap((change) =>
			change.id
				? [
						{
							key: `processor-${change.type}-${change.id}`,
							label: PROCESSOR_TITLE[change.type],
							id: change.id,
						},
					]
				: [],
		),
		...preview.phases.flatMap((phase) =>
			phase.processor_items.flatMap((item) =>
				item.price_id
					? [
							{
								key: `price-${item.price_id}`,
								label: [item.display_name, item.feature_name]
									.filter(Boolean)
									.join(" · "),
								id: item.price_id,
							},
						]
					: [],
			),
		),
	];
	return ids.filter(
		(stripeId, index) =>
			ids.findIndex(({ id }) => id === stripeId.id) === index,
	);
};

/** What Stripe will hold in each phase: the end state, not a diff. */
export const subscriptionReviewSection = ({
	preview,
	currentEpochMs,
	endsAt,
}: {
	preview: ProcessorPreview;
	currentEpochMs: number;
	/** The request's end date, which the final phase runs until. */
	endsAt?: number;
}): SetPlansReviewSection => ({
	phases: withoutEmptyPhases(
		preview.phases.map((phase, phaseIndex) => ({
			key: `processor-${phaseIndex}`,
			label: phaseLabel(phase),
			range: phaseRange({
				phase,
				nextPhase: preview.phases[phaseIndex + 1],
				endsAt,
			}),
			badge: phaseBadge({ phase, currentEpochMs }),
			rows: phase.ends_subscription
				? [subscriptionEndRow(phaseIndex)]
				: phase.processor_items.map((item, itemIndex) =>
						processorItemToRow({ item, phaseIndex, itemIndex }),
					),
		})),
	),
	summary: joinDetail(preview.phases.map(phaseItemSummary)) ?? [],
	stripe_ids: stripeIds(preview),
});
