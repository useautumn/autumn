import type {
	BillingContext,
	BillingPlan,
	StripeDiscountWithCoupon,
} from "@autumn/shared";
import { ErrCode, orgToCurrency, RecaseError } from "@autumn/shared";
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

export const validatePromotionCodeMinimums = ({
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
