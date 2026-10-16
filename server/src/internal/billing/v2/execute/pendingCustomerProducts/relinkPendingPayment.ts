import {
	CusProductStatus,
	type DeferredAutumnBillingPlanData,
	type FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { CusService } from "@/internal/customers/CusService";
import { CusProductService } from "@/internal/customers/cusProducts/CusProductService";
import { MetadataService } from "@/internal/metadata/MetadataService";

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

	const pendingMetadata = await MetadataService.get({
		db: ctx.db,
		id: metadataId,
	});
	if (!pendingMetadata) return;

	// The deferred plan still inserts the replaced row; the payment webhook must promote the replacement.
	const data = pendingMetadata.data as DeferredAutumnBillingPlanData;
	const autumnBillingPlan = data.billingPlan.autumn;
	await MetadataService.update({
		db: ctx.db,
		id: metadataId,
		updates: {
			data: {
				...data,
				billingPlan: {
					...data.billingPlan,
					autumn: {
						...autumnBillingPlan,
						insertCustomerProducts:
							autumnBillingPlan.insertCustomerProducts?.map((planned) =>
								planned.id === customerProduct.id
									? {
											...replacement,
											status: planned.status,
											created_at: customerProduct.created_at,
											subscription_ids: planned.subscription_ids,
											scheduled_ids: planned.scheduled_ids,
										}
									: planned,
							),
					},
				},
			},
		},
	});
};
