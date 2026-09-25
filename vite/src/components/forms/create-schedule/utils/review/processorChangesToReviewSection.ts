import type {
	ProcessorChange,
	ProcessorItemChange,
	SetPlansPreviewPhase,
	SetPlansPreviewResponse,
} from "@autumn/shared";
import { futurePhasePrefix, joinDetail, summarizeCounts } from "./phaseTiming";
import type {
	ReviewChangeRow,
	ReviewChangeSection,
	ReviewChangeTone,
} from "./types/reviewChange";

type ItemAction = ProcessorItemChange["action"];

const ITEM_ACTION_ORDER: ItemAction[] = ["created", "deleted", "updated"];

const ITEM_TONE: Record<ItemAction, ReviewChangeTone> = {
	created: "new",
	deleted: "ending",
	updated: "changed",
};

const ITEM_LABEL: Record<ItemAction, string> = {
	created: "Added",
	deleted: "Removed",
	updated: "Updated",
};

const PROCESSOR_TITLE: Record<ProcessorChange["type"], string> = {
	subscription: "Subscription",
	subscription_schedule: "Schedule",
};

const capitalize = (value: string) =>
	value.charAt(0).toUpperCase() + value.slice(1);

const itemQuantityLabel = (itemChange: ProcessorItemChange) => {
	const previousQuantity = itemChange.previous_attributes?.quantity;
	if (itemChange.quantity === null) return undefined;
	if (previousQuantity != null && previousQuantity !== itemChange.quantity) {
		return `× ${previousQuantity} → ${itemChange.quantity}`;
	}
	return `× ${itemChange.quantity}`;
};

const processorChangeToRow = (
	processorChange: ProcessorChange,
): ReviewChangeRow => ({
	key: `processor-${processorChange.type}-${processorChange.action}-${processorChange.id ?? "new"}`,
	icon: processorChange.type === "subscription" ? "subscription" : "schedule",
	title: PROCESSOR_TITLE[processorChange.type],
	code: processorChange.id ?? undefined,
	tone: "processor",
	label: capitalize(processorChange.action),
	value: processorChange.phase_count
		? `${processorChange.phase_count} phases`
		: undefined,
});

const itemChangeToRow = ({
	itemChange,
	phaseIndex,
	startsAt,
	itemIndex,
}: {
	itemChange: ProcessorItemChange;
	phaseIndex: number;
	startsAt: number;
	itemIndex: number;
}): ReviewChangeRow => ({
	key: `item-${phaseIndex}-${itemIndex}-${itemChange.item_id ?? itemChange.price_id ?? ""}`,
	icon: "item",
	title: itemChange.display_name,
	detail: joinDetail([
		futurePhasePrefix({ phaseIndex, startsAt }),
		itemChange.managed_by_autumn ? undefined : "Not in Autumn",
		itemChange.creates_price ? "New price" : undefined,
	]),
	code: itemChange.price_id ?? undefined,
	tone: ITEM_TONE[itemChange.action],
	label: ITEM_LABEL[itemChange.action],
	value: itemQuantityLabel(itemChange),
	isEnding: itemChange.action === "deleted",
});

export const processorChangesToReviewSection = ({
	preview,
}: {
	preview: SetPlansPreviewResponse;
}): ReviewChangeSection => {
	const itemChanges: {
		itemChange: ProcessorItemChange;
		row: ReviewChangeRow;
	}[] = preview.phases.flatMap(
		(phase: SetPlansPreviewPhase, phaseIndex: number) =>
			phase.processor_item_changes.map(
				(itemChange: ProcessorItemChange, itemIndex: number) => ({
					itemChange,
					row: itemChangeToRow({
						itemChange,
						phaseIndex,
						startsAt: phase.starts_at,
						itemIndex,
					}),
				}),
			),
	);

	return {
		rows: [
			...preview.processor_changes.map(processorChangeToRow),
			...itemChanges.map(({ row }) => row),
		],
		summary: summarizeCounts({
			counts: ITEM_ACTION_ORDER.map((action) => [
				ITEM_LABEL[action].toLowerCase(),
				itemChanges.filter(({ itemChange }) => itemChange.action === action)
					.length,
			]),
			emptyLabel: preview.processor_changes
				.map(
					(change: ProcessorChange) =>
						`${PROCESSOR_TITLE[change.type]} ${change.action}`,
				)
				.join(" · "),
		}),
	};
};
