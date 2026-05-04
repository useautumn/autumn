import type {
	AutumnBillingPlan,
	BillingContext,
	FullCusProduct,
	StripeSubscriptionAction,
	StripeSubscriptionScheduleAction,
} from "@autumn/shared";
import type { AutumnContext } from "@server/honoUtils/HonoEnv";
import { buildStripeSubscriptionItemsUpdate } from "@server/internal/billing/v2/providers/stripe/utils/subscriptionItems/buildStripeSubscriptionItemsUpdate";
import { buildStripeSubscriptionCreateAction } from "@server/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionCreateAction";
import { buildStripeSubscriptionUpdateAction } from "@server/internal/billing/v2/providers/stripe/utils/subscriptions/buildStripeSubscriptionUpdateAction";
import { stripePhaseStartsInFuture } from "@server/internal/billing/v2/utils/startDateUtils";
import { billingPlanToOneOffStripeItemSpecs } from "@/internal/billing/v2/providers/stripe/utils/stripeItemSpec/billingPlanToOneOffStripeItemSpecs";

const scheduleStartsInFuture = ({
	billingContext,
	stripeSubscriptionScheduleAction,
}: {
	billingContext: BillingContext;
	stripeSubscriptionScheduleAction?: StripeSubscriptionScheduleAction;
}) => {
	if (stripeSubscriptionScheduleAction?.type !== "create") return false;

	return stripePhaseStartsInFuture(
		stripeSubscriptionScheduleAction.params.phases?.[0]?.start_date,
		billingContext.currentEpochMs,
	);
};

export const buildStripeSubscriptionAction = ({
	ctx,
	billingContext,
	autumnBillingPlan,
	finalCustomerProducts,
	stripeSubscriptionScheduleAction,
	subscriptionCancelAt,
}: {
	ctx: AutumnContext;
	billingContext: BillingContext;
	autumnBillingPlan: AutumnBillingPlan;
	finalCustomerProducts: FullCusProduct[];
	stripeSubscriptionScheduleAction?: StripeSubscriptionScheduleAction;
	subscriptionCancelAt?: number | null;
}): StripeSubscriptionAction | undefined => {
	const { stripeSubscription } = billingContext;

	const subItemsUpdate = buildStripeSubscriptionItemsUpdate({
		ctx,
		billingContext,
		finalCustomerProducts,
	});

	const oneOffItemSpecs = billingPlanToOneOffStripeItemSpecs({
		ctx,
		autumnBillingPlan,
	});

	const addInvoiceItems = oneOffItemSpecs.map((item) => ({
		...(item.stripeInlinePrice
			? { price_data: item.stripeInlinePrice }
			: { price: item.stripePriceId }),
		quantity: item.quantity,
		...(item.metadata && { metadata: item.metadata }),
	}));

	// Case 1: No subscription and sub items update is empty -> no action
	if (!stripeSubscription && subItemsUpdate.length === 0) {
		return undefined;
	}

	const shouldCreateScheduleOnly =
		!stripeSubscription &&
		scheduleStartsInFuture({ billingContext, stripeSubscriptionScheduleAction });

	// Case 2: No subscription and future schedule exists -> schedule creates subscription later
	if (shouldCreateScheduleOnly) {
		return undefined;
	}

	// Case 3: No subscription and sub items update not empty -> create subscription
	if (!stripeSubscription && subItemsUpdate.length > 0) {
		return buildStripeSubscriptionCreateAction({
			ctx,
			billingContext,
			subItemsUpdate,
			addInvoiceItems,
			subscriptionCancelAt: subscriptionCancelAt ?? undefined,
			autumnBillingPlan,
		});
	}

	// Case 4: Cancel subscription
	if (
		stripeSubscription &&
		subItemsUpdate.length === stripeSubscription.items.data.length &&
		subItemsUpdate.every((item) => item.deleted)
	) {
		return {
			type: "cancel" as const,
			stripeSubscriptionId: stripeSubscription.id,
		};
	}

	// Case 5: Update subscription
	if (stripeSubscription) {
		return buildStripeSubscriptionUpdateAction({
			ctx,
			billingContext,
			autumnBillingPlan,
			subItemsUpdate,
			stripeSubscriptionScheduleAction,
			subscriptionCancelAt,
		});
	}

	return undefined;
};
