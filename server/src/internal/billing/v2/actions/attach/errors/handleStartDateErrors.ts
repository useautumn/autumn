import {
	type AttachBillingContext,
	type AttachParamsV1,
	ErrCode,
	isFutureStartDate,
	isPastStartDate,
	isProductPaidAndRecurring,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import { assertNoBackdateWithExistingSubscription } from "@/internal/billing/v2/utils/backdate/assertNoBackdateWithExistingSubscription";
import { assertStripeBackdateInvoiceLineItemLimit } from "@/internal/billing/v2/utils/backdate/stripeBackdateInvoiceLimit";

export const handleStartDateErrors = ({
	billingContext,
	params,
	preview = false,
}: {
	billingContext: AttachBillingContext;
	params: AttachParamsV1;
	preview?: boolean;
}) => {
	if (params.starts_at === undefined) return;

	if (params.plan_schedule === "end_of_cycle") {
		throw new RecaseError({
			message:
				"starts_at cannot be used together with plan_schedule: end_of_cycle.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	const isPaidRecurring = isProductPaidAndRecurring(
		billingContext.attachProduct,
	);

	if (isPastStartDate(params.starts_at, billingContext.currentEpochMs)) {
		if (!isPaidRecurring) {
			throw new RecaseError({
				message: "Past starts_at is only supported for paid recurring plans.",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		assertNoBackdateWithExistingSubscription({ billingContext });

		// Previews don't know whether the caller will settle via invoice (supports
		// backdating) or Stripe Checkout (doesn't), so only block checkout on execute.
		if (!preview && billingContext.checkoutMode === "stripe_checkout") {
			throw new RecaseError({
				message:
					"Past starts_at cannot be used when Stripe Checkout is required.",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		if (billingContext.trialContext?.trialEndsAt) {
			throw new RecaseError({
				message: "Past starts_at cannot be used together with a free trial.",
				code: ErrCode.InvalidRequest,
				statusCode: StatusCodes.BAD_REQUEST,
			});
		}

		assertStripeBackdateInvoiceLineItemLimit({
			products: [billingContext.attachProduct],
			startsAt: params.starts_at,
			currentEpochMs: billingContext.currentEpochMs,
		});

		return;
	}

	if (!isFutureStartDate(params.starts_at, billingContext.currentEpochMs)) {
		return;
	}

	if (params.invoice_mode?.enabled) {
		throw new RecaseError({
			message: "Future starts_at cannot be used together with invoice mode.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (!isPaidRecurring) {
		throw new RecaseError({
			message: "Future starts_at is only supported for paid recurring plans.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}

	if (billingContext.trialContext?.trialEndsAt) {
		throw new RecaseError({
			message: "Future starts_at cannot be used together with a free trial.",
			code: ErrCode.InvalidRequest,
			statusCode: StatusCodes.BAD_REQUEST,
		});
	}
};
