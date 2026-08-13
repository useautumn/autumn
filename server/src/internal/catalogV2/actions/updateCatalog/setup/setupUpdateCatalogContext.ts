import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupPreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupPreviewCatalogContext";
import { setupFeatureStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupFeatureStatesContext";
import type { UpdateCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/types/updateCatalogContext";

export const setupUpdateCatalogContext = async ({
	ctx,
	params,
	preview = false,
}: {
	ctx: AutumnContext;
	params: UpdateCatalogParams;
	preview?: boolean;
}): Promise<UpdateCatalogContext> => {
	const [featureStatesContext, previewContext] = await Promise.all([
		setupFeatureStatesContext({ ctx, params }),
		preview ? setupPreviewCatalogContext({ ctx, params }) : undefined,
	]);

	return { featureStatesContext, previewContext };
};
