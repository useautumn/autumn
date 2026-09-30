import {
	type BillingBehavior,
	type Feature,
	type FullCusProduct,
	findFeatureById,
	type LineItem,
	notNullish,
	type ProcessorChange,
	type ProcessorItem,
	type SetPlansPreviewPhase,
	type SetPlansPreviewWarning,
	type StripeBillingPlan,
} from "@autumn/shared";
import type Stripe from "stripe";
import { liveSubscriptionChangeWarnings } from "./liveSubscriptionChangeWarnings";
import {
	type SubscriptionWarningContext,
	subscriptionStateToWarnings,
} from "./subscriptionStateToWarnings";
import { unbilledUsageWarnings } from "./unbilledUsageWarnings";

type WarningType = SetPlansPreviewWarning["type"];

const INFO_WARNING_TYPES: WarningType[] = [
	"new_stripe_price_created",
	"proration_disabled",
	"new_stripe_subscription",
	"past_due_invoice_open",
];

/** Unmanaged live items that the immediate phase's end state no longer holds. */
const removedUnmanagedItems = ({
	liveProcessorItems,
	immediateItems,
}: {
	liveProcessorItems: ProcessorItem[];
	immediateItems: ProcessorItem[];
}) => {
	const keptPriceIds = new Set(immediateItems.map((item) => item.price_id));
	return liveProcessorItems.filter(
		(item) => !item.managed_by_autumn && !keptPriceIds.has(item.price_id),
	);
};

const priceCreatingItems = (items: ProcessorItem[]) =>
	items
		.filter((item) => item.creates_price)
		.filter(
			(item, index, all) =>
				all.findIndex(
					(other) =>
						other.plan_id === item.plan_id &&
						other.feature_id === item.feature_id &&
						other.display_name === item.display_name,
				) === index,
		);

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
	requestedAnchorResetMs,
	features,
	billingContext,
	stripeBillingPlan,
	replacedOpenInvoices,
	liveOpenInvoices,
	unbilledUsageLineItems = [],
}: {
	phases: SetPlansPreviewPhase[];
	liveProcessorItems: ProcessorItem[];
	processorChanges: ProcessorChange[];
	deletedCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
	requestedProrationBehavior?: BillingBehavior;
	requestedAnchorResetMs: number | undefined;
	features: Feature[];
	billingContext: SubscriptionWarningContext;
	stripeBillingPlan: StripeBillingPlan;
	replacedOpenInvoices: Stripe.Invoice[];
	liveOpenInvoices: Stripe.Invoice[];
	unbilledUsageLineItems?: LineItem[];
}): SetPlansPreviewWarning[] => {
	const processorItems = phases.flatMap((phase) => phase.processor_items);
	const balanceChanges = phases.flatMap((phase) => phase.balance_changes);

	const warnings: Omit<SetPlansPreviewWarning, "severity">[] = [
		...subscriptionStateToWarnings({
			billingContext,
			stripeBillingPlan,
			replacedOpenInvoices,
			liveOpenInvoices,
		}),
		...liveSubscriptionChangeWarnings({
			stripeSubscription: billingContext.stripeSubscription,
			stripeBillingPlan,
			liveProcessorItems,
			immediateItems: phases[0]?.processor_items ?? [],
			requestedAnchorResetMs,
		}),
		...unbilledUsageWarnings(unbilledUsageLineItems),
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
		...balanceChanges
			.filter((balanceChange) => balanceChange.behavior === "reset")
			.map((balanceChange) => ({
				type: "usage_reset" as const,
				message: `Usage for ${
					findFeatureById({ features, featureId: balanceChange.feature_id })
						?.name ?? balanceChange.feature_id
				} restarts from zero.`,
			})),
		...(replacesExistingSchedule(processorChanges)
			? [
					{
						type: "existing_schedule_replaced" as const,
						message:
							"Edits made directly to the Stripe schedule will be overwritten.",
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

	return warnings.map((warning) => ({
		...warning,
		severity: INFO_WARNING_TYPES.includes(warning.type) ? "info" : "warning",
	}));
};
