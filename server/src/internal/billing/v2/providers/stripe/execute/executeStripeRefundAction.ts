import type { StripeRefundAction } from "@autumn/shared";
import { applyProration, ErrCode, RecaseError } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import {
	createRefundAndUpdateInvoice,
	resolveChargeFromInvoice,
	validateChargeRefundable,
} from "@/internal/customers/handlers/handleRefundInvoice/invoiceRefundUtils.js";

/** Execute a refund against the latest invoice of a cancelled subscription */
export const executeStripeRefundAction = async ({
	ctx,
	refundAction,
	stripeSubscription,
	currentEpochMs,
}: {
	ctx: AutumnContext;
	refundAction: StripeRefundAction;
	stripeSubscription: Stripe.Subscription;
	currentEpochMs: number;
}): Promise<Stripe.Refund> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	// 1. Get the latest invoice ID from the subscription
	const latestInvoiceId =
		typeof stripeSubscription.latest_invoice === "string"
			? stripeSubscription.latest_invoice
			: stripeSubscription.latest_invoice?.id;

	if (!latestInvoiceId) {
		throw new RecaseError({
			message: "Cancelled subscription has no latest invoice to refund",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// 2. Retrieve the invoice with payments expanded
	const stripeInvoice = await stripeCli.invoices.retrieve(latestInvoiceId, {
		expand: ["payments.data.payment.payment_intent"],
	});

	// 3. Resolve the charge
	const charge = await resolveChargeFromInvoice({ stripeCli, stripeInvoice });

	if (!charge) {
		throw new RecaseError({
			message:
				"Could not resolve a charge from the subscription's latest invoice",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// 4. Validate the charge is refundable
	const refundableAmountInCents = validateChargeRefundable({ charge });

	// 5. Calculate the refund amount
	let refundAmountInCents: number;

	if (refundAction.mode === "full") {
		refundAmountInCents = refundableAmountInCents;
	} else {
		// Prorated: refund the unused portion of the billing period
		const proratedFraction = applyProration({
			now: currentEpochMs,
			billingPeriod: refundAction.billingPeriod,
			amount: 1,
		});

		refundAmountInCents = Math.round(
			refundableAmountInCents * proratedFraction,
		);

		// Ensure we don't exceed the refundable amount
		refundAmountInCents = Math.min(
			refundAmountInCents,
			refundableAmountInCents,
		);
	}

	if (refundAmountInCents <= 0) {
		ctx.logger.info(
			"[executeStripeRefundAction] Prorated refund amount is 0, skipping refund",
		);
		throw new RecaseError({
			message: "Prorated refund amount is $0, no refund to issue",
			code: ErrCode.InvalidRequest,
			statusCode: 400,
		});
	}

	// 6. Issue the refund and update the DB
	ctx.logger.info(
		`[executeStripeRefundAction] Refunding ${refundAmountInCents} cents (mode: ${refundAction.mode}) from charge ${charge.id}`,
	);

	return createRefundAndUpdateInvoice({
		stripeCli,
		db: ctx.db,
		chargeId: charge.id,
		stripeInvoiceId: latestInvoiceId,
		amountInCents: refundAmountInCents,
	});
};
