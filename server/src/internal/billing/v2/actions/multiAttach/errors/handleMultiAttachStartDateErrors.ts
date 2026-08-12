import {
	ErrCode,
	isFutureStartDate,
	isOneOffProduct,
	isProductPaidAndRecurring,
	PAST_START_REQUIRES_INVOICE,
	type MultiAttachBillingContext,
	type MultiAttachParamsV0,
	RecaseError,
} from "@autumn/shared";
import { assertNoBackdateWithExistingSubscription } from "@/internal/billing/v2/utils/backdate/assertNoBackdateWithExistingSubscription";
import { assertStripeBackdateInvoiceLineItemLimit } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";

export const handleMultiAttachStartDateErrors = ({
	billingContext,
	params,
}: {
	billingContext: MultiAttachBillingContext;
	params: MultiAttachParamsV0;
}) => {
	if (params.starts_at === undefined) return;

	if (isFutureStartDate(params.starts_at, billingContext.currentEpochMs)) {
		throw new RecaseError({
			message: "Multi-attach starts_at only supports past timestamps.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (
		!billingContext.fullProducts.some(isProductPaidAndRecurring) ||
		billingContext.fullProducts.some((product) => isOneOffProduct({ product }))
	) {
		throw new RecaseError({
			message:
				"Past starts_at requires a paid recurring plan and does not support one-off plans.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	assertNoBackdateWithExistingSubscription({ billingContext });

	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message: "Past starts_at cannot be used together with a free trial.",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	assertStripeBackdateInvoiceLineItemLimit({
		products: billingContext.fullProducts,
		startsAt: params.starts_at,
		currentEpochMs: billingContext.currentEpochMs,
	});
};

export const handleMultiAttachBackdateCheckoutError = ({
	billingContext,
	params,
}: {
	billingContext: MultiAttachBillingContext;
	params: MultiAttachParamsV0;
}) => {
	if (
		params.starts_at === undefined ||
		billingContext.checkoutMode !== "stripe_checkout"
	)
		return;

	throw new RecaseError({
		message: PAST_START_REQUIRES_INVOICE,
		code: ErrCode.InvalidRequest,
		statusCode: 400,
	});
};
