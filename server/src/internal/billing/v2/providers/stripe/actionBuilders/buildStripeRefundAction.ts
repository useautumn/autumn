import type { AutumnBillingPlan, StripeRefundAction } from "@autumn/shared";
import { atmnToStripeAmount, ErrCode, RecaseError } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { resolveChargeFromInvoice } from "@/internal/customers/handlers/handleRefundInvoice/invoiceRefundUtils.js";

/**
 * Build a Stripe refund action from the computed refund plan.
 * Retrieves the invoice/charge, validates refundability, and computes the
 * final cents amount so execute only needs to issue the refund.
 */
export const buildStripeRefundAction = async ({
	ctx,
	autumnBillingPlan,
}: {
	ctx: AutumnContext;
	autumnBillingPlan: AutumnBillingPlan;
}): Promise<StripeRefundAction | undefined> => {
	const { refundPlan } = autumnBillingPlan;
	if (!refundPlan) return undefined;
	if (refundPlan.amount <= 0) return undefined;

	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	const stripeInvoice = await stripeCli.invoices.retrieve(
		refundPlan.invoice.stripe_id,
		{ expand: ["payments.data.payment.payment_intent"] },
	);

	const charge = await resolveChargeFromInvoice({ stripeCli, stripeInvoice });

	if (!charge) {
		throw new RecaseError({
			message: "Could not resolve a charge from the invoice to refund",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	if (!charge.paid || charge.status !== "succeeded") {
		throw new RecaseError({
			message: "This charge is not eligible for a refund",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	const refundableAmountInCents = charge.amount - charge.amount_refunded;
	if (refundableAmountInCents <= 0) return undefined;

	const amountInCents = Math.min(
		atmnToStripeAmount({
			amount: refundPlan.amount,
			currency: refundPlan.invoice.currency,
		}),
		refundableAmountInCents,
	);

	if (amountInCents <= 0) return undefined;

	return {
		type: "refund_last_invoice",
		stripeInvoiceId: refundPlan.invoice.stripe_id,
		chargeId: charge.id,
		amountInCents,
	};
};
