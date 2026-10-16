import { CusProductStatus, type FullCusProduct } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { repointDeferredPlanToReplacement } from "@/internal/billing/v2/execute/pendingCustomerProducts/repointDeferredPlanToReplacement";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";

/** Moves the pending payment onto the row that replaced its plan, so paying grants the replacement. */
export const relinkPendingPayment = async ({
	ctx,
	customerProduct,
	metadataId,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
	metadataId?: string | null;
}) => {
	if (!metadataId) return;

	const fullCustomer = await CusService.getFull({
		ctx,
		idOrInternalId: customerProduct.internal_customer_id,
		inStatuses: [CusProductStatus.Pending],
		withEntities: false,
	});

	const replacement = fullCustomer.customer_products.find(
		(candidate) =>
			candidate.id !== customerProduct.id &&
			candidate.internal_product_id === customerProduct.internal_product_id,
	);

	if (!replacement) return;

	await CusProductService.update({
		ctx,
		cusProductId: replacement.id,
		updates: {
			metadata_id: metadataId,
			created_at: customerProduct.created_at,
		},
	});

	await repointDeferredPlanToReplacement({
		ctx,
		metadataId,
		replacedCustomerProduct: customerProduct,
		replacement,
	});
};
