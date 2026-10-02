import {
	ErrCode,
	type FullCusProduct,
	type FullCustomer,
	isCustomerProductPaidRecurring,
} from "@autumn/shared";
import Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getCusPaymentMethod } from "@/external/stripe/stripeCusUtils";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { billingActions } from "@/internal/billing/v2/actions";
import { isCustomerProductAutumnManagedTrial } from "@/internal/billing/v2/setup/trialContext/isCustomerProductAutumnManagedTrial";

/** billed: now on a Stripe sub. unbillable: expire the trial. retry: leave it for the next cron tick. */
export type ExpiredTrialConversion = "billed" | "unbillable" | "retry";

const PAYMENT_FAILURE_CODES = new Set<string>([
	ErrCode.StripeCardDeclined,
	ErrCode.PayInvoiceFailed,
	"card_declined",
]);

const isPaymentFailure = (error: unknown) =>
	error instanceof Stripe.errors.StripeCardError ||
	PAYMENT_FAILURE_CODES.has((error as { code?: string })?.code ?? "");

const isBillableTrial = (customerProduct: FullCusProduct) =>
	!customerProduct.canceled &&
	isCustomerProductAutumnManagedTrial(customerProduct) &&
	isCustomerProductPaidRecurring(customerProduct);

const customerHasPaymentMethod = async ({
	ctx,
	fullCustomer,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
}) => {
	const paymentMethod = await getCusPaymentMethod({
		stripeCli: createStripeCli({ org: ctx.org, env: ctx.env }),
		stripeId: fullCustomer.processor?.id,
	});
	return Boolean(paymentMethod);
};

const customerProductToEntityId = ({
	fullCustomer,
	customerProduct,
}: {
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}) => {
	const entity = fullCustomer.entities?.find(
		(candidate) => candidate.internal_id === customerProduct.internal_entity_id,
	);
	return entity ? (entity.id ?? entity.internal_id) : undefined;
};

const billExpiredTrial = async ({
	ctx,
	fullCustomer,
	customerProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): Promise<ExpiredTrialConversion> => {
	const { billingResult } = await billingActions.updateSubscription({
		ctx,
		params: {
			customer_id: fullCustomer.id || fullCustomer.internal_id,
			customer_product_id: customerProduct.id,
			entity_id: customerProductToEntityId({ fullCustomer, customerProduct }),
			version: customerProduct.product.version,
			redirect_mode: "if_required",
		},
		contextOverride: {
			paymentBehaviorIntent: "error_if_incomplete",
			billingUpdatedTags: ["trial_ended"],
		},
		options: { skipAutumnCheckout: true },
	});

	// Billed only when a live subscription came back, not a deferred plan awaiting a failed payment.
	const isBilled =
		billingResult?.stripe.stripeSubscription !== undefined &&
		!billingResult.stripe.deferred;
	return isBilled ? "billed" : "unbillable";
};

/** Bills a lapsed Autumn-managed no-card trial into Stripe when the customer has a card on file. */
export const tryConvertExpiredTrial = async ({
	ctx,
	fullCustomer,
	customerProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	customerProduct: FullCusProduct;
}): Promise<ExpiredTrialConversion> => {
	if (!isBillableTrial(customerProduct)) return "unbillable";

	try {
		if (!(await customerHasPaymentMethod({ ctx, fullCustomer })))
			return "unbillable";

		return await billExpiredTrial({ ctx, fullCustomer, customerProduct });
	} catch (error) {
		if (isPaymentFailure(error)) {
			ctx.logger.warn(
				`[productCron] payment failed for trial ${customerProduct.id}, expiring it`,
				{ error },
			);
			return "unbillable";
		}

		ctx.logger.error(
			`[productCron] could not bill trial ${customerProduct.id}, retrying next run`,
			{ error },
		);
		return "retry";
	}
};
