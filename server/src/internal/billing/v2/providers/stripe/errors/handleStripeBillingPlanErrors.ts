import type { BillingContext, BillingPlan } from "@autumn/shared";
import { ErrCode, InternalError, RecaseError } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { validatePromotionCodeMinimums } from "@/internal/billing/v2/providers/stripe/errors/validatePromotionCodeMinimums";
import { discountAppliesToLineItem } from "@/internal/billing/v2/providers/stripe/utils/discounts/discountAppliesToLineItem";

const validatePromotionCodeProducts = ({
	billingContext,
	billingPlan,
}: {
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	const lineItems = billingPlan.autumn.lineItems ?? [];
	if (lineItems.length === 0) return;

	const invalidPromotionCode = billingContext.stripeDiscounts?.find(
		(discount) =>
			!discount.id &&
			discount.promotionCodeId &&
			discount.source.coupon.applies_to?.products?.length &&
			!lineItems.some((lineItem) =>
				discountAppliesToLineItem({ discount, lineItem }),
			),
	);
	if (!invalidPromotionCode) return;

	throw new RecaseError({
		message: "Promotion code does not apply to any products in this order.",
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
	billingContext: BillingContext;
	billingPlan: BillingPlan;
}) => {
	const { stripeSubscriptionSchedule } = billingContext;
	const { subscriptionScheduleAction } = billingPlan.stripe;

	validatePromotionCodeProducts({ billingContext, billingPlan });
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
