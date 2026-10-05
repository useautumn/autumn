import {
	type BillingBehavior,
	boldText,
	type Feature,
	type FullCusProduct,
	findFeatureById,
	type LineItem,
	notNullish,
	type ProcessorChange,
	type ProcessorItem,
	plainText,
	punctuationText,
	type SetPlansPreviewBalanceChange,
	type SetPlansPreviewPhase,
	type SetPlansPreviewWarning,
	type StripeBillingPlan,
	type StripeSubscriptionScope,
} from "@autumn/shared";
import type Stripe from "stripe";
import { liveSubscriptionChangeWarnings } from "./liveSubscriptionChangeWarnings";
import { otherSubscriptionsWarnings } from "./otherSubscriptionsWarnings";
import {
	type SubscriptionWarningContext,
	subscriptionStateToWarnings,
} from "./subscriptionStateToWarnings";
import { unbilledUsageWarnings } from "./unbilledUsageWarnings";
import { warningText } from "./warningText";

type WarningType = SetPlansPreviewWarning["type"];

const INFO_WARNING_TYPES: WarningType[] = [
	"new_stripe_price_created",
	"proration_disabled",
	"new_stripe_subscription",
	"past_due_invoice_open",
	"other_subscriptions_unaffected",
	"billing_starts_later",
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

const USAGE_RESTARTING_BEHAVIORS: SetPlansPreviewBalanceChange["behavior"][] = [
	"reset",
	"updated",
];

const restartsUsage = (balanceChange: SetPlansPreviewBalanceChange) =>
	USAGE_RESTARTING_BEHAVIORS.includes(balanceChange.behavior) &&
	Number(balanceChange.previous_attributes.usage ?? 0) > 0 &&
	balanceChange.balance.usage === 0;

/** One warning per feature whose usage this request restarts, wherever and however often. */
const requestedResetFeatureIds = (
	balanceChanges: SetPlansPreviewBalanceChange[],
) => [
	...new Set(
		balanceChanges
			.filter(restartsUsage)
			.map((balanceChange) => balanceChange.feature_id),
	),
];

const hasPendingQuantityChange = (customerProduct: FullCusProduct) =>
	customerProduct.options.some((option) =>
		notNullish(option.upcoming_quantity),
	);

export const setPlansPreviewToWarnings = ({
	phases,
	liveProcessorItems,
	processorChanges,
	withdrawnCustomerProducts,
	outgoingCustomerProducts,
	requestedProrationBehavior,
	requestedAnchorResetMs,
	features,
	billingContext,
	stripeBillingPlan,
	replacedOpenInvoices,
	liveOpenInvoices,
	unbilledUsageLineItems = [],
	lineItems = [],
	stripeSubscriptionScope,
}: {
	phases: SetPlansPreviewPhase[];
	liveProcessorItems: ProcessorItem[];
	processorChanges: ProcessorChange[];
	/** Saved scheduled plans the request withdraws; a re-timed or updated plan isn't one. */
	withdrawnCustomerProducts: FullCusProduct[];
	outgoingCustomerProducts: FullCusProduct[];
	requestedProrationBehavior?: BillingBehavior;
	requestedAnchorResetMs: number | undefined;
	features: Feature[];
	billingContext: SubscriptionWarningContext;
	stripeBillingPlan: StripeBillingPlan;
	replacedOpenInvoices: Stripe.Invoice[];
	liveOpenInvoices: Stripe.Invoice[];
	unbilledUsageLineItems?: LineItem[];
	/** The line items the immediate invoice bills. */
	lineItems?: LineItem[];
	stripeSubscriptionScope?: StripeSubscriptionScope;
}): SetPlansPreviewWarning[] => {
	const processorItems = phases.flatMap((phase) => phase.processor_items);
	const balanceChanges = phases.flatMap((phase) => phase.balance_changes);

	const warnings: Omit<SetPlansPreviewWarning, "severity">[] = [
		...subscriptionStateToWarnings({
			billingContext,
			stripeBillingPlan,
			replacedOpenInvoices,
			liveOpenInvoices,
			lineItems,
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
			...warningText([
				boldText(item.display_name),
				plainText("isn't managed by Autumn and will be removed from Stripe."),
			]),
		})),
		...priceCreatingItems(processorItems).map((item) => ({
			type: "new_stripe_price_created" as const,
			...warningText([
				plainText("A new Stripe price will be created for"),
				boldText(item.display_name),
				punctuationText("."),
			]),
		})),
		...requestedResetFeatureIds(balanceChanges).map((featureId) => ({
			type: "usage_reset" as const,
			...warningText([
				plainText("Usage for"),
				boldText(findFeatureById({ features, featureId })?.name ?? featureId),
				plainText("restarts from zero."),
			]),
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
		...withdrawnCustomerProducts.map((customerProduct) => ({
			type: "future_phase_removed" as const,
			...warningText([
				plainText("The scheduled"),
				boldText(customerProduct.product.name),
				plainText("plan will be removed."),
			]),
		})),
		...outgoingCustomerProducts
			.filter(hasPendingQuantityChange)
			.map((customerProduct) => ({
				type: "pending_quantity_change_dropped" as const,
				...warningText([
					plainText("The pending quantity change on"),
					boldText(customerProduct.product.name),
					plainText("won't happen."),
				]),
			})),
		...(requestedProrationBehavior === "none"
			? [
					{
						type: "proration_disabled" as const,
						message: "No prorated charges or credits will be made.",
					},
				]
			: []),
		...otherSubscriptionsWarnings({ stripeSubscriptionScope }),
	];

	return warnings.map((warning) => ({
		...warning,
		severity: INFO_WARNING_TYPES.includes(warning.type) ? "info" : "warning",
	}));
};
