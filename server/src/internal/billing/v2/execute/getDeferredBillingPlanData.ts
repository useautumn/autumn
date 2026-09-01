import type {
	DeferredAutumnBillingPlanData,
	FullCusProduct,
} from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { MetadataService } from "@/internal/metadata/MetadataService";

export const getDeferredBillingPlanData = async ({
	ctx,
	customerProduct,
}: {
	ctx: AutumnContext;
	customerProduct: FullCusProduct;
}): Promise<DeferredAutumnBillingPlanData | undefined> => {
	if (!customerProduct.metadata_id) return;

	const metadata = await MetadataService.get({
		db: ctx.db,
		id: customerProduct.metadata_id,
	});

	return metadata?.data as DeferredAutumnBillingPlanData | undefined;
};
