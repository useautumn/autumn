import {
	CheckoutStatus,
	cp,
	type DeferredAutumnBillingPlanData,
	type FullCusProduct,
	type FullCustomer,
	type FullProduct,
	type Metadata,
} from "@autumn/shared";
import { createStripeCli } from "@/external/connect/createStripeCli";
import { getStripeInvoice } from "@/external/stripe/invoices/operations/getStripeInvoice.js";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/discardPendingCustomerProduct";
import { getPendingPlanLongLivedCheckout } from "@/internal/billing/v2/execute/pendingCustomerProducts/getPendingPlanLongLivedCheckout";
import { updateCheckoutDbAndCache } from "@/internal/checkouts/actions/updateDbAndCache";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** An open or paid invoice is resumed or awaited by findPendingInvoiceConflict instead. */
const hasLiveInvoice = async ({
	ctx,
	metadata,
}: {
	ctx: AutumnContext;
	metadata: Metadata;
}) => {
	if (!metadata.stripe_invoice_id || metadata.stripe_checkout_session_id) {
		return false;
	}

	const stripeInvoice = await getStripeInvoice({
		stripeClient: createStripeCli({ org: ctx.org, env: ctx.env }),
		invoiceId: metadata.stripe_invoice_id,
		expand: [],
		onNotFound: () => undefined,
	});
	if (stripeInvoice?.status === "paid") return true;
	return (
		stripeInvoice?.status === "open" &&
		Boolean(stripeInvoice.hosted_invoice_url)
	);
};

/** Re-attaching a plan replaces its pending copy on the same customer or entity,
 * closing the long-lived link that sold it. */
export const discardReplacedPendingPlans = async ({
	ctx,
	fullCustomer,
	attachProduct,
	pendingCustomerProducts,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
	pendingCustomerProducts: FullCusProduct[];
}) => {
	const replacedCustomerProducts = pendingCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct)
				.hasProductId({ productId: attachProduct.id })
				.onEntity({ internalEntityId: fullCustomer.entity?.internal_id }).valid,
	);

	for (const customerProduct of replacedCustomerProducts) {
		const metadata = customerProduct.metadata_id
			? await MetadataService.get({
					db: ctx.db,
					id: customerProduct.metadata_id,
				})
			: undefined;
		if (metadata && (await hasLiveInvoice({ ctx, metadata }))) continue;

		const longLivedCheckout =
			metadata &&
			(await getPendingPlanLongLivedCheckout({
				ctx,
				deferredData: metadata.data as DeferredAutumnBillingPlanData,
			}));

		await discardPendingCustomerProduct({ ctx, customerProduct });

		if (longLivedCheckout) {
			await updateCheckoutDbAndCache({
				ctx,
				oldCheckout: longLivedCheckout,
				updates: { status: CheckoutStatus.Expired },
			});
		}
	}
};
