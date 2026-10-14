import type { StripeRefundAction } from "@autumn/shared";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv.js";
import { createRefundAndUpdateInvoice } from "@/internal/customers/handlers/handleRefundInvoice/invoiceRefundUtils.js";

export const executeStripeRefundAction = async ({
	ctx,
	refundAction,
}: {
	ctx: AutumnContext;
	refundAction: StripeRefundAction;
}): Promise<Stripe.Refund | undefined> => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	ctx.logger.info(
		`[executeStripeRefundAction] Refunding ${refundAction.amountInCents} cents from charge ${refundAction.chargeId}`,
	);

	return createRefundAndUpdateInvoice({
		stripeCli,
		db: ctx.db,
		chargeId: refundAction.chargeId,
		stripeInvoiceId: refundAction.stripeInvoiceId,
		amountInCents: refundAction.amountInCents,
	});
};
