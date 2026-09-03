import type {
	DeferredAutumnBillingPlanData,
	FullCusProduct,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { checkoutSessionLock } from "@/external/redis/actions/checkoutSessionLock/checkoutSessionLock";
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
			const deferredData = metadata.data as
				| DeferredAutumnBillingPlanData
				| undefined;
			const lockCustomerId =
				deferredData?.billingContext?.fullCustomer?.id ??
				deferredData?.billingContext?.fullCustomer?.internal_id ??
				customerProduct.internal_customer_id;

			await checkoutSessionLock.expireAndClearIfOwned({
				ctx,
				customerId: lockCustomerId,
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
