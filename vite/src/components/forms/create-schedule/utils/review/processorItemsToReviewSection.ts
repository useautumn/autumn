import type {
	ProcessorChange,
	ProcessorItem,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { uniqBy } from "lodash";
import { formatPhaseDate } from "../schedulePhaseTiming";
import { phaseLabel, phaseSummaryLabel } from "./phaseTiming";
import {
	pricingTableQuantity,
	pricingTableTotal,
	pricingTableUnitPrice,
} from "./processorItemPriceLabels";
import { joinDetail, withoutEmptyPhases } from "./reviewSectionText";
import type {
	ReviewChangePhase,
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewPhaseBadge,
	ReviewStripeId,
} from "./types/reviewChange";

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
}): ReviewChangeRow => ({
	key: `item-${phaseIndex}-${itemIndex}-${item.price_id ?? item.display_name}`,
	title: itemProduct(item),
	description: itemPriceLine(item),
	quantity: pricingTableQuantity(item),
	value: pricingTableTotal(item),
});

const phaseEndLabel = ({
	nextPhase,
	endsAt,
}: {
	nextPhase?: SetPlansPreviewPhase;
	endsAt?: number | null;
}) => {
	if (nextPhase) return formatPhaseDate({ startsAt: nextPhase.starts_at });
	if (endsAt != null) return formatPhaseDate({ startsAt: endsAt });
	return OPEN_ENDED_LABEL;
};

const phaseRange = ({
	phase,
	nextPhase,
	endsAt,
}: {
	phase: SetPlansPreviewPhase;
	nextPhase?: SetPlansPreviewPhase;
	endsAt?: number | null;
}) => {
	const start = formatPhaseDate({ startsAt: phase.starts_at });
	if (phase.ends_subscription) return start;
	return `${start} – ${phaseEndLabel({ nextPhase, endsAt })}`;
};

const phaseBadge = ({
	phase,
	nowMs,
}: {
	phase: SetPlansPreviewPhase;
	nowMs: number;
}): ReviewPhaseBadge => {
	if (phase.ends_subscription) return "canceled";
	const hasStarted = phase.starts_now || phase.starts_at <= nowMs;
	return hasStarted ? "active" : "scheduled";
};

const pluralizeItems = (count: number) =>
	count === 1 ? "1 item" : `${count} items`;

const phaseItemSummary = ({ phase }: { phase: SetPlansPreviewPhase }) => {
	if (phase.ends_subscription) {
		return phase.starts_now
			? CANCELED_LABEL
			: `${CANCELED_LABEL} ${phaseSummaryLabel({ phase })}`;
	}
	return `${pluralizeItems(phase.processor_items.length)} ${phaseSummaryLabel({ phase })}`;
};

const subscriptionEndRow = ({
	phaseIndex,
}: {
	phaseIndex: number;
}): ReviewChangeRow => ({
	key: `subscription-ends-${phaseIndex}`,
	title: "Subscription canceled",
	description: "No items left to bill",
	quantity: "—",
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

/** What Stripe will hold in each phase: the end state, not a diff. */
export const processorItemsToReviewSection = ({
	preview,
	nowMs,
	endsAt,
}: {
	preview: SetPlansPreviewResponse;
	nowMs: number;
	/** The request's end date, which the final phase runs until. */
	endsAt?: number | null;
}): ReviewChangeSection => {
	const phases: ReviewChangePhase[] = preview.phases.map(
		(phase: SetPlansPreviewPhase, phaseIndex: number) => ({
			key: `processor-${phaseIndex}`,
			label: phaseLabel({ phase }),
			range: phaseRange({
				phase,
				nextPhase: preview.phases[phaseIndex + 1],
				endsAt,
			}),
			badge: phaseBadge({ phase, nowMs }),
			rows: phase.ends_subscription
				? [subscriptionEndRow({ phaseIndex })]
				: phase.processor_items.map((item, itemIndex) =>
						processorItemToRow({ item, phaseIndex, itemIndex }),
					),
		}),
	);

	return {
		phases: withoutEmptyPhases(phases),
		summary: preview.phases
			.map((phase: SetPlansPreviewPhase) => phaseItemSummary({ phase }))
			.join(" · "),
		stripeIds: uniqBy(
			[
				...processorStripeIds(preview.processor_changes),
				...priceStripeIds(
					preview.phases.flatMap(
						(phase: SetPlansPreviewPhase) => phase.processor_items,
					),
				),
			],
			"id",
		),
	};
};
