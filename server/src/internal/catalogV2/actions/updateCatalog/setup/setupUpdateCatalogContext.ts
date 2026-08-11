import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupPreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupPreviewCatalogContext";
import { setupFeatureStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupFeatureStatesContext";
import { setupProductStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupProductStatesContext";
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
	const [featureStatesContext, productStatesContext, previewContext] =
		await Promise.all([
			setupFeatureStatesContext({ ctx, params }),
			setupProductStatesContext({ ctx, params }),
			preview ? setupPreviewCatalogContext({ ctx, params }) : undefined,
		]);

	return { featureStatesContext, productStatesContext, previewContext };
};
