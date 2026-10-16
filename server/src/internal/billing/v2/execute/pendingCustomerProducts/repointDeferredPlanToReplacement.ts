import type {
	DeferredAutumnBillingPlanData,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { MetadataService } from "@/internal/metadata/MetadataService";

/** Makes the deferred plan insert the replacement row, so the payment webhook promotes it instead of the replaced one. */
export const repointDeferredPlanToReplacement = async ({
	ctx,
	metadataId,
	replacedCustomerProduct,
	replacement,
}: {
	ctx: AutumnContext;
	metadataId: string;
	replacedCustomerProduct: FullCusProduct;
	replacement: FullCusProduct;
}) => {
	const pendingMetadata = await MetadataService.get({
		db: ctx.db,
		id: metadataId,
	});
	if (!pendingMetadata) return;

	const data = pendingMetadata.data as DeferredAutumnBillingPlanData;
	const { autumn } = data.billingPlan;
	autumn.insertCustomerProducts = autumn.insertCustomerProducts?.map(
		(planned) =>
			planned.id === replacedCustomerProduct.id
				? {
						...replacement,
						status: planned.status,
						created_at: replacedCustomerProduct.created_at,
						subscription_ids: planned.subscription_ids,
						scheduled_ids: planned.scheduled_ids,
					}
				: planned,
	);

	await MetadataService.update({
		db: ctx.db,
		id: metadataId,
		updates: { data },
	});
};
