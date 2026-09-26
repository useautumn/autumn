import {
	type BillingBehavior,
	type FullCusProduct,
	notNullish,
	type PreviewBalanceChange,
	type ProcessorChange,
	type ProcessorItemChange,
	type SetPlansPreviewPhase,
	type SetPlansPreviewWarning,
} from "@autumn/shared";

const removesUnmanagedItem = (itemChange: ProcessorItemChange) =>
	itemChange.action === "deleted" && !itemChange.managed_by_autumn;

const resetsUsage = (balanceChange: PreviewBalanceChange) => {
	const previousUsage = balanceChange.previous_attributes.usage;
	return (
		typeof previousUsage === "number" &&
		previousUsage > 0 &&
		balanceChange.balance.usage === 0
	);
};

const replacesExistingSchedule = (processorChanges: ProcessorChange[]) =>
	processorChanges.some(
		(processorChange) =>
			processorChange.type === "subscription_schedule" &&
			processorChange.action !== "created",
	);

const hasPendingQuantityChange = (customerProduct: FullCusProduct) =>
	customerProduct.options.some((option) =>
		notNullish(option.upcoming_quantity),
	);

export const setPlansPreviewToWarnings = ({
	phases,
	processorChanges,
	deletedCustomerProducts,
	outgoingCustomerProducts,
	requestedProrationBehavior,
}: {
	phases: SetPlansPreviewPhase[];
	processorChanges: ProcessorChange[];
	deletedCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
	requestedProrationBehavior?: BillingBehavior;
}): SetPlansPreviewWarning[] => {
	const itemChanges = phases.flatMap((phase) => phase.processor_item_changes);
	const balanceChanges = phases.flatMap((phase) => phase.balance_changes);

	return [
		...itemChanges.filter(removesUnmanagedItem).map((itemChange) => ({
			type: "unmanaged_stripe_item_removed" as const,
			message: `${itemChange.display_name} isn't managed by Autumn and will be removed from Stripe.`,
		})),
		...itemChanges
			.filter((itemChange) => itemChange.creates_price)
			.map((itemChange) => ({
				type: "new_stripe_price_created" as const,
				message: `A new Stripe price will be created for ${itemChange.display_name}.`,
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
