import type { UpdateCatalogParams } from "@autumn/shared";
import type { AutumnContext } from "@/honoUtils/HonoEnv";
import { setupFeatureUsagePersisted } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupFeatureUsagePersisted";
import { setupPlanUsagePersisted } from "@/internal/catalogV2/actions/updateCatalog/setup/preview/setupPlanUsagePersisted";
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
	const [featureStatesContext, productStatesContext, featureUsagePersisted] =
		await Promise.all([
			setupFeatureStatesContext({ ctx, params }),
			setupProductStatesContext({ ctx, params }),
			preview ? setupFeatureUsagePersisted({ ctx, params }) : undefined,
		]);

	// License refs + plan-usage samples both need loaded product internal ids.
	const [licenseStatesContext, planUsagePersisted] = await Promise.all([
		setupLicenseStatesContext({ ctx, productStatesContext }),
		preview
			? setupPlanUsagePersisted({ ctx, params, productStatesContext })
			: undefined,
	]);

	return {
		featureStatesContext,
		productStatesContext,
		licenseStatesContext,
		previewContext: preview
			? {
					featureUsagePersisted: featureUsagePersisted ?? {},
					planUsagePersisted: planUsagePersisted ?? {},
				}
			: undefined,
	};
};
