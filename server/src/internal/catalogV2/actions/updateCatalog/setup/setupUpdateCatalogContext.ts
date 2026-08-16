import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupPreviewCatalogContext } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupPreviewCatalogContext";
import { setupFeatureStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupFeatureStatesContext";
import { setupLicenseStatesContext } from "@/internal/catalogV2/actions/updateCatalog/setup/setupLicenseStatesContext";
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

	// Needs the loaded parents' current links, so it runs after product states.
	const licenseStatesContext = await setupLicenseStatesContext({
		ctx,
		productStatesContext,
	});

	return {
		featureStatesContext,
		productStatesContext,
		licenseStatesContext,
		previewContext,
	};
};
