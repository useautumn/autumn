import {
	type BillingBehavior,
	type FullCusProduct,
	notNullish,
	type PreviewBalanceChange,
	type ProcessorChange,
	type ProcessorItem,
	type SetPlansPreviewPhase,
	type SetPlansPreviewWarning,
} from "@autumn/shared";

/** Unmanaged live items that the immediate phase's end state no longer holds. */
const removedUnmanagedItems = ({
	liveProcessorItems,
	immediateItems,
}: {
	liveProcessorItems: ProcessorItem[];
	immediateItems: ProcessorItem[];
}) => {
	const keptItemIds = new Set(immediateItems.map((item) => item.item_id));
	return liveProcessorItems.filter(
		(item) => !item.managed_by_autumn && !keptItemIds.has(item.item_id),
	);
};

const priceCreatingItems = (items: ProcessorItem[]) =>
	items
		.filter((item) => item.creates_price)
		.filter(
			(item, index, all) =>
				all.findIndex(
					(other) =>
						(other.price_id ?? other.display_name) ===
						(item.price_id ?? item.display_name),
				) === index,
		);

const resetsUsage = (balanceChange: PreviewBalanceChange) => {
	const previousUsage = balanceChange.previous_attributes.usage;
	return (
		typeof previousUsage === "number" &&
		previousUsage > 0 &&
		balanceChange.balance.usage === 0
	);
};

const SCHEDULE_REPLACING_ACTIONS: ProcessorChange["action"][] = [
	"released",
	"canceled",
];

const replacesExistingSchedule = (processorChanges: ProcessorChange[]) =>
	processorChanges.some(
		(processorChange) =>
			processorChange.type === "subscription_schedule" &&
			SCHEDULE_REPLACING_ACTIONS.includes(processorChange.action),
	);

const hasPendingQuantityChange = (customerProduct: FullCusProduct) =>
	customerProduct.options.some((option) =>
		notNullish(option.upcoming_quantity),
	);

export const setPlansPreviewToWarnings = ({
	phases,
	liveProcessorItems,
	processorChanges,
	deletedCustomerProducts,
	outgoingCustomerProducts,
	requestedProrationBehavior,
}: {
	phases: SetPlansPreviewPhase[];
	liveProcessorItems: ProcessorItem[];
	processorChanges: ProcessorChange[];
	deletedCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
	requestedProrationBehavior?: BillingBehavior;
}): SetPlansPreviewWarning[] => {
	const processorItems = phases.flatMap((phase) => phase.processor_items);
	const balanceChanges = phases.flatMap((phase) => phase.balance_changes);

	return [
		...removedUnmanagedItems({
			liveProcessorItems,
			immediateItems: phases[0]?.processor_items ?? [],
		}).map((item) => ({
			type: "unmanaged_stripe_item_removed" as const,
			message: `${item.display_name} isn't managed by Autumn and will be removed from Stripe.`,
		})),
		...priceCreatingItems(processorItems).map((item) => ({
			type: "new_stripe_price_created" as const,
			message: `A new Stripe price will be created for ${item.display_name}.`,
		})),
		...balanceChanges.filter(resetsUsage).map((balanceChange) => ({
			type: "usage_reset" as const,
			message: `Usage for ${balanceChange.feature_id} restarts from zero.`,
		})),
		...(replacesExistingSchedule(processorChanges)
			? [
					{
						type: "existing_schedule_replaced" as const,
						message:
							"The existing Stripe subscription schedule will be replaced.",
					},
				]
			: []),
		...deletedCustomerProducts.map((customerProduct) => ({
			type: "future_phase_removed" as const,
			message: `The scheduled ${customerProduct.product.name} plan will be removed.`,
		})),
		...outgoingCustomerProducts
			.filter(hasPendingQuantityChange)
			.map((customerProduct) => ({
				type: "pending_quantity_change_dropped" as const,
				message: `The pending quantity change on ${customerProduct.product.name} won't happen.`,
			})),
		...(requestedProrationBehavior === "none"
			? [
					{
						type: "proration_disabled" as const,
						message: "No prorated charges or credits will be made.",
					},
				]
			: []),
	];
};
