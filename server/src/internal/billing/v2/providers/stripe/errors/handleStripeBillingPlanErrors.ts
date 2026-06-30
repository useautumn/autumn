import type {
	BillingContext,
	BillingPlan,
	StripeDiscountWithCoupon,
	UpdateSubscriptionBillingContext,
} from "@autumn/shared";
import {
	ErrCode,
	InternalError,
	orgToCurrency,
	RecaseError,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { willStripeSubscriptionUpdateCreateInvoice } from "@/internal/billing/v2/providers/stripe/utils/subscriptions/willStripeSubscriptionUpdateCreateInvoice";

const getPromotionCodeMinimumAmount = ({
	discount,
	currency,
}: {
	discount: StripeDiscountWithCoupon;
	currency: string;
}) => {
	if (!discount.promotionCodeId) return;
	const normalizedCurrency = currency.toLowerCase();

	if (discount.minimumAmount != null) {
		if (!discount.minimumAmountCurrency) return discount.minimumAmount;
		if (discount.minimumAmountCurrency.toLowerCase() === normalizedCurrency) {
			return discount.minimumAmount;
		}
	}

	return discount.minimumAmountsByCurrency?.[normalizedCurrency];
};

const validatePromotionCodeMinimums = ({
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
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

	const currency =
		billingContext.stripeCustomer?.currency ?? orgToCurrency({ org: ctx.org });
	const restrictedDiscount = billingContext.stripeDiscounts?.find(
		(discount) =>
			!discount.id &&
			discount.promotionCodeId &&
			(getPromotionCodeMinimumAmount({ discount, currency }) ?? 0) > 0,
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
	ctx,
	billingContext,
	billingPlan,
}: {
	ctx: AutumnContext;
	billingContext: UpdateSubscriptionBillingContext;
	billingPlan: BillingPlan;
}) => {
	const { stripeSubscriptionSchedule } = billingContext;
	const { subscriptionScheduleAction } = billingPlan.stripe;

	validatePromotionCodeMinimums({ ctx, billingContext, billingPlan });

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
