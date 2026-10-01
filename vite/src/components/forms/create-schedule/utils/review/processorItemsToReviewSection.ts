import type {
	ProcessorChange,
	ProcessorItem,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { groupBy, uniqBy } from "lodash";
import { phaseLabel, phaseSummaryLabel } from "./phaseTiming";
import {
	processorItemValue,
	unitPriceDetail,
} from "./processorItemPriceLabels";
import { joinDetail, withoutEmptyPhases } from "./reviewSectionText";
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

const itemTitle = (item: ProcessorItem) =>
	item.feature_name ??
	(item.managed_by_autumn ? BASE_PRICE_LABEL : item.display_name);

const itemDetail = (item: ProcessorItem) =>
	joinDetail([
		item.feature_id && item.price
			? unitPriceDetail({ price: item.price, quantity: item.quantity })
			: undefined,
		item.creates_price ? "New price" : undefined,
	]);

const processorItemToRow = ({
	item,
	rowKey,
	showsUnmanaged,
}: {
	item: ProcessorItem;
	rowKey: string;
	showsUnmanaged: boolean;
}): ReviewChangeRow => ({
	key: `${rowKey}-${item.price_id ?? item.display_name}`,
	title: itemTitle(item),
	description: itemDetail(item),
	status: showsUnmanaged && !item.managed_by_autumn ? "unmanaged" : undefined,
	value: processorItemValue(item),
});

const processorItemPlanKey = (item: ProcessorItem) =>
	item.plan_id ?? item.display_name;

/** One row per plan, with the Stripe items it bills nested under it. */
const processorItemsToPlanRows = ({
	items,
	phaseIndex,
}: {
	items: ProcessorItem[];
	phaseIndex: number;
}): ReviewChangeRow[] =>
	Object.values(groupBy(items, processorItemPlanKey)).map(
		(planItems, planIndex): ReviewChangeRow => {
			const [firstItem] = planItems;
			const rowKey = `plan-${phaseIndex}-${planIndex}-${processorItemPlanKey(firstItem)}`;
			const isUnmanagedPlan = planItems.every(
				(item) => !item.managed_by_autumn,
			);
			const itemRows = planItems.map((item) =>
				processorItemToRow({
					item,
					rowKey,
					showsUnmanaged: !isUnmanagedPlan,
				}),
			);
			return {
				key: rowKey,
				title: firstItem.display_name,
				status: isUnmanagedPlan ? "unmanaged" : undefined,
				value: itemRows.length === 1 ? itemRows[0].value : undefined,
				items: itemRows,
			};
		},
	);

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

/** What Stripe will hold in each phase: the end state, not a diff. */
export const processorItemsToReviewSection = ({
	preview,
}: {
	preview: SetPlansPreviewResponse;
}): ReviewChangeSection => {
	const phases: ReviewChangePhase[] = preview.phases.map(
		(phase: SetPlansPreviewPhase, phaseIndex: number) => ({
			key: `processor-${phaseIndex}`,
			label: phaseLabel({ phase }),
			rows: phase.ends_subscription
				? [subscriptionEndRow({ phaseIndex })]
				: processorItemsToPlanRows({
						items: phase.processor_items,
						phaseIndex,
					}),
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
