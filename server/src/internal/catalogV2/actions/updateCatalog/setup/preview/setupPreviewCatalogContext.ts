import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupFeatureUsagePersisted } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupFeatureUsagePersisted";
import type { PreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

/** Extension point for preview-only fetches — one field per domain, batched. */
export const setupPreviewCatalogContext = async ({
	ctx,
	params,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
}): Promise<PreviewCatalogContext> => {
	const [featureUsagePersisted] = await Promise.all([
		setupFeatureUsagePersisted({ ctx, params }),
	]);

	return { featureUsagePersisted };
};
