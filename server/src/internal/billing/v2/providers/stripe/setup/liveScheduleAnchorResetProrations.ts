import {
	type BillingContext,
	CusProductStatus,
	type FullCusProduct,
	isCustomerProductOnStripeSubscription,
	isCustomerProductOnStripeSubscriptionSchedule,
	type PhaseProrationBehavior,
	secondsToMs,
	truncateMsToSecondPrecision,
} from "@autumn/shared";
import type Stripe from "stripe";
import { isSetPlansBillingContext } from "@/internal/billing/v2/actions/setPlans/utils/persistDeferredSetPlansSchedule";
import type { SchedulePhaseProration } from "./resolveSchedulePhaseProrations";

/** Only the values Autumn writes on a reset phase; Stripe's create_prorations default names none. */
const STRIPE_RESET_PRORATION_BEHAVIORS: Partial<
	Record<
		Stripe.SubscriptionSchedule.Phase.ProrationBehavior,
		PhaseProrationBehavior
	>
> = {
	always_invoice: "prorate_immediately",
	none: "none",
};

/** A scheduled plan change's own proration decides resets at its start, not the live schedule's. */
const planChangeStarts = ({
	billingContext,
	stripeSubscriptionSchedule,
}: {
	billingContext: BillingContext;
	stripeSubscriptionSchedule: Stripe.SubscriptionSchedule;
}) => {
	const stripeSubscriptionId = billingContext.stripeSubscription?.id;
	const isOnThisSchedule = (customerProduct: FullCusProduct) =>
		isCustomerProductOnStripeSubscriptionSchedule({
			customerProduct,
			stripeSubscriptionScheduleId: stripeSubscriptionSchedule.id,
		}) ||
		(stripeSubscriptionId !== undefined &&
			isCustomerProductOnStripeSubscription({
				customerProduct,
				stripeSubscriptionId,
			}) === true);

	return new Set(
		[
			...billingContext.fullCustomer.customer_products
				.filter(
					(customerProduct) =>
						customerProduct.status === CusProductStatus.Scheduled &&
						isOnThisSchedule(customerProduct),
				)
				.map(({ starts_at }) => starts_at),
			...(isSetPlansBillingContext(billingContext)
				? billingContext.scheduledPhaseContexts.map(({ startsAt }) => startsAt)
				: []),
		].map(truncateMsToSecondPrecision),
	);
};

/** Keeps a pending reset's proration through a schedule rebuild, whichever action scheduled it. */
export const liveScheduleAnchorResetProrations = ({
	billingContext,
}: {
	billingContext: BillingContext;
}): SchedulePhaseProration[] => {
	const { stripeSubscriptionSchedule, currentEpochMs } = billingContext;
	if (!stripeSubscriptionSchedule) return [];

	const excludedStarts = planChangeStarts({
		billingContext,
		stripeSubscriptionSchedule,
	});
	return stripeSubscriptionSchedule.phases.flatMap((phase) => {
		const startsAt = secondsToMs(phase.start_date);
		const isPendingAnchorReset =
			phase.billing_cycle_anchor === "phase_start" &&
			startsAt > currentEpochMs &&
			!excludedStarts.has(startsAt);
		const prorationBehavior =
			STRIPE_RESET_PRORATION_BEHAVIORS[phase.proration_behavior];
		return isPendingAnchorReset && prorationBehavior
			? [{ startsAt, prorationBehavior }]
			: [];
	});
};
