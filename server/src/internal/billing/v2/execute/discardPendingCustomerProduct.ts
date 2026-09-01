import type { FullCusProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { expireCustomerProducts } from "@/internal/billing/v2/execute/expirePendingCustomerProducts";
import { MetadataService } from "@/internal/metadata/MetadataService";

const expireStripeCheckoutSession = async ({
	ctx,
	stripeCheckoutSessionId,
}: {
	ctx: AutumnContext;
	stripeCheckoutSessionId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	try {
		await stripeCli.checkout.sessions.expire(stripeCheckoutSessionId);
	} catch (error) {
		ctx.logger.warn(
			`Failed to expire checkout session ${stripeCheckoutSessionId}: ${error}`,
		);
	}
};

const voidStripeInvoice = async ({
	ctx,
	stripeInvoiceId,
}: {
	ctx: AutumnContext;
	stripeInvoiceId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });

	try {
		const stripeInvoice = await stripeCli.invoices.retrieve(stripeInvoiceId);
		if (stripeInvoice.status !== "open") return;
		await stripeCli.invoices.voidInvoice(stripeInvoiceId);
	} catch (error) {
		ctx.logger.warn(`Failed to void invoice ${stripeInvoiceId}: ${error}`);
	}
};

/** Drops a plan awaiting payment, closing whatever the deferred plan left open
 * so the customer can no longer pay for it. */
export const discardPendingCustomerProduct = async ({
	ctx,
	customerProduct,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
}) => {
	const metadataId = customerProduct.metadata_id;

	if (metadataId) {
		const metadata = await MetadataService.get({ db: ctx.db, id: metadataId });

		if (metadata?.stripe_checkout_session_id) {
			await expireStripeCheckoutSession({
				ctx,
				stripeCheckoutSessionId: metadata.stripe_checkout_session_id,
			});
		}

		if (metadata?.stripe_invoice_id) {
			await voidStripeInvoice({
				ctx,
				stripeInvoiceId: metadata.stripe_invoice_id,
			});
		}

		await MetadataService.delete({ db: ctx.db, id: metadataId });
	}

	await expireCustomerProducts({ ctx, customerProducts: [customerProduct] });
};
