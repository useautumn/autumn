import {
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
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** A second deferred attach for the same transition would mint a second payable invoice. */
export const handlePendingPlanConflictErrors = async ({
	ctx,
	fullCustomer,
	attachProduct,
	preview = false,
}: {
	ctx: AutumnContext;
	fullCustomer: FullCustomer;
	attachProduct: FullProduct;
	preview?: boolean;
}) => {
	if (preview) return;
	if (attachProduct.is_add_on || isOneOffProduct({ product: attachProduct }))
		return;

	// fullCustomer.customer_products is capped and orders pending rows last.
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
