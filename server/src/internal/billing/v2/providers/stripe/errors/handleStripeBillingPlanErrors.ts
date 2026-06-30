import type {
	BillingContext,
	BillingPlan,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import { ErrCode, InternalError, RecaseError } from "@autumn/shared";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

const validatePromotionCodeMinimums = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	const stripeSubscriptionAction = billingPlan.stripe.subscriptionAction;
	if (stripeSubscriptionAction?.type !== "update") return;
	if (
		willStripeSubscriptionUpdateCreateInvoice({
			billingContext,
			stripeSubscriptionAction,
		})
	) {
		return;
	}

	const restrictedDiscount = billingContext.stripeDiscounts?.find(
		(discount) =>
			!discount.id &&
			discount.promotionCodeId &&
			(discount.minimumAmount ?? 0) > 0,
	);
	if (!restrictedDiscount) return;

	throw new RecaseError({
		message:
			"Promotion code minimum amount cannot be satisfied by this subscription update.",
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};

/**
 * Validates Stripe-specific billing context requirements before executing billing plan.
 * These checks ensure the Stripe resources are in a valid state for the operations we need to perform.
 */
export const handleStripeBillingPlanErrors = ({
	billingContext,
	billingPlan,
}: {
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}) => {
	const { stripeSubscriptionSchedule } = billingContext;
	const { subscriptionScheduleAction } = billingPlan.stripe;

	validatePromotionCodeMinimums({ billingContext, billingPlan });

	if (subscriptionScheduleAction?.type !== "update") return;
	if (!stripeSubscriptionSchedule?.subscription) return;

	const currentPhaseStart =
		stripeSubscriptionSchedule.current_phase?.start_date;
	if (!currentPhaseStart) {
		throw new InternalError({
			message:
				"Cannot update subscription schedule: missing current phase start_date",
			code: ErrCode.InternalError,
		});
	}
};
