import {
	type AttachBillingContext,
	CusProductStatus,
	cp,
	ErrCode,
	isOneOffProduct,
	MetadataType,
	RecaseError,
} from "@autumn/shared";
import { StatusCodes } from "http-status-codes";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** A second deferred attach for the same transition would mint a second payable invoice. */
export const handlePendingPlanConflictErrors = async ({
	ctx,
	billingContext,
	preview = false,
}: {
	ctx: AutumnContext;
	billingContext: AttachBillingContext;
	preview?: boolean;
}) => {
	if (preview) return;

	const { attachProduct, fullCustomer } = billingContext;
	if (attachProduct.is_add_on || isOneOffProduct({ product: attachProduct }))
		return;

	for (const customerProduct of fullCustomer.customer_products) {
		if (customerProduct.status !== CusProductStatus.Pending) continue;
		if (!customerProduct.metadata_id) continue;

		const inScope = cp(customerProduct)
			.main()
			.recurring()
			.hasProductGroup({ productGroup: attachProduct.group })
			.onEntity({ internalEntityId: fullCustomer.entity?.internal_id }).valid;
		if (!inScope) continue;

		// Checkout-backed pending plans are arbitrated by checkCheckoutSessionLock.
		const metadata = await MetadataService.get({
			db: ctx.db,
			id: customerProduct.metadata_id,
		});
		const invoiceBacked =
			metadata?.type === MetadataType.DeferredInvoice &&
			Boolean(metadata.stripe_invoice_id) &&
			!metadata.stripe_checkout_session_id;
		if (!invoiceBacked) continue;

		throw new RecaseError({
			code: ErrCode.PendingPlanConflict,
			message: `Cannot attach because a pending plan '${customerProduct.product.name}' is awaiting payment. Pay or cancel it before attaching another plan.`,
			statusCode: StatusCodes.CONFLICT,
		});
	}
};
