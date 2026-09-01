import type { FullCusProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

const expireStripeCheckoutSession = async ({
	ctx,
	stripeCheckoutSessionId,
}: {
	ctx: AutumnContext;
	stripeCheckoutSessionId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const session = await stripeCli.checkout.sessions.retrieve(
		stripeCheckoutSessionId,
	);

	if (session.status !== "open") return;

	await stripeCli.checkout.sessions.expire(stripeCheckoutSessionId);
};

const voidStripeInvoice = async ({
	ctx,
	stripeInvoiceId,
}: {
	ctx: AutumnContext;
	stripeInvoiceId: string;
}) => {
	const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
	const stripeInvoice = await stripeCli.invoices.retrieve(stripeInvoiceId);

	if (stripeInvoice.status !== "open") return;

	await stripeCli.invoices.voidInvoice(stripeInvoiceId);
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

	await CusProductService.expireIfPending({
		ctx,
		cusProductId: customerProduct.id,
	});
};
