import {
	type BillingResult,
	CusProductStatus,
	cp,
	ErrCode,
	type FullCustomer,
	type FullProduct,
	isOneOffProduct,
	MetadataType,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type Stripe from "stripe";
import { createStripeCli } from "@/external/connect/createStripeCli";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

const unpayableInvoiceMessage = ({
	planName,
	stripeInvoice,
}: {
	planName: string;
	stripeInvoice: Stripe.Invoice;
}) => {
	if (stripeInvoice.status === "paid")
		return `A payment for the pending plan '${planName}' is still processing. Retry once it has been applied.`;
	const reason =
		stripeInvoice.status === "open"
			? "invoice has no payment page"
			: `invoice is ${stripeInvoice.status}`;
	return `The pending plan '${planName}' cannot be paid (${reason}). Cancel or review the pending plan before attaching another plan.`;
};

/** Resumes the open invoice of an invoice-backed pending main plan in the same scope
 * (queried uncapped; checkout-backed rows stay with checkCheckoutSessionLock). */
export const findPendingInvoiceConflict = async ({
	ctx,
	fullCustomer,
	attachProduct,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
}): Promise<BillingResult | undefined> => {
	if (attachProduct.is_add_on || isOneOffProduct({ product: attachProduct }))
		return;

	const pendingCustomerProducts = await CusProductService.list({
		db: ctx.db,
		internalCustomerId: fullCustomer.internal_id,
		inStatuses: [CusProductStatus.Pending],
	});

	for (const customerProduct of pendingCustomerProducts) {
		if (!customerProduct.metadata_id) continue;

		const inScope = cp(customerProduct)
			.main()
			.recurring()
			.hasProductGroup({ productGroup: attachProduct.group })
			.onEntity({ internalEntityId: fullCustomer.entity?.internal_id }).valid;
		if (!inScope) continue;

		const metadata = await MetadataService.get({
			db: ctx.db,
			id: customerProduct.metadata_id,
		});
		const invoiceBacked =
			metadata?.type === MetadataType.DeferredInvoice &&
			Boolean(metadata.stripe_invoice_id) &&
			!metadata.stripe_checkout_session_id;
		if (!invoiceBacked || !metadata?.stripe_invoice_id) continue;

		const stripeCli = createStripeCli({ org: ctx.org, env: ctx.env });
		const stripeInvoice = await stripeCli.invoices.retrieve(
			metadata.stripe_invoice_id,
		);

		if (stripeInvoice.status !== "open" || !stripeInvoice.hosted_invoice_url) {
			throw new RecaseError({
				code: ErrCode.PendingPlanConflict,
				message: unpayableInvoiceMessage({
					planName: customerProduct.product.name,
					stripeInvoice,
				}),
				statusCode: StatusCodes.CONFLICT,
			});
		}

		return {
			stripe: {
				deferred: true,
				deferredMetadataId: metadata.id,
				stripeInvoice,
			},
		};
	}
};
