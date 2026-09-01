import type { FullCusProduct } from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { expireStripeCheckoutSession } from "@/external/stripe/checkoutSessions/operations/expireStripeCheckoutSession";
import { voidStripeInvoiceIfOpen } from "@/external/stripe/invoices/operations/voidStripeInvoiceIfOpen";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

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
				checkoutSessionId: metadata.stripe_checkout_session_id,
			});
		}

		if (metadata?.stripe_invoice_id) {
			const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
			const stripeInvoice = await stripeCli.invoices.retrieve(
				metadata.stripe_invoice_id,
			);

			await voidStripeInvoiceIfOpen({ ctx, stripeInvoice });
		}

		await MetadataService.delete({ db: ctx.db, id: metadataId });
	}

	await CusProductService.expireIfPending({
		ctx,
		cusProductId: customerProduct.id,
	});
};
