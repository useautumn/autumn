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
import { isPayablePendingInvoice } from "@/internal/billing/v2/common/pendingInvoiceConflict/findPendingInvoiceConflict";
import { discardPendingCustomerProduct } from "@/internal/billing/v2/execute/pendingCustomerProducts/discardPendingCustomerProduct";
import { getPendingPlanLongLivedCheckout } from "@/internal/billing/v2/execute/pendingCustomerProducts/getPendingPlanLongLivedCheckout";
import { updateCheckoutDbAndCache } from "@/internal/checkouts/actions/updateDbAndCache";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** Open or paid invoices stay for findPendingInvoiceConflict to resume or wait on. */
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
	return (
		stripeInvoice?.status === "paid" || isPayablePendingInvoice(stripeInvoice)
	);
};

/** Re-attaching a plan replaces its pending copy and closes the long-lived link that sold it.
 * Returns the pending rows left afterwards. */
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
}): Promise<FullCusProduct[]> => {
	const replacedCustomerProducts = pendingCustomerProducts.filter(
		(customerProduct) =>
			cp(customerProduct)
				.recurring()
				.hasProductId({ productId: attachProduct.id })
				.onEntity({ internalEntityId: fullCustomer.entity?.internal_id }).valid,
	);
	const discardedIds = new Set<string>();

	for (const customerProduct of replacedCustomerProducts) {
		const metadata = customerProduct.metadata_id
			? await MetadataService.get({
					db: ctx.db,
					id: customerProduct.metadata_id,
				})
			: null;
		if (metadata && (await hasLiveInvoice({ ctx, metadata }))) continue;

		const longLivedCheckout =
			metadata &&
			(await getPendingPlanLongLivedCheckout({
				ctx,
				deferredData: metadata.data as DeferredAutumnBillingPlanData,
			}));

		await discardPendingCustomerProduct({ ctx, customerProduct });
		discardedIds.add(customerProduct.id);

		if (longLivedCheckout) {
			await updateCheckoutDbAndCache({
				ctx,
				oldCheckout: longLivedCheckout,
				updates: { status: CheckoutStatus.Expired },
			});
		}
	}

	return pendingCustomerProducts.filter(({ id }) => !discardedIds.has(id));
};
